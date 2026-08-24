import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GQL = 'https://graph.facebook.com/v25.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today() {
  return new Date().toISOString().split('T')[0]
}

// Extract numeric action value from Meta actions array
function getAction(actions: Record<string, string>[] | undefined, type: string): number {
  if (!actions) return 0
  const found = actions.find(a => a.action_type === type)
  return found ? parseFloat(found.value) || 0 : 0
}

// Match campaign name to product using pre-loaded products list (no DB call per row)
function matchProduct(products: { id: string; name: string; keywords: string[] }[], campaignName: string): string | null {
  if (!products?.length) return null
  const lower = campaignName.toLowerCase()
  for (const product of products) {
    const toCheck = [product.name, ...(product.keywords || [])]
    for (const kw of toCheck) {
      if (lower.includes(kw.toLowerCase())) return product.id
    }
  }
  return null
}

// Batch upsert helper — chunks to avoid payload limits
async function batchUpsert(records: Record<string, unknown>[]): Promise<{ added: number; errs: string[] }> {
  const CHUNK = 500
  let added = 0
  const errs: string[] = []
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('campaign_metrics')
      .upsert(chunk, { onConflict: 'sync_key' })
    if (!error) added += chunk.length
    else errs.push(error.message)
  }
  return { added, errs }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  let targetUserId: string | null = null
  let daysBack = 30
  let discoverAccounts = true
  if (req.method === 'POST') {
    try {
      const b = await req.json()
      targetUserId = b?.user_id || null
      daysBack = b?.days_back || 30
      discoverAccounts = b?.discover_accounts !== false
    } catch { /* ignore */ }
  }

  // Security: if user_id provided, verify it exists in user_config before processing
  if (targetUserId) {
    const { data: userCheck } = await supabase
      .from('user_config').select('user_id').eq('user_id', targetUserId).single()
    if (!userCheck) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
  }

  // Get users with meta_token
  let cfgQuery = supabase
    .from('user_config')
    .select('user_id, meta_token, usd_rate')
    .not('meta_token', 'is', null)
    .neq('meta_token', '')
  if (targetUserId) cfgQuery = cfgQuery.eq('user_id', targetUserId)
  const { data: configs } = await cfgQuery
  if (!configs?.length) {
    return new Response(JSON.stringify({ ok: true, message: 'no users' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const since = daysAgo(daysBack)
  const until = today()
  const results: Record<string, unknown>[] = []

  const FIELDS = [
    'campaign_id', 'campaign_name',
    'adset_id', 'adset_name',
    'ad_id', 'ad_name',
    'spend', 'impressions', 'clicks', 'reach', 'frequency',
    'ctr', 'cpc', 'cpm',
    'actions', 'action_values', 'purchase_roas',
    'video_avg_time_watched_actions',
    'video_p25_watched_actions',
    'video_p50_watched_actions',
    'video_p75_watched_actions',
    'video_p95_watched_actions',
    'video_p100_watched_actions',
    'video_play_actions',
  ].join(',')

  for (const config of configs) {
    let added = 0
    const errors: string[] = []

    // ── Discover & upsert ad accounts (server-side, token never leaves server) ──
    if (discoverAccounts && config.meta_token) {
      try {
        const aaRes = await fetch(
          `${GQL}/me/adaccounts?fields=id,name,account_status&limit=100&access_token=${config.meta_token}`
        )
        const aaData = await aaRes.json()
        if (!aaData.error) {
          for (const a of (aaData.data || []).filter((x: Record<string,unknown>) => x.account_status === 1)) {
            const actId = String(a.id).startsWith('act_') ? String(a.id) : `act_${a.id}`
            const { data: ex } = await supabase
              .from('ad_accounts').select('id')
              .eq('user_id', config.user_id).eq('ad_account_id', actId).single()
            if (!ex) {
              await supabase.from('ad_accounts').insert({
                user_id: config.user_id, name: a.name, ad_account_id: actId, platform: 'meta',
              })
            }
          }
        }
      } catch (_e) { /* non-fatal: discovery failure doesn't block sync */ }
    }

    // Pre-load products once — avoids one DB query per ad row
    const { data: productsList } = await supabase
      .from('products').select('id, name, keywords').eq('user_id', config.user_id)
    const products = (productsList || []) as { id: string; name: string; keywords: string[] }[]

    // Get all active ad accounts for this user
    const { data: adAccounts } = await supabase
      .from('ad_accounts')
      .select('id, ad_account_id')
      .eq('user_id', config.user_id)
      .neq('ad_account_id', '')
      .not('ad_account_id', 'is', null)

    if (!adAccounts?.length) {
      results.push({ user_id: config.user_id, error: 'no ad accounts' })
      continue
    }

    for (const account of adAccounts) {
      const actId = account.ad_account_id
      try {
        let nextUrl: string | null =
          `${GQL}/${actId}/insights?fields=${FIELDS}&level=ad&time_increment=1` +
          `&time_range={"since":"${since}","until":"${until}"}` +
          `&limit=500&access_token=${config.meta_token}`

        while (nextUrl) {
          const res = await fetch(nextUrl)
          const data = await res.json()

          if (data.error) {
            errors.push(`${actId}: ${data.error.message}`)
            break
          }

          // ── Build records for this page, then batch-upsert once ──
          const pageRecords: Record<string, unknown>[] = []

          for (const row of (data.data || []) as Record<string, unknown>[]) {
            const adId = String(row.ad_id || '')
            const date = String(row.date_start || '').slice(0, 10)
            if (!adId || !date) continue

            const syncKey = `${adId}_${date}`
            const actions = row.actions as Record<string, string>[] | undefined
            const actionValues = row.action_values as Record<string, string>[] | undefined

            const purchases = getAction(actions, 'purchase') || getAction(actions, 'offsite_conversion.fb_pixel_purchase')
            const purchaseValue = getAction(actionValues, 'purchase') || getAction(actionValues, 'offsite_conversion.fb_pixel_purchase')
            const addToCart = getAction(actions, 'add_to_cart') || getAction(actions, 'offsite_conversion.fb_pixel_add_to_cart')
            const initiateCheckout = getAction(actions, 'initiate_checkout') || getAction(actions, 'offsite_conversion.fb_pixel_initiate_checkout')

            const videoPlays = getAction(row.video_play_actions as Record<string, string>[] | undefined, 'video_view')
            const videoAvgWatch = getAction(row.video_avg_time_watched_actions as Record<string, string>[] | undefined, 'video_view')
            const videoP25 = getAction(row.video_p25_watched_actions as Record<string, string>[] | undefined, 'video_view')
            const videoP50 = getAction(row.video_p50_watched_actions as Record<string, string>[] | undefined, 'video_view')
            const videoP75 = getAction(row.video_p75_watched_actions as Record<string, string>[] | undefined, 'video_view')
            const videoP95 = getAction(row.video_p95_watched_actions as Record<string, string>[] | undefined, 'video_view')
            const videoP100 = getAction(row.video_p100_watched_actions as Record<string, string>[] | undefined, 'video_view')

            const purchaseRoasArr = row.purchase_roas as Record<string, string>[] | undefined
            const purchaseRoas = purchaseRoasArr?.[0]?.value ? parseFloat(purchaseRoasArr[0].value) : 0

            const campaignName = String(row.campaign_name || '')
            const productId = matchProduct(products, campaignName)

            pageRecords.push({
              user_id: config.user_id,
              ad_account_id: actId,
              campaign_id: String(row.campaign_id || ''),
              campaign_name: campaignName,
              adset_id: String(row.adset_id || ''),
              adset_name: String(row.adset_name || ''),
              ad_id: adId,
              ad_name: String(row.ad_name || ''),
              date,
              spend: parseFloat(String(row.spend || '0')),
              impressions: parseInt(String(row.impressions || '0')),
              clicks: parseInt(String(row.clicks || '0')),
              reach: parseInt(String(row.reach || '0')),
              frequency: parseFloat(String(row.frequency || '0')),
              ctr: parseFloat(String(row.ctr || '0')),
              cpc: parseFloat(String(row.cpc || '0')),
              cpm: parseFloat(String(row.cpm || '0')),
              purchases: Math.round(purchases),
              purchase_value: purchaseValue,
              add_to_cart: Math.round(addToCart),
              initiate_checkout: Math.round(initiateCheckout),
              purchase_roas: purchaseRoas,
              video_plays: Math.round(videoPlays),
              video_avg_watch_time: videoAvgWatch,
              video_p25: Math.round(videoP25),
              video_p50: Math.round(videoP50),
              video_p75: Math.round(videoP75),
              video_p95: Math.round(videoP95),
              video_p100: Math.round(videoP100),
              product_id: productId,
              sync_key: syncKey,
            })
          }

          // One batch upsert per page instead of one per row
          if (pageRecords.length > 0) {
            const { added: batchAdded, errs } = await batchUpsert(pageRecords)
            added += batchAdded
            errors.push(...errs)
          }

          nextUrl = ((data.paging as Record<string, string>) || {})?.next || null
        }
      } catch (err) {
        errors.push(`${actId}: ${(err as Error).message}`)
      }
    }

    // Update last_sync so the UI shows when cron last ran
    await supabase.from('user_config')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', config.user_id)

    results.push({ user_id: config.user_id, added, errors })
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})

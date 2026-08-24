import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TT_API = 'https://business-api.tiktok.com/open_api/v1.3'

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

function matchProduct(
  products: { id: string; name: string; keywords: string[] }[],
  name: string
): string | null {
  if (!products?.length) return null
  const lower = name.toLowerCase()
  for (const p of products) {
    for (const kw of [p.name, ...(p.keywords || [])]) {
      if (lower.includes(kw.toLowerCase())) return p.id
    }
  }
  return null
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}

// TikTok metric names for ad-level daily report
const METRICS = [
  'campaign_id', 'campaign_name',
  'adgroup_id', 'adgroup_name',
  'ad_id', 'ad_name',
  'spend', 'impressions', 'clicks', 'reach', 'frequency',
  'ctr', 'cpc', 'cpm',
  'complete_payment', 'complete_payment_value',
  'add_to_cart', 'checkout',
  'video_play_actions', 'average_video_play',
  'video_views_p25', 'video_views_p50',
  'video_views_p75', 'video_views_p100',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  let targetUserId: string | null = null
  let daysBack = 30
  if (req.method === 'POST') {
    try {
      const b = await req.json()
      targetUserId = b?.user_id || null
      daysBack = b?.days_back || 30
    } catch { /* ignore */ }
  }

  // Security: verify user_id exists in DB before processing
  if (targetUserId) {
    const { data: userCheck } = await supabase
      .from('user_config').select('user_id').eq('user_id', targetUserId).single()
    if (!userCheck) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
  }

  let cfgQuery = supabase
    .from('user_config')
    .select('user_id, tiktok_token, tiktok_advertiser_ids')
    .not('tiktok_token', 'is', null)
    .neq('tiktok_token', '')
  if (targetUserId) cfgQuery = cfgQuery.eq('user_id', targetUserId)
  const { data: configs } = await cfgQuery

  if (!configs?.length) {
    return new Response(JSON.stringify({ ok: true, message: 'no tiktok users' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const since = daysAgo(daysBack)
  const until = today()
  const results: Record<string, unknown>[] = []

  for (const config of configs) {
    const advertiserIds: string[] = config.tiktok_advertiser_ids || []
    if (!config.tiktok_token || !advertiserIds.length) {
      results.push({ user_id: config.user_id, error: 'no tiktok credentials' })
      continue
    }

    let added = 0
    const errors: string[] = []

    // Pre-load products once
    const { data: productsList } = await supabase
      .from('products').select('id, name, keywords').eq('user_id', config.user_id)
    const products = (productsList || []) as { id: string; name: string; keywords: string[] }[]

    for (const advertiserId of advertiserIds) {
      // Discover & upsert advertiser to ad_accounts
      try {
        const { data: ex } = await supabase.from('ad_accounts').select('id')
          .eq('user_id', config.user_id).eq('ad_account_id', advertiserId).single()
        if (!ex) {
          // Try to get advertiser name from TikTok
          let advName = advertiserId
          try {
            const infoRes = await fetch(
              `${TT_API}/advertiser/info/?advertiser_ids=["${advertiserId}"]`,
              { headers: { 'Access-Token': config.tiktok_token } }
            )
            const infoData = await infoRes.json()
            advName = infoData?.data?.list?.[0]?.advertiser_name || advertiserId
          } catch { /* non-fatal */ }

          await supabase.from('ad_accounts').insert({
            user_id: config.user_id,
            name: advName,
            ad_account_id: advertiserId,
            platform: 'tiktok',
          })
        }
      } catch { /* non-fatal */ }

      // Paginate through report API
      let page = 1
      let totalPages = 1

      while (page <= totalPages) {
        try {
          const body = {
            advertiser_id: advertiserId,
            report_type: 'BASIC',
            data_level: 'AUCTION_AD',
            dimensions: ['ad_id', 'stat_time_day'],
            metrics: METRICS,
            start_date: since,
            end_date: until,
            page_size: 1000,
            page,
          }

          const res = await fetch(`${TT_API}/report/integrated/get/`, {
            method: 'POST',
            headers: {
              'Access-Token': config.tiktok_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          })
          const data = await res.json()

          if (data.code !== 0) {
            errors.push(`${advertiserId} p${page}: ${data.message}`)
            break
          }

          const pageInfo = data.data?.page_info
          if (pageInfo?.total_page) totalPages = pageInfo.total_page

          for (const row of (data.data?.list || [])) {
            const dim = row.dimensions || {}
            const m   = row.metrics   || {}

            const adId = String(dim.ad_id || '')
            const date = String(dim.stat_time_day || '').slice(0, 10)
            if (!adId || !date) continue

            const syncKey      = `tt_${adId}_${date}`
            const campaignName = String(m.campaign_name || '')
            const productId    = matchProduct(products, campaignName)

            const spend        = parseFloat(String(m.spend || '0'))
            const purchaseVal  = parseFloat(String(m.complete_payment_value || '0'))
            const purchases    = Math.round(parseFloat(String(m.complete_payment || '0')))
            const addToCart    = Math.round(parseFloat(String(m.add_to_cart || '0')))
            const checkout     = Math.round(parseFloat(String(m.checkout || '0')))
            const impressions  = parseInt(String(m.impressions || '0'))
            const clicks       = parseInt(String(m.clicks || '0'))
            const reach        = parseInt(String(m.reach || '0'))
            const videoPlays   = Math.round(parseFloat(String(m.video_play_actions || '0')))
            const videoAvg     = parseFloat(String(m.average_video_play || '0'))
            const videoP25     = Math.round(parseFloat(String(m.video_views_p25 || '0')))
            const videoP50     = Math.round(parseFloat(String(m.video_views_p50 || '0')))
            const videoP75     = Math.round(parseFloat(String(m.video_views_p75 || '0')))
            const videoP100    = Math.round(parseFloat(String(m.video_views_p100 || '0')))
            const roas         = spend > 0 ? purchaseVal / spend : 0

            const record = {
              user_id:           config.user_id,
              platform:          'tiktok',
              ad_account_id:     advertiserId,
              campaign_id:       String(m.campaign_id || ''),
              campaign_name:     campaignName,
              adset_id:          String(m.adgroup_id || ''),
              adset_name:        String(m.adgroup_name || ''),
              ad_id:             adId,
              ad_name:           String(m.ad_name || ''),
              date,
              spend,
              impressions,
              clicks,
              reach,
              frequency:         parseFloat(String(m.frequency || '0')),
              ctr:               parseFloat(String(m.ctr || '0')),
              cpc:               parseFloat(String(m.cpc || '0')),
              cpm:               parseFloat(String(m.cpm || '0')),
              purchases,
              purchase_value:    purchaseVal,
              add_to_cart:       addToCart,
              initiate_checkout: checkout,
              purchase_roas:     roas,
              video_plays:       videoPlays,
              video_avg_watch_time: videoAvg,
              video_p25:         videoP25,
              video_p50:         videoP50,
              video_p75:         videoP75,
              video_p95:         0,           // TikTok doesn't expose P95
              video_p100:        videoP100,
              product_id:        productId,
              sync_key:          syncKey,
            }

            const { error } = await supabase
              .from('campaign_metrics')
              .upsert(record, { onConflict: 'sync_key' })

            if (!error) added++
            else errors.push(`${syncKey}: ${error.message}`)
          }

          page++
        } catch (err) {
          errors.push(`${advertiserId} p${page}: ${(err as Error).message}`)
          break
        }
      }
    }

    results.push({ user_id: config.user_id, added, errors })
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})

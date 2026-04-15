import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GQL = 'https://graph.facebook.com/v25.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function today() {
  return new Date().toISOString().split('T')[0]
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
  // Allow manual trigger via POST with optional user_id filter
  let targetUserId: string | null = null
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      targetUserId = body?.user_id || null
    } catch {}
  }

  // Get all users that have a meta_token configured
  let query = supabase
    .from('user_config')
    .select('user_id, meta_token, usd_rate')
    .neq('meta_token', '')
    .not('meta_token', 'is', null)

  if (targetUserId) {
    query = query.eq('user_id', targetUserId)
  }

  const { data: configs, error: configErr } = await query
  if (configErr) {
    return new Response(JSON.stringify({ error: configErr.message }), { status: 500 })
  }

  const results: Record<string, unknown>[] = []

  for (const config of configs || []) {
    const { data: accounts } = await supabase
      .from('ad_accounts')
      .select('*')
      .eq('user_id', config.user_id)
      .eq('platform', 'meta')
      .not('ad_account_id', 'is', null)

    if (!accounts?.length) {
      results.push({ user_id: config.user_id, skipped: 'no meta accounts' })
      continue
    }

    const since = daysAgo(3)  // últimos 3 días para capturar datos tardíos de Meta
    const until = today()
    let added = 0
    const errors: string[] = []

    for (const acct of accounts) {
      const actId = acct.ad_account_id.startsWith('act_')
        ? acct.ad_account_id
        : `act_${acct.ad_account_id}`

      try {
        const url = `${GQL}/${actId}/insights?fields=spend,account_currency&time_range={"since":"${since}","until":"${until}"}&time_increment=1&access_token=${config.meta_token}`
        const res = await fetch(url)
        const data = await res.json()

        if (data.error) {
          errors.push(`${acct.name}: ${data.error.message}`)
          continue
        }

        for (const day of data.data || []) {
          const spendUSD = parseFloat(day.spend) || 0
          if (spendUSD === 0) continue

          const syncKey = `${actId}_${day.date_start}`

          // Verificar si ya existe
          const { data: existing } = await supabase
            .from('invoices')
            .select('id')
            .eq('meta_sync_key', syncKey)
            .single()

          if (existing) continue

          const { error: insertErr } = await supabase.from('invoices').insert({
            user_id: config.user_id,
            account_id: acct.id,
            platform: 'meta',
            date: day.date_start,
            amount_usd: spendUSD,
            amount_cop: Math.round(spendUSD * (config.usd_rate || 4200)),
            currency: day.account_currency || 'USD',
            concept: `Gasto publicitario ${day.date_start}`,
            payment_status: 'pagado',
            status: 'nueva',
            source: 'auto_sync',
            meta_sync_key: syncKey,
          })

          if (!insertErr) added++
        }
      } catch (err) {
        errors.push(`${acct.name}: ${(err as Error).message}`)
      }
    }

    // Actualizar last_sync
    await supabase
      .from('user_config')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', config.user_id)

    // Guardar log
    await supabase.from('sync_log').insert({
      user_id: config.user_id,
      added,
      errors,
    })

    results.push({ user_id: config.user_id, added, errors })
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

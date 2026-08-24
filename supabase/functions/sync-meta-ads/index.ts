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

async function autoDetectCard(userId: string, fundingSource: Record<string, string> | null, usdRate: number) {
  if (!fundingSource?.display_string) return null
  const allMatches = fundingSource.display_string.match(/\d{4}/g)
  const match = allMatches ? [allMatches[allMatches.length - 1]] : null
  const last4 = match ? match[0] : null
  if (!last4) return null

  const cardType = fundingSource.display_string.toLowerCase().includes('mastercard') ? 'mastercard'
    : fundingSource.display_string.toLowerCase().includes('amex') ? 'amex' : 'visa'

  const { data: existing } = await supabase
    .from('credit_cards')
    .select('id')
    .eq('user_id', userId)
    .eq('last4', last4)
    .single()

  if (existing) return existing.id

  const { data: newCard } = await supabase
    .from('credit_cards')
    .insert({ user_id: userId, name: fundingSource.display_string, last4, bank: '', card_type: cardType })
    .select()
    .single()

  return newCard?.id || null
}

Deno.serve(async (req) => {
  let targetUserId: string | null = null
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      targetUserId = body?.user_id || null
    } catch { /* ignore */ }
  }

  let query = supabase
    .from('user_config')
    .select('user_id, meta_token, usd_rate')
    .neq('meta_token', '')
    .not('meta_token', 'is', null)

  if (targetUserId) query = query.eq('user_id', targetUserId)

  const { data: configs, error: configErr } = await query
  if (configErr) {
    return new Response(JSON.stringify({ error: configErr.message }), { status: 500 })
  }

  const results: Record<string, unknown>[] = []

  for (const config of configs || []) {
    const usdRate = config.usd_rate || 4200
    let added = 0
    const errors: string[] = []

    // Paso 1: Descubrir cuentas publicitarias
    let metaAcctsList: Record<string, unknown>[] = []
    try {
      const discoverUrl = `${GQL}/me/adaccounts?fields=id,name,account_status,funding_source_details&limit=100&access_token=${config.meta_token}`
      const res = await fetch(discoverUrl)
      const data = await res.json()
      if (data.error) {
        results.push({ user_id: config.user_id, error: data.error.message })
        continue
      }
      metaAcctsList = (data.data || []).filter((a: Record<string, unknown>) => a.account_status === 1)
    } catch (err) {
      results.push({ user_id: config.user_id, error: (err as Error).message })
      continue
    }

    // Paso 2: Auto-crear tarjetas y cuentas
    const accountMap: Record<string, string> = {}
    for (const metaAcct of metaAcctsList) {
      const actId = (metaAcct.id as string).startsWith('act_') ? metaAcct.id as string : `act_${metaAcct.id}`
      const cardId = await autoDetectCard(config.user_id, metaAcct.funding_source_details as Record<string, string> | null, usdRate)

      const { data: existing } = await supabase
        .from('ad_accounts')
        .select('id, credit_card_id')
        .eq('user_id', config.user_id)
        .eq('ad_account_id', actId)
        .single()

      if (existing) {
        accountMap[actId] = existing.id
        if (cardId && !existing.credit_card_id)
          await supabase.from('ad_accounts').update({ credit_card_id: cardId }).eq('id', existing.id)
      } else {
        const { data: newAcct } = await supabase
          .from('ad_accounts')
          .insert({ user_id: config.user_id, name: metaAcct.name, ad_account_id: actId, platform: 'meta', credit_card_id: cardId })
          .select()
          .single()
        if (newAcct) accountMap[actId] = newAcct.id
      }
    }

    // Paso 3: Sincronizar cobros reales a la tarjeta (transactions, no insights)
    const since = daysAgo(30)
    const until = today()

    for (const [actId, accountDbId] of Object.entries(accountMap)) {
      try {
        let nextUrl: string | null = `${GQL}/${actId}/transactions?fields=id,amount,currency,status,time_created&time_range={"since":"${since}","until":"${until}"}&limit=100&access_token=${config.meta_token}`
        while (nextUrl) {
          const res = await fetch(nextUrl)
          const data = await res.json()

          if (data.error) { errors.push(`${actId}: ${data.error.message}`); break }

          for (const tx of (data.data || []) as Record<string, unknown>[]) {
            // Solo cobros exitosos — ignorar errores/fallos
            const s = String(tx.status).toUpperCase()
            if (s !== 'SETTLED' && s !== '1' && s !== 'SUCCESS' && s !== 'SUCCESSFUL') continue

            const amount = parseFloat(String(tx.amount)) || 0
            if (amount === 0) continue

            // Dedup por transaction_id único de Meta
            const { data: existing } = await supabase.from('invoices').select('id').eq('transaction_id', String(tx.id)).single()
            if (existing) continue

            const currency = (tx.currency as string) || 'COP'
            const isCOP = currency === 'COP'
            const amountCop = isCOP ? Math.round(amount) : Math.round(amount * usdRate)
            const amountUsd = isCOP ? parseFloat((amount / usdRate).toFixed(2)) : amount

            const tc = tx.time_created
            const date = typeof tc === 'number'
              ? new Date((tc as number) * 1000).toISOString().split('T')[0]
              : String(tc || '').slice(0, 10)

            const { error: insertErr } = await supabase.from('invoices').insert({
              user_id: config.user_id,
              account_id: accountDbId,
              platform: 'meta',
              date,
              amount_usd: amountUsd,
              amount_cop: amountCop,
              currency,
              concept: 'Cobro Meta Ads',
              payment_status: 'pagado',
              status: 'nueva',
              source: 'api',
              transaction_id: String(tx.id),
              meta_sync_key: `${actId}_${tx.id}`,
            })
            if (!insertErr) added++
          }
          nextUrl = ((data.paging as Record<string, string>) || {})?.next || null
        }
      } catch (err) {
        errors.push(`${actId}: ${(err as Error).message}`)
      }
    }

    await supabase.from('user_config').update({ last_sync: new Date().toISOString() }).eq('user_id', config.user_id)
    await supabase.from('sync_log').insert({ user_id: config.user_id, added, errors })
    results.push({ user_id: config.user_id, accounts_found: metaAcctsList.length, added, errors })
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

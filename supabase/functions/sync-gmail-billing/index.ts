import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const GMAIL_CLIENT_ID     = Deno.env.get('GMAIL_CLIENT_ID')!
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!
const GMAIL_REFRESH_TOKEN = Deno.env.get('GMAIL_REFRESH_TOKEN')!

// ─── OAuth2 ───────────────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`OAuth error: ${JSON.stringify(data)}`)
  return data.access_token
}

// ─── Gmail: buscar emails de Meta billing ─────────────────────────────────────
// Meta envía desde noreply@business-updates.facebook.com
// Asunto: "Tu recibo de anuncios de Meta (identificador de la cuenta: XXXXXXX)"
async function searchEmailIds(token: string, daysBack = 7): Promise<string[]> {
  const after = Math.floor((Date.now() - daysBack * 86400000) / 1000)
  const q = encodeURIComponent(`from:business-updates.facebook.com subject:"recibo de anuncios" after:${after}`)
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (data.error) throw new Error(`Gmail search error: ${data.error.message}`)
  return (data.messages || []).map((m: { id: string }) => m.id)
}

// ─── Gmail: obtener email completo ────────────────────────────────────────────
async function getEmail(token: string, messageId: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()

  const headers: { name: string; value: string }[] = data.payload?.headers || []
  const subject    = headers.find(h => h.name === 'Subject')?.value || ''
  const dateHeader = headers.find(h => h.name === 'Date')?.value || ''
  const date       = dateHeader ? new Date(dateHeader).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

  // Deno's atob no maneja UTF-8 correctamente — usar TextDecoder
  const decode = (b64: string): string => {
    try {
      const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new TextDecoder('utf-8').decode(bytes)
    } catch { return '' }
  }

  const extractText = (part: Record<string, unknown>): string => {
    if (part.mimeType === 'text/plain') {
      return decode((part.body as Record<string, string>)?.data || '')
    }
    if (part.mimeType === 'text/html') {
      return decode((part.body as Record<string, string>)?.data || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    }
    if (Array.isArray(part.parts)) {
      const plain = (part.parts as Record<string, unknown>[]).find(p => p.mimeType === 'text/plain')
      if (plain) return extractText(plain)
      return (part.parts as Record<string, unknown>[]).map(extractText).join('\n')
    }
    return ''
  }

  let body = extractText(data.payload || {})
  if (!body && data.payload?.body?.data) {
    body = decode((data.payload.body as Record<string, string>).data)
  }

  return { subject, body, date }
}

// ─── Parser ───────────────────────────────────────────────────────────────────
// Formato real confirmado:
//   Asunto: "Tu recibo de anuncios de Meta (identificador de la cuenta: 1586997108517523)"
//   Cuerpo: "Número de referencia: ZVUBSK9AW2"   ← lo que aparece en el extracto de tarjeta
//           "Identificador de la transacción: 27007562068934326-27007562145600985"
//           "Importe facturado: $ 242.922 COP"  (punto = miles)
//           "Mastercard ···· 0159"
//           "14 abr. 2026"
function parseMetaEmail(subject: string, body: string, emailDate: string) {
  if (!/recibo de anuncios/i.test(subject)) return null

  // act_id del asunto
  const actMatch = subject.match(/identificador de la cuenta:\s*(\d{10,})/i)
  const actId = actMatch ? `act_${actMatch[1]}` : null

  // Número de referencia — aparece en el extracto de tarjeta (ej: ZVUBSK9AW2)
  const refMatch = body.match(/N[uú]mero de referencia[:\s]+([A-Z0-9]{6,20})/i)
  const referenceNumber = refMatch ? refMatch[1].trim() : null

  // ID de transacción largo — solo para dedup interno (meta_sync_key)
  const txMatch = body.match(/identificador de la transacci[oó]n:\s*(\d{10,}-\d{10,})/i)
    || body.match(/(\d{15,}-\d{15,})/)
  const metaTransactionId = txMatch ? txMatch[1].trim() : null

  // Necesitamos al menos uno de los dos para deduplicar
  if (!referenceNumber && !metaTransactionId) return null

  // Monto COP
  const copMatch = body.match(/Importe facturado:\s*\$\s*([\d.]+)\s*COP/i)
    || body.match(/TOTAL:\s*\$\s*([\d.]+)\s*COP/i)
    || body.match(/\$\s*([\d.]+)\s*COP/i)
  const amountCop = copMatch ? parseInt(copMatch[1].replace(/\./g, ''), 10) : null
  if (!amountCop) return null

  // Last4 de tarjeta
  const cardMatch = body.match(/(?:Mastercard|Visa|Amex)[^\d]*(\d{4})/i)
  const last4 = cardMatch ? cardMatch[1] : null

  // Fecha del intervalo
  let date = emailDate
  const dateMatch = body.match(/(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.\s+(\d{4})/i)
  if (dateMatch) {
    const months: Record<string, string> = {
      ene:'01', feb:'02', mar:'03', abr:'04', may:'05', jun:'06',
      jul:'07', ago:'08', sep:'09', oct:'10', nov:'11', dic:'12',
    }
    const m = months[dateMatch[2].toLowerCase()]
    if (m) date = `${dateMatch[3]}-${m}-${dateMatch[1].padStart(2, '0')}`
  }

  return { referenceNumber, metaTransactionId, actId, amountCop, last4, date }
}

// ─── Resolver cuenta ──────────────────────────────────────────────────────────
async function resolveAccount(userId: string, actId: string | null, last4: string | null) {
  if (actId) {
    const { data } = await supabase
      .from('ad_accounts').select('id, credit_card_id')
      .eq('user_id', userId).eq('ad_account_id', actId).single()
    if (data) return data
  }
  if (last4) {
    const { data: card } = await supabase
      .from('credit_cards').select('id')
      .eq('user_id', userId).eq('last4', last4).single()
    if (card) {
      const { data } = await supabase
        .from('ad_accounts').select('id, credit_card_id')
        .eq('user_id', userId).eq('credit_card_id', card.id)
        .limit(1).single()
      if (data) return data
    }
  }
  return null
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  let targetUserId: string | null = null
  if (req.method === 'POST') {
    try { const b = await req.json(); targetUserId = b?.user_id || null } catch { /* ignore */ }
  }

  let cfgQuery = supabase.from('user_config').select('user_id, usd_rate')
    .not('meta_token', 'is', null).neq('meta_token', '')
  if (targetUserId) cfgQuery = cfgQuery.eq('user_id', targetUserId)
  const { data: configs } = await cfgQuery
  if (!configs?.length) {
    return new Response(JSON.stringify({ ok: true, message: 'no users' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const messageIds = await searchEmailIds(accessToken, 30)
  const results: Record<string, unknown>[] = []

  for (const config of configs) {
    const usdRate = config.usd_rate || 4200
    let added = 0
    const errors: string[] = []

    for (const msgId of messageIds) {
      try {
        const { subject, body, date } = await getEmail(accessToken, msgId)
        const billing = parseMetaEmail(subject, body, date)
        if (!billing) continue

        // Dedup por número de referencia (lo que aparece en el extracto de tarjeta)
        // Fallback al ID de transacción de Meta si no hay referencia
        const dedupKey = billing.referenceNumber || billing.metaTransactionId
        if (!dedupKey) continue

        const { data: existingRef } = await supabase.from('invoices').select('id')
          .eq('transaction_id', dedupKey).single()
        if (existingRef) continue

        // También verificar por meta_sync_key para no duplicar si ya existía con el ID largo
        if (billing.metaTransactionId) {
          const { data: existingMeta } = await supabase.from('invoices').select('id')
            .eq('meta_sync_key', billing.metaTransactionId).single()
          if (existingMeta) continue
        }

        const account = await resolveAccount(config.user_id, billing.actId, billing.last4)
        const amountUsd = parseFloat((billing.amountCop / usdRate).toFixed(2))

        const { error } = await supabase.from('invoices').insert({
          user_id:        config.user_id,
          account_id:     account?.id || null,
          platform:       'meta',
          date:           billing.date,
          amount_cop:     billing.amountCop,
          amount_usd:     amountUsd,
          currency:       'COP',
          concept:        'Cobro Meta Ads',
          payment_status: 'pagado',
          status:         'nueva',
          source:         'api',
          transaction_id: dedupKey,                         // Número de referencia (ej: ZVUBSK9AW2)
          meta_sync_key:  billing.metaTransactionId || dedupKey, // ID largo de Meta
        })

        if (!error) added++
        else errors.push(`${dedupKey}: ${error.message}`)
      } catch (err) {
        errors.push(`msg ${msgId}: ${(err as Error).message}`)
      }
    }

    await supabase.from('sync_log').insert({ user_id: config.user_id, added, errors })
    results.push({ user_id: config.user_id, emails_found: messageIds.length, added, errors })
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

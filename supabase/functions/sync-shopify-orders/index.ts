import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function matchProduct(products: { id: string; name: string; keywords: string[] }[], title: string): string | null {
  if (!products?.length) return null
  const lower = title.toLowerCase()
  for (const product of products) {
    const toCheck = [product.name, ...(product.keywords || [])]
    for (const kw of toCheck) {
      if (lower.includes(kw.toLowerCase())) return product.id
    }
  }
  return null
}

Deno.serve(async (req) => {
  let targetUserId: string | null = null
  let daysBack = 30
  if (req.method === 'POST') {
    try {
      const b = await req.json()
      targetUserId = b?.user_id || null
      daysBack = b?.days_back || 30
    } catch { /* ignore */ }
  }

  let cfgQuery = supabase
    .from('user_config')
    .select('user_id, shopify_token, shopify_store')
    .not('shopify_token', 'is', null)
    .neq('shopify_token', '')
  if (targetUserId) cfgQuery = cfgQuery.eq('user_id', targetUserId)
  const { data: configs } = await cfgQuery
  if (!configs?.length) {
    return new Response(JSON.stringify({ ok: true, message: 'no shopify users' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const since = `${daysAgo(daysBack)}T00:00:00-05:00`
  const results: Record<string, unknown>[] = []

  for (const config of configs) {
    if (!config.shopify_store || !config.shopify_token) continue
    const base = `https://${config.shopify_store}/admin/api/2024-01`
    const headers = {
      'X-Shopify-Access-Token': config.shopify_token,
      'Content-Type': 'application/json',
    }

    const errors: string[] = []
    // Map: "shopify_product_id_date" → aggregated metrics
    const daily: Record<string, {
      date: string
      shopify_product_id: string
      product_title: string
      orders: number
      units_sold: number
      gross_revenue: number
      product_id: string | null
    }> = {}

    // Pre-load products once
    const { data: productsList } = await supabase
      .from('products').select('id, name, keywords').eq('user_id', config.user_id)
    const products = (productsList || []) as { id: string; name: string; keywords: string[] }[]

    try {
      let url: string | null =
        `${base}/orders.json?status=any&financial_status=paid&created_at_min=${since}&limit=250&fields=id,created_at,line_items,financial_status`

      while (url) {
        const res = await fetch(url, { headers })
        const data = await res.json()
        if (data.errors) { errors.push(JSON.stringify(data.errors)); break }

        for (const order of (data.orders || [])) {
          const date = String(order.created_at || '').slice(0, 10)
          for (const item of (order.line_items || [])) {
            const pid = String(item.product_id || 'unknown')
            const title = String(item.title || '')
            const key = `${pid}_${date}`
            if (!daily[key]) {
              daily[key] = {
                date,
                shopify_product_id: pid,
                product_title: title,
                orders: 0,
                units_sold: 0,
                gross_revenue: 0,
                product_id: null,
              }
            }
            daily[key].orders += 1
            daily[key].units_sold += parseInt(String(item.quantity || '0'))
            daily[key].gross_revenue += parseFloat(String(item.price || '0')) * parseInt(String(item.quantity || '0'))
          }
        }

        // Shopify pagination via Link header
        const linkHeader = res.headers.get('Link') || ''
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        url = nextMatch ? nextMatch[1] : null
      }

      // Resolve products and upsert
      let added = 0
      for (const [syncKey, row] of Object.entries(daily)) {
        row.product_id = matchProduct(products, row.product_title)
        const { error } = await supabase
          .from('shopify_metrics')
          .upsert({
            user_id: config.user_id,
            date: row.date,
            product_id: row.product_id,
            product_title: row.product_title,
            shopify_product_id: row.shopify_product_id,
            orders: row.orders,
            units_sold: row.units_sold,
            gross_revenue: parseFloat(row.gross_revenue.toFixed(2)),
            sync_key: syncKey,
          }, { onConflict: 'sync_key' })
        if (!error) added++
        else errors.push(`${syncKey}: ${error.message}`)
      }

      results.push({ user_id: config.user_id, added, errors })
    } catch (err) {
      results.push({ user_id: config.user_id, error: (err as Error).message })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

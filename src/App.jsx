import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

const today = () => new Date().toISOString().split('T')[0]
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0] }
const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtUSD = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0)
const GQL = 'https://graph.facebook.com/v25.0'

const STATUS = {
  nueva: { label: 'Nueva', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', icon: '●' },
  por_retirar: { label: 'Por retirar', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', icon: '◐' },
  en_transito: { label: 'En tránsito', color: '#8B5CF6', bg: 'rgba(139,92,252,0.08)', icon: '◑' },
  liquidada: { label: 'Liquidada', color: '#10B981', bg: 'rgba(16,185,129,0.08)', icon: '✓' },
}

const T = {
  bg: '#F6F7F9', surface: '#FFFFFF', surface2: '#F0F1F5', border: '#E2E5EB',
  text: '#1A1D26', textS: '#4A5066', dim: '#8E95A9', accent: '#1A56DB',
  accentBg: 'rgba(26,86,219,0.06)', green: '#059669', greenBg: 'rgba(5,150,105,0.06)',
  red: '#DC2626', redBg: 'rgba(220,38,38,0.06)', yellow: '#D97706', yellowBg: 'rgba(217,119,6,0.06)',
  purple: '#7C3AED', orange: '#EA580C', orangeBg: 'rgba(234,88,12,0.06)',
  tiktok: '#010101', tiktokBg: 'rgba(1,1,1,0.04)',
}
const inp = { background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" }

// ── UI Components ──
const Btn = ({ children, onClick, v = 'primary', s = 'md', style: sx = {}, disabled }) => {
  const vs = { primary: { background: T.accent, color: '#fff', border: 'none' }, secondary: { background: T.surface, color: T.textS, border: `1.5px solid ${T.border}` }, danger: { background: T.redBg, color: T.red, border: `1px solid ${T.red}20` }, ghost: { background: 'transparent', color: T.dim, border: 'none', padding: '4px 8px' }, success: { background: T.green, color: '#fff', border: 'none' }, warning: { background: T.yellow, color: '#fff', border: 'none' }, tiktok: { background: T.tiktok, color: '#fff', border: 'none' } }
  const ss = { sm: { padding: '6px 12px', fontSize: 12 }, md: { padding: '9px 18px', fontSize: 13 }, lg: { padding: '12px 26px', fontSize: 14 } }
  return <button onClick={onClick} disabled={disabled} style={{ ...vs[v], ...ss[s], borderRadius: 10, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'DM Sans', sans-serif", opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', ...sx }}>{children}</button>
}
const StatusBadge = ({ status }) => { const s = STATUS[status] || STATUS.nueva; return <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg }}>{s.icon} {s.label}</span> }
const PlatBadge = ({ platform }) => { const m = { meta: { l: 'Ⓜ Meta', c: T.accent, bg: T.accentBg }, tiktok: { l: '♪ TikTok', c: T.tiktok, bg: T.tiktokBg } }; const p = m[platform] || m.meta; return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: p.c, background: p.bg }}>{p.l}</span> }
const PayBadge = ({ status }) => { const c = { pagado: T.green, error: T.red, pendiente: T.yellow }; const l = { pagado: 'Pagado', error: 'Error', pendiente: 'Pendiente' }; const s = status || 'pagado'; return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: c[s], background: `${c[s]}10` }}>{l[s]}</span> }
const Field = ({ label, sub, children }) => <div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textS, marginBottom: 5 }}>{label}</label>{children}{sub && <p style={{ margin: '4px 0 0', fontSize: 11, color: T.dim }}>{sub}</p>}</div>

const Modal = ({ open, onClose, title, children, w = 560 }) => {
  if (!open) return null
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, width: '100%', maxWidth: w, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: T.surface, borderRadius: '18px 18px 0 0', zIndex: 1 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
        <button onClick={onClose} style={{ background: T.surface2, border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: T.dim, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
}

// ═══════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════
function LoginPage({ onAuth }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login')

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pass })
        if (error) throw error
        // Auto-create user_config
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await supabase.from('user_config').upsert({ user_id: user.id, meta_token: '', usd_rate: 4200 })
      }
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 20 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, fontFamily: "'DM Mono', monospace" }}>F</span>
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>FactuControl</span>
        </div>
        <p style={{ textAlign: 'center', color: T.textS, fontSize: 14, margin: '0 0 28px' }}>
          {mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
        </p>
        <form onSubmit={handleSubmit}>
          <Field label="Correo electrónico"><input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required /></Field>
          <Field label="Contraseña"><input style={inp} type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required minLength={6} /></Field>
          {error && <p style={{ color: T.red, fontSize: 13, margin: '0 0 16px', padding: '8px 12px', background: T.redBg, borderRadius: 8 }}>{error}</p>}
          <Btn onClick={() => {}} style={{ width: '100%', justifyContent: 'center', padding: '12px 0' }} disabled={loading}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </Btn>
        </form>
        <p style={{ textAlign: 'center', margin: '20px 0 0', fontSize: 13, color: T.dim }}>
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }} style={{ background: 'none', border: 'none', color: T.accent, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// MAIN APP (authenticated)
// ═══════════════════════════════════════
function Dashboard({ user }) {
  const [cards, setCards] = useState([])
  const [accounts, setAccounts] = useState([])
  const [invoices, setInvoices] = useState([])
  const [batches, setBatches] = useState([])
  const [config, setConfig] = useState({ meta_token: '', usd_rate: 4200, last_sync: null })
  const [tab, setTab] = useState('panel')
  const [modal, setModal] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPlat, setFilterPlat] = useState('all')
  const [search, setSearch] = useState('')
  const [dataLoaded, setDataLoaded] = useState(false)

  // ── Load all data ──
  const loadData = useCallback(async () => {
    const [c, a, i, b, cfg] = await Promise.all([
      supabase.from('credit_cards').select('*').order('created_at'),
      supabase.from('ad_accounts').select('*').order('created_at'),
      supabase.from('invoices').select('*').order('date', { ascending: false }),
      supabase.from('batches').select('*').order('created_at', { ascending: false }),
      supabase.from('user_config').select('*').eq('user_id', user.id).single(),
    ])
    if (c.data) setCards(c.data)
    if (a.data) setAccounts(a.data)
    if (i.data) setInvoices(i.data)
    if (b.data) setBatches(b.data)
    if (cfg.data) setConfig(cfg.data)
    else await supabase.from('user_config').upsert({ user_id: user.id, meta_token: '', usd_rate: 4200 })
    setDataLoaded(true)
  }, [user.id])

  useEffect(() => { loadData() }, [loadData])

  // ── Helpers ──
  const acctName = id => accounts.find(a => a.id === id)?.name || '—'
  const cardLabel = id => { const c = cards.find(x => x.id === id); return c ? `${c.name} ••${c.last4}` : '—' }
  const cardForAccount = acctId => { const a = accounts.find(x => x.id === acctId); return a ? cards.find(c => c.id === a.credit_card_id) : null }

  const pending = invoices.filter(i => i.status === 'nueva')
  const porRetirar = invoices.filter(i => i.status === 'por_retirar')
  const enTransito = invoices.filter(i => i.status === 'en_transito')
  const liquidadas = invoices.filter(i => i.status === 'liquidada')
  const errorInv = invoices.filter(i => i.payment_status === 'error')

  const pendingByCard = {}
  ;[...pending, ...porRetirar].forEach(inv => {
    const card = cardForAccount(inv.account_id)
    if (card) { if (!pendingByCard[card.id]) pendingByCard[card.id] = { card, total: 0, count: 0 }; pendingByCard[card.id].total += Number(inv.amount_cop) || 0; pendingByCard[card.id].count += 1 }
  })
  const totalPending = Object.values(pendingByCard).reduce((s, x) => s + x.total, 0)

  const metaAccounts = accounts.filter(a => a.platform === 'meta')
  const tiktokAccounts = accounts.filter(a => a.platform === 'tiktok')

  // ── META SYNC ──
  const syncMeta = async () => {
    if (!config.meta_token) { setSyncMsg('⚠ Configura tu token'); return }
    const metaAccts = accounts.filter(a => a.platform === 'meta' && a.ad_account_id)
    if (!metaAccts.length) { setSyncMsg('⚠ Sin cuentas Meta con ID'); return }
    setSyncing(true); let added = 0, errors = []
    const since = daysAgo(14), until = today()

    for (const acct of metaAccts) {
      const actId = acct.ad_account_id.startsWith('act_') ? acct.ad_account_id : `act_${acct.ad_account_id}`
      setSyncMsg(`Leyendo ${acct.name}...`)
      try {
        const url = `${GQL}/${actId}/insights?fields=spend,account_currency&time_range={"since":"${since}","until":"${until}"}&time_increment=1&access_token=${config.meta_token}`
        const res = await fetch(url); const data = await res.json()
        if (data.error) { errors.push(`${acct.name}: ${data.error.message}`); continue }
        if (data.data) {
          for (const day of data.data) {
            const spendUSD = parseFloat(day.spend) || 0
            if (spendUSD === 0) continue
            const syncKey = `${actId}_${day.date_start}`
            const { data: existing } = await supabase.from('invoices').select('id').eq('meta_sync_key', syncKey).single()
            if (existing) continue
            const { error: insertErr } = await supabase.from('invoices').insert({
              user_id: user.id, account_id: acct.id, platform: 'meta', date: day.date_start,
              amount_usd: spendUSD, amount_cop: Math.round(spendUSD * (config.usd_rate || 4200)),
              currency: day.account_currency || 'USD', concept: `Gasto publicitario ${day.date_start}`,
              payment_status: 'pagado', status: 'nueva', source: 'api', meta_sync_key: syncKey,
            })
            if (!insertErr) added++
          }
        }
      } catch (err) { errors.push(`${acct.name}: ${err.message}`) }
    }
    await supabase.from('user_config').update({ last_sync: new Date().toISOString() }).eq('user_id', user.id)
    await supabase.from('sync_log').insert({ user_id: user.id, added, errors })
    setSyncMsg(errors.length ? `${added} nuevas · ${errors.length} error(es)` : `✓ ${added} facturas nuevas`)
    setSyncing(false); loadData()
  }

  // ── CREATE BATCH ──
  const createBatch = async (cardId) => {
    const ids = [...selected].filter(id => {
      const inv = invoices.find(i => i.id === id)
      if (!inv || (inv.status !== 'nueva' && inv.status !== 'por_retirar')) return false
      return cardForAccount(inv.account_id)?.id === cardId
    })
    if (!ids.length) return
    const total = ids.reduce((s, id) => s + (Number(invoices.find(i => i.id === id)?.amount_cop) || 0), 0)
    const { data: batch } = await supabase.from('batches').insert({ user_id: user.id, credit_card_id: cardId, total, date: today(), status: 'pendiente' }).select().single()
    if (batch) {
      await supabase.from('invoices').update({ status: 'por_retirar', batch_id: batch.id }).in('id', ids)
      setSelected(new Set()); setModal({ type: 'batchCreated', batch }); loadData()
    }
  }

  const markWithdrawn = async (batchId, ref) => {
    await supabase.from('batches').update({ status: 'retirado', dropi_ref: ref }).eq('id', batchId)
    await supabase.from('invoices').update({ status: 'en_transito' }).eq('batch_id', batchId).eq('status', 'por_retirar')
    setModal(null); loadData()
  }

  const closeBatch = async (batchId) => {
    await supabase.from('batches').update({ status: 'cerrado', closed_at: new Date().toISOString() }).eq('id', batchId)
    await supabase.from('invoices').update({ status: 'liquidada' }).eq('batch_id', batchId)
    loadData()
  }

  // ── CRUD helpers ──
  const saveCard = async (f, editId) => {
    if (editId) await supabase.from('credit_cards').update(f).eq('id', editId)
    else await supabase.from('credit_cards').insert({ ...f, user_id: user.id })
    setModal(null); loadData()
  }
  const saveAccount = async (f, editId) => {
    if (editId) await supabase.from('ad_accounts').update(f).eq('id', editId)
    else await supabase.from('ad_accounts').insert({ ...f, user_id: user.id })
    setModal(null); loadData()
  }
  const saveInvoice = async (f, editId) => {
    if (editId) await supabase.from('invoices').update(f).eq('id', editId)
    else await supabase.from('invoices').insert({ ...f, user_id: user.id })
    setModal(null); loadData()
  }
  const deleteRow = async (table, id) => { if (confirm('¿Eliminar?')) { await supabase.from(table).delete().eq('id', id); loadData() } }
  const saveConfig = async (updates) => {
    const newCfg = { ...config, ...updates }
    await supabase.from('user_config').update(updates).eq('user_id', user.id)
    setConfig(newCfg)
  }

  const toggleSelect = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAllPending = (cardId) => setSelected(new Set([...pending, ...porRetirar].filter(i => cardForAccount(i.account_id)?.id === cardId).map(i => i.id)))

  const exportCSV = () => {
    const rows = [['Fecha', 'Plat.', 'Cuenta', 'ID Transacción', 'USD', 'COP', 'Pago', 'Estado', 'Nº Factura']]
    invoices.forEach(i => rows.push([i.date, i.platform, acctName(i.account_id), i.transaction_id, i.amount_usd, i.amount_cop, i.payment_status, STATUS[i.status]?.label, i.invoice_number]))
    const csv = rows.map(r => r.map(c => `"${c || ''}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' })); a.download = `factucontrol_${today()}.csv`; a.click()
  }

  const filtered = invoices
    .filter(i => filterStatus === 'all' || i.status === filterStatus)
    .filter(i => filterPlat === 'all' || i.platform === filterPlat)
    .filter(i => { if (!search) return true; const q = search.toLowerCase(); return (i.transaction_id || '').toLowerCase().includes(q) || acctName(i.account_id).toLowerCase().includes(q) || (i.invoice_number || '').toLowerCase().includes(q) || (i.date || '').includes(q) })

  const tabs = [
    { id: 'panel', label: 'Panel', count: null },
    { id: 'facturas', label: 'Facturas', count: pending.length + porRetirar.length || null },
    { id: 'lotes', label: 'Lotes', count: batches.filter(b => b.status !== 'cerrado').length || null },
    { id: 'cuentas', label: 'Cuentas', count: null },
    { id: 'setup', label: 'Setup', count: null },
  ]

  if (!dataLoaded) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
    <div style={{ width: 24, height: 24, border: `2.5px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} input:focus,select:focus{border-color:${T.accent}!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}`}</style>

      {/* Header */}
      <header style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 54, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>F</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>FactuControl</span>
            {config.meta_token && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: T.greenBg, color: T.green }}>Meta ✓</span>}
          </div>
          <nav style={{ display: 'flex', gap: 2 }}>
            {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 500, fontFamily: "'DM Sans', sans-serif", background: tab === t.id ? T.accentBg : 'transparent', color: tab === t.id ? T.accent : T.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.label}{t.count && <span style={{ background: tab === t.id ? T.accent : T.border, color: tab === t.id ? '#fff' : T.textS, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{t.count}</span>}
            </button>)}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncing && <span style={{ fontSize: 12, color: T.accent, animation: 'pulse 1.2s infinite' }}>{syncMsg}</span>}
          {!syncing && syncMsg && <span style={{ fontSize: 12, color: T.dim }}>{syncMsg}</span>}
          <Btn v="secondary" s="sm" onClick={syncMeta} disabled={syncing || !config.meta_token}>⟳ Sync</Btn>
          <Btn v="ghost" s="sm" onClick={exportCSV}>↓ CSV</Btn>
          <Btn v="ghost" s="sm" onClick={async () => { await supabase.auth.signOut() }}>Salir</Btn>
        </div>
      </header>

      {/* Alert bar */}
      {(totalPending > 0 || errorInv.length > 0) && <div style={{ background: T.surface2, borderBottom: `1px solid ${T.border}`, padding: '8px 24px', display: 'flex', gap: 10, overflowX: 'auto' }}>
        {totalPending > 0 && <div style={{ padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: T.orangeBg, color: T.orange, border: `1px solid ${T.orange}20`, whiteSpace: 'nowrap' }}>⚡ {fmt(totalPending)} pendiente de Dropi</div>}
        {errorInv.length > 0 && <div style={{ padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: T.redBg, color: T.red, border: `1px solid ${T.red}20`, whiteSpace: 'nowrap' }}>🚨 {errorInv.length} error(es) de pago</div>}
      </div>}

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '24px 28px 60px', animation: 'fadeIn .2s ease' }}>

        {/* ═══ PANEL ═══ */}
        {tab === 'panel' && <>
          {totalPending > 0 ? (
            <div style={{ background: `linear-gradient(135deg, ${T.orange}08, ${T.yellow}06)`, border: `1.5px solid ${T.orange}30`, borderRadius: 16, padding: '24px 28px', marginBottom: 24 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.orange, textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚡ Retiro pendiente de Dropi</p>
              <p style={{ margin: '8px 0 4px', fontSize: 36, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: T.text }}>{fmt(totalPending)}</p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: T.textS }}>{pending.length + porRetirar.length} factura(s) pendiente(s)</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.values(pendingByCard).map(({ card, total, count }) => (
                  <div key={card.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 18px', flex: '1 1 220px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.textS }}>{card.name} ••{card.last4}</p><p style={{ margin: '2px 0 0', fontSize: 11, color: T.dim }}>{count} fact. · {card.bank}</p></div>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: T.orange }}>{fmt(total)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}><Btn v="warning" s="md" onClick={() => setTab('facturas')}>Ir a gestionar →</Btn></div>
            </div>
          ) : (
            <div style={{ background: T.greenBg, border: `1.5px solid ${T.green}30`, borderRadius: 16, padding: '24px 28px', marginBottom: 24 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.green }}>✓ Todo al día</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textS }}>No hay facturas pendientes.</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[{ l: 'Nuevas', v: pending.length, t: pending.reduce((s, i) => s + (i.amount_cop || 0), 0), c: '#3B82F6' }, { l: 'Por retirar', v: porRetirar.length, t: porRetirar.reduce((s, i) => s + (i.amount_cop || 0), 0), c: '#F59E0B' }, { l: 'En tránsito', v: enTransito.length, t: enTransito.reduce((s, i) => s + (i.amount_cop || 0), 0), c: '#8B5CF6' }, { l: 'Liquidadas', v: liquidadas.length, t: liquidadas.reduce((s, i) => s + (i.amount_cop || 0), 0), c: '#10B981' }].map((s, i) => (
              <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><div style={{ width: 8, height: 8, borderRadius: 4, background: s.c }} /><span style={{ fontSize: 12, fontWeight: 600, color: T.textS }}>{s.l}</span></div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{s.v}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: T.dim }}>{fmt(s.t)}</p>
              </div>
            ))}
          </div>

          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Últimas facturas</h3><Btn v="ghost" s="sm" onClick={() => setTab('facturas')}>Ver todas →</Btn></div>
            {invoices.length === 0 ? <div style={{ padding: '40px 20px', textAlign: 'center', color: T.dim }}><p style={{ fontSize: 14, fontWeight: 600, color: T.textS }}>Sin facturas aún</p></div> : (
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><tbody>
                {invoices.slice(0, 10).map(inv => <tr key={inv.id} style={{ borderBottom: `1px solid ${T.border}40` }}>
                  <td style={{ padding: '10px 16px', color: T.dim, fontSize: 12 }}>{inv.date}</td>
                  <td style={{ padding: '10px 8px' }}><PlatBadge platform={inv.platform} /></td>
                  <td style={{ padding: '10px 8px', fontWeight: 500, fontSize: 12 }}>{acctName(inv.account_id)}</td>
                  <td style={{ padding: '10px 8px' }}>{inv.transaction_id ? <code style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600, color: T.accent, background: T.accentBg, padding: '2px 7px', borderRadius: 5 }}>{inv.transaction_id}</code> : '—'}</td>
                  <td style={{ padding: '10px 8px', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>{fmt(inv.amount_cop)}</td>
                  <td style={{ padding: '10px 8px' }}><PayBadge status={inv.payment_status} /></td>
                  <td style={{ padding: '10px 8px' }}><StatusBadge status={inv.status} /></td>
                </tr>)}
              </tbody></table></div>
            )}
          </div>
        </>}

        {/* ═══ FACTURAS ═══ */}
        {tab === 'facturas' && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div><h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700 }}>Facturas</h2><p style={{ margin: 0, color: T.dim, fontSize: 13 }}>Meta + TikTok — Selecciona → Lote → Dropi → Cierra</p></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn v="secondary" s="sm" onClick={() => setModal('addMeta')}>+ Meta</Btn>
              <Btn v="tiktok" s="sm" onClick={() => setModal('addTiktok')}>♪ + TikTok</Btn>
              <Btn s="sm" onClick={syncMeta} disabled={syncing || !config.meta_token}>⟳ Sync</Btn>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ k: 'all', l: 'Todas' }, ...Object.entries(STATUS).map(([k, v]) => ({ k, l: v.label }))].map(f => <button key={f.k} onClick={() => setFilterStatus(f.k)} style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${filterStatus === f.k ? T.accent : T.border}`, background: filterStatus === f.k ? T.accentBg : T.surface, color: filterStatus === f.k ? T.accent : T.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{f.l}</button>)}
            <span style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />
            {[{ k: 'all', l: 'Todas' }, { k: 'meta', l: 'Ⓜ Meta' }, { k: 'tiktok', l: '♪ TikTok' }].map(f => <button key={f.k} onClick={() => setFilterPlat(f.k)} style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${filterPlat === f.k ? T.accent : T.border}`, background: filterPlat === f.k ? T.accentBg : T.surface, color: filterPlat === f.k ? T.accent : T.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{f.l}</button>)}
          </div>

          <div style={{ marginBottom: 16 }}><input style={{ ...inp, maxWidth: 380, fontSize: 13, padding: '9px 14px' }} placeholder="🔍 Buscar ID transacción, cuenta, nº factura..." value={search} onChange={e => setSearch(e.target.value)} /></div>

          {selected.size > 0 && <div style={{ background: T.accentBg, border: `1.5px solid ${T.accent}30`, borderRadius: 12, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>{selected.size} seleccionada(s) · {fmt([...selected].reduce((s, id) => s + (invoices.find(i => i.id === id)?.amount_cop || 0), 0))}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn v="ghost" s="sm" onClick={() => setSelected(new Set())}>Limpiar</Btn>
              {cards.map(card => { const n = [...selected].filter(id => cardForAccount(invoices.find(i => i.id === id)?.account_id)?.id === card.id).length; if (!n) return null; return <Btn key={card.id} s="sm" onClick={() => createBatch(card.id)}>Lote → {card.name} ••{card.last4} ({n})</Btn> })}
            </div>
          </div>}

          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {filtered.length === 0 ? <div style={{ padding: '50px 20px', textAlign: 'center', color: T.dim }}><p style={{ fontWeight: 600, color: T.textS }}>{invoices.length === 0 ? 'Sin facturas' : 'Sin resultados'}</p></div> : (
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: T.surface2 }}><th style={{ width: 36, padding: '10px 12px' }}></th>{['Fecha', 'Plat.', 'Cuenta', 'ID Transacción', 'COP', 'USD', 'Pago', 'Estado', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, fontWeight: 600, color: T.dim, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>{filtered.map(inv => <tr key={inv.id} style={{ borderBottom: `1px solid ${T.border}30`, background: selected.has(inv.id) ? T.accentBg : 'transparent' }}>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{(inv.status === 'nueva' || inv.status === 'por_retirar') && <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: T.accent }} />}</td>
                  <td style={{ padding: '10px 8px', fontSize: 12, color: T.dim }}>{inv.date}</td>
                  <td style={{ padding: '10px 8px' }}><PlatBadge platform={inv.platform} /></td>
                  <td style={{ padding: '10px 8px', fontWeight: 500, fontSize: 12 }}>{acctName(inv.account_id)}</td>
                  <td style={{ padding: '10px 8px' }}>{inv.transaction_id ? <code style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, color: T.accent, background: T.accentBg, padding: '3px 8px', borderRadius: 6 }}>{inv.transaction_id}</code> : <span style={{ color: T.dim }}>—</span>}</td>
                  <td style={{ padding: '10px 8px', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>{fmt(inv.amount_cop)}</td>
                  <td style={{ padding: '10px 8px', fontFamily: "'DM Mono', monospace", fontSize: 12, color: T.dim }}>{fmtUSD(inv.amount_usd)}</td>
                  <td style={{ padding: '10px 8px' }}><PayBadge status={inv.payment_status} /></td>
                  <td style={{ padding: '10px 8px' }}><StatusBadge status={inv.status} /></td>
                  <td style={{ padding: '10px 8px' }}><Btn v="ghost" s="sm" onClick={() => setModal({ type: 'editInv', data: inv })}>✏️</Btn></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </div>

          {Object.keys(pendingByCard).length > 0 && selected.size === 0 && <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: T.dim, alignSelf: 'center' }}>Selección rápida:</span>
            {Object.values(pendingByCard).map(({ card, count, total }) => <Btn key={card.id} v="secondary" s="sm" onClick={() => selectAllPending(card.id)}>Todo {card.name} ••{card.last4} ({count} · {fmt(total)})</Btn>)}
          </div>}
        </>}

        {/* ═══ LOTES ═══ */}
        {tab === 'lotes' && <>
          <h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700 }}>Lotes de Pago</h2>
          <p style={{ margin: '0 0 24px', color: T.dim, fontSize: 13 }}>Lote → Retiro Dropi → Pago → Cerrado</p>
          {batches.length === 0 ? <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '50px 20px', textAlign: 'center' }}><p style={{ fontWeight: 600, color: T.textS }}>Sin lotes</p><Btn v="secondary" s="sm" onClick={() => setTab('facturas')} style={{ marginTop: 12 }}>Ir a Facturas →</Btn></div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{batches.map(batch => {
              const card = cards.find(c => c.id === batch.credit_card_id)
              const bInv = invoices.filter(i => i.batch_id === batch.id)
              const sc = { pendiente: T.yellow, retirado: T.purple, cerrado: T.green }
              const sl = { pendiente: '⏳ Pendiente', retirado: '🔄 En tránsito', cerrado: '✓ Cerrado' }
              return <div key={batch.id} style={{ background: T.surface, border: `1px solid ${batch.status === 'pendiente' ? T.yellow + '40' : T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: sc[batch.status], background: `${sc[batch.status]}10` }}>{sl[batch.status]}</span>
                      <span style={{ fontSize: 11, color: T.dim }}>{batch.date}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{card ? `${card.name} ••${card.last4}` : '—'} · {bInv.length} fact.</p>
                    {batch.dropi_ref && <p style={{ margin: '2px 0 0', fontSize: 12, color: T.dim }}>Ref: <strong>{batch.dropi_ref}</strong></p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{fmt(batch.total)}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                      {batch.status === 'pendiente' && <Btn s="sm" onClick={() => setModal({ type: 'withdraw', batch })}>Marcar retiro</Btn>}
                      {batch.status === 'retirado' && <Btn v="success" s="sm" onClick={() => closeBatch(batch.id)}>Cerrar ✓</Btn>}
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface2 }}>{bInv.map(inv => <div key={inv.id} style={{ padding: '8px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.border}30`, fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 10, opacity: .5 }}>{inv.platform === 'tiktok' ? '♪' : 'Ⓜ'}</span><span style={{ color: T.dim }}>{inv.date} · {acctName(inv.account_id)}</span>{inv.transaction_id && <code style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.accent, background: T.accentBg, padding: '2px 6px', borderRadius: 4 }}>{inv.transaction_id}</code>}</div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>{fmt(inv.amount_cop)}</span>
                </div>)}</div>
              </div>
            })}</div>
          )}
        </>}

        {/* ═══ CUENTAS ═══ */}
        {tab === 'cuentas' && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cuentas & Tarjetas</h2>
            <div style={{ display: 'flex', gap: 8 }}><Btn v="secondary" onClick={() => setModal('addCard')}>+ Tarjeta</Btn><Btn onClick={() => setModal('addMetaAcct')}>+ Meta</Btn><Btn v="tiktok" onClick={() => setModal('addTiktokAcct')}>♪ + TikTok</Btn></div>
          </div>

          <h3 style={{ fontSize: 12, fontWeight: 700, color: T.dim, margin: '0 0 12px', textTransform: 'uppercase' }}>Tarjetas</h3>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
            {cards.length === 0 ? <p style={{ color: T.dim, fontSize: 13 }}>Agrega tu primera tarjeta.</p> : cards.map(c => <div key={c.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '18px 22px', flex: '1 1 230px', maxWidth: 320, position: 'relative' }}>
              <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 600, color: T.dim, textTransform: 'uppercase' }}>{c.bank} · {c.card_type?.toUpperCase()}</p>
              <p style={{ margin: 0, fontSize: 18, fontFamily: "'DM Mono', monospace", fontWeight: 700, letterSpacing: '0.1em' }}>•••• {c.last4}</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: T.textS }}>{c.name}</p>
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 2 }}><Btn v="ghost" s="sm" onClick={() => setModal({ type: 'editCard', data: c })}>✏️</Btn><Btn v="ghost" s="sm" onClick={() => deleteRow('credit_cards', c.id)}>🗑</Btn></div>
            </div>)}
          </div>

          {[{ title: 'Ⓜ Cuentas Meta Ads', data: metaAccounts, label: 'Ad Account ID' }, { title: '♪ Cuentas TikTok Ads', data: tiktokAccounts, label: 'Advertiser ID' }].map(sec => <div key={sec.title} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: T.dim, margin: '0 0 12px', textTransform: 'uppercase' }}>{sec.title}</h3>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {sec.data.length === 0 ? <div style={{ padding: '30px 20px', textAlign: 'center', color: T.dim, fontSize: 13 }}>Sin cuentas</div> : (
                <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr style={{ background: T.surface2 }}>{['Nombre', sec.label, 'Tarjeta', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: T.dim, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                  <tbody>{sec.data.map(a => <tr key={a.id} style={{ borderBottom: `1px solid ${T.border}30` }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{a.name}</td>
                    <td style={{ padding: '10px 14px', fontFamily: "'DM Mono', monospace", fontSize: 12, color: T.dim }}>{a.ad_account_id || '—'}</td>
                    <td style={{ padding: '10px 14px', color: T.textS }}>{cardLabel(a.credit_card_id)}</td>
                    <td style={{ padding: '10px 14px' }}><div style={{ display: 'flex', gap: 2 }}><Btn v="ghost" s="sm" onClick={() => setModal({ type: 'editAcct', data: a })}>✏️</Btn><Btn v="ghost" s="sm" onClick={() => deleteRow('ad_accounts', a.id)}>🗑</Btn></div></td>
                  </tr>)}</tbody></table></div>
              )}
            </div>
          </div>)}
        </>}

        {/* ═══ SETUP ═══ */}
        {tab === 'setup' && <>
          <h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700 }}>Setup</h2>
          <p style={{ margin: '0 0 24px', color: T.dim, fontSize: 13 }}>Conecta Meta API. TikTok se registra manualmente.</p>

          <div style={{ background: config.meta_token ? T.greenBg : T.yellowBg, border: `1.5px solid ${config.meta_token ? T.green : T.yellow}25`, borderRadius: 14, padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 20 }}>{config.meta_token ? '✅' : '⏳'}</span>
            <div><p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: config.meta_token ? T.green : T.yellow }}>{config.meta_token ? 'Meta API Conectada' : 'Pendiente'}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: T.dim }}>{config.last_sync ? `Última sync: ${new Date(config.last_sync).toLocaleString('es-CO')}` : 'Configura tu token'}</p></div>
          </div>

          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700 }}>Pasos para conectar Meta (~15 min)</h3>
            {[
              { n: 1, t: 'Crear Meta App', d: 'developers.facebook.com → My Apps → Create App → "Other" → "Business"', link: 'https://developers.facebook.com/apps/' },
              { n: 2, t: 'Agregar Marketing API', d: 'Dentro de tu app → Add Products → Marketing API' },
              { n: 3, t: 'Crear System User', d: 'business.facebook.com → Business Settings → System Users → Add → Admin → Asignar cuentas', link: 'https://business.facebook.com/settings/system-users' },
              { n: 4, t: 'Generar Token', d: 'System User → Generate Token → tu App → permiso "ads_read" → Copiar' },
              { n: 5, t: 'Pegar aquí abajo', d: 'Token de System User NO expira. Se guarda cifrado en tu base de datos.' },
            ].map(s => <div key={s.n} style={{ display: 'flex', gap: 14, marginBottom: 18, paddingBottom: 18, borderBottom: s.n < 5 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: 13, color: T.accent }}>{s.n}</div>
              <div><p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{s.t}</p><p style={{ margin: '3px 0 0', fontSize: 13, color: T.textS, lineHeight: 1.5 }}>{s.d}</p>{s.link && <a href={s.link} target="_blank" rel="noopener" style={{ fontSize: 12, color: T.accent, fontWeight: 500, textDecoration: 'none' }}>Abrir →</a>}</div>
            </div>)}
          </div>

          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24 }}>
            <Field label="Access Token de Meta" sub="Se guarda en tu base de datos privada."><input style={{ ...inp, fontFamily: "'DM Mono', monospace", fontSize: 12 }} type="password" value={config.meta_token || ''} onChange={e => saveConfig({ meta_token: e.target.value })} placeholder="EAAxxxxxxxxx..." /></Field>
            <Field label="Tasa USD → COP"><input type="number" style={inp} value={config.usd_rate || 4200} onChange={e => saveConfig({ usd_rate: Number(e.target.value) })} /></Field>
            <Btn onClick={syncMeta} disabled={!config.meta_token || syncing}>{syncing ? 'Sincronizando...' : '🔄 Probar y sincronizar'}</Btn>
          </div>

          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, marginTop: 24 }}>
            <p style={{ margin: 0, fontSize: 12, color: T.dim }}>Sesión: {user.email}</p>
            <Btn v="danger" s="sm" onClick={async () => { await supabase.auth.signOut() }} style={{ marginTop: 10 }}>Cerrar sesión</Btn>
          </div>
        </>}
      </main>

      {/* ═══ MODALS ═══ */}

      {/* Add Meta Invoice */}
      <Modal open={modal === 'addMeta'} onClose={() => setModal(null)} title="Ⓜ Cobro Meta Ads">
        {(() => { const [f, setF] = useState({ account_id: metaAccounts[0]?.id || '', date: today(), amount_usd: '', amount_cop: '', transaction_id: '', invoice_number: '', payment_status: 'pagado', concept: 'Cobro Meta Ads' }); const ac = (u) => setF(p => ({ ...p, amount_usd: u, amount_cop: Math.round((parseFloat(u) || 0) * (config.usd_rate || 4200)) })); return <>
          <Field label="Cuenta"><select style={inp} value={f.account_id} onChange={e => setF({ ...f, account_id: e.target.value })}><option value="">—</option>{metaAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Fecha"><input type="date" style={inp} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="USD"><input type="number" style={inp} value={f.amount_usd} onChange={e => ac(e.target.value)} /></Field><Field label="COP"><input type="number" style={inp} value={f.amount_cop} onChange={e => setF({ ...f, amount_cop: e.target.value })} /></Field></div>
          <Field label="ID Transacción" sub="Ej: JTUVAKZXD2"><input style={{ ...inp, fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' }} value={f.transaction_id} onChange={e => setF({ ...f, transaction_id: e.target.value.toUpperCase() })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Nº Factura"><input style={inp} value={f.invoice_number} onChange={e => setF({ ...f, invoice_number: e.target.value })} /></Field><Field label="Estado pago"><select style={inp} value={f.payment_status} onChange={e => setF({ ...f, payment_status: e.target.value })}><option value="pagado">Pagado</option><option value="error">Error</option><option value="pendiente">Pendiente</option></select></Field></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}><Btn v="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={() => { saveInvoice({ ...f, platform: 'meta', status: 'nueva', source: 'manual' }); }} disabled={!f.account_id || !f.amount_cop}>Guardar</Btn></div>
        </> })()}
      </Modal>

      {/* Add TikTok Invoice */}
      <Modal open={modal === 'addTiktok'} onClose={() => setModal(null)} title="♪ Cobro TikTok Ads">
        {(() => { const [f, setF] = useState({ account_id: tiktokAccounts[0]?.id || '', date: today(), amount_usd: '', amount_cop: '', transaction_id: '', invoice_number: '', payment_status: 'pagado', concept: 'Cobro TikTok Ads' }); const ac = (u) => setF(p => ({ ...p, amount_usd: u, amount_cop: Math.round((parseFloat(u) || 0) * (config.usd_rate || 4200)) })); return <>
          {tiktokAccounts.length === 0 ? <div style={{ textAlign: 'center', padding: 20 }}><p style={{ color: T.textS, marginBottom: 12 }}>No tienes cuentas TikTok.</p><Btn v="secondary" s="sm" onClick={() => { setModal(null); setTimeout(() => setModal('addTiktokAcct'), 200) }}>+ Agregar cuenta TikTok</Btn></div> : <>
            <Field label="Cuenta TikTok"><select style={inp} value={f.account_id} onChange={e => setF({ ...f, account_id: e.target.value })}><option value="">—</option>{tiktokAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="Fecha"><input type="date" style={inp} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="USD"><input type="number" style={inp} value={f.amount_usd} onChange={e => ac(e.target.value)} /></Field><Field label="COP"><input type="number" style={inp} value={f.amount_cop} onChange={e => setF({ ...f, amount_cop: e.target.value })} /></Field></div>
            <Field label="ID Transacción TikTok"><input style={{ ...inp, fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' }} value={f.transaction_id} onChange={e => setF({ ...f, transaction_id: e.target.value.toUpperCase() })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Nº Factura"><input style={inp} value={f.invoice_number} onChange={e => setF({ ...f, invoice_number: e.target.value })} /></Field><Field label="Estado pago"><select style={inp} value={f.payment_status} onChange={e => setF({ ...f, payment_status: e.target.value })}><option value="pagado">Pagado</option><option value="error">Error</option></select></Field></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}><Btn v="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn v="tiktok" onClick={() => { saveInvoice({ ...f, platform: 'tiktok', status: 'nueva', source: 'manual' }); }} disabled={!f.account_id || !f.amount_cop}>Guardar</Btn></div>
          </>}
        </> })()}
      </Modal>

      {/* Edit Invoice */}
      <Modal open={modal?.type === 'editInv'} onClose={() => setModal(null)} title="Editar Factura">
        {(() => { const d = modal?.data; if (!d) return null; const [f, setF] = useState(d); const ac = (u) => setF(p => ({ ...p, amount_usd: u, amount_cop: Math.round((parseFloat(u) || 0) * (config.usd_rate || 4200)) })); return <>
          <div style={{ marginBottom: 16 }}><PlatBadge platform={f.platform} /></div>
          <Field label="Fecha"><input type="date" style={inp} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="USD"><input type="number" style={inp} value={f.amount_usd} onChange={e => ac(e.target.value)} /></Field><Field label="COP"><input type="number" style={inp} value={f.amount_cop} onChange={e => setF({ ...f, amount_cop: e.target.value })} /></Field></div>
          <Field label="ID Transacción"><input style={{ ...inp, fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' }} value={f.transaction_id || ''} onChange={e => setF({ ...f, transaction_id: e.target.value.toUpperCase() })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Nº Factura"><input style={inp} value={f.invoice_number || ''} onChange={e => setF({ ...f, invoice_number: e.target.value })} /></Field><Field label="Estado pago"><select style={inp} value={f.payment_status} onChange={e => setF({ ...f, payment_status: e.target.value })}><option value="pagado">Pagado</option><option value="error">Error</option><option value="pendiente">Pendiente</option></select></Field></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}><Btn v="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={() => saveInvoice({ date: f.date, amount_usd: f.amount_usd, amount_cop: f.amount_cop, transaction_id: f.transaction_id, invoice_number: f.invoice_number, payment_status: f.payment_status }, d.id)}>Guardar</Btn></div>
        </> })()}
      </Modal>

      {/* Add/Edit Card */}
      <Modal open={modal === 'addCard' || modal?.type === 'editCard'} onClose={() => setModal(null)} title={modal?.type === 'editCard' ? 'Editar Tarjeta' : 'Nueva Tarjeta'}>
        {(() => { const d = modal?.data; const [f, setF] = useState(d || { name: '', last4: '', bank: '', card_type: 'visa' }); return <>
          <Field label="Nombre"><input style={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Visa Bancolombia" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Últimos 4"><input style={inp} maxLength={4} value={f.last4} onChange={e => setF({ ...f, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></Field><Field label="Banco"><input style={inp} value={f.bank} onChange={e => setF({ ...f, bank: e.target.value })} /></Field></div>
          <Field label="Tipo"><select style={inp} value={f.card_type} onChange={e => setF({ ...f, card_type: e.target.value })}><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="amex">Amex</option></select></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}><Btn v="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={() => saveCard({ name: f.name, last4: f.last4, bank: f.bank, card_type: f.card_type }, d?.id)} disabled={!f.name || !f.last4}>Guardar</Btn></div>
        </> })()}
      </Modal>

      {/* Add Meta Account */}
      <Modal open={modal === 'addMetaAcct' || (modal?.type === 'editAcct' && modal.data?.platform === 'meta')} onClose={() => setModal(null)} title={modal?.type === 'editAcct' ? 'Editar Cuenta Meta' : 'Nueva Cuenta Meta'}>
        {(() => { const d = modal?.data; const [f, setF] = useState(d || { name: '', ad_account_id: '', credit_card_id: '', platform: 'meta' }); return <>
          <Field label="Nombre"><input style={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Doral Store — Principal" /></Field>
          <Field label="Ad Account ID" sub="act_XXXXXXXX"><input style={inp} value={f.ad_account_id} onChange={e => setF({ ...f, ad_account_id: e.target.value })} /></Field>
          <Field label="Tarjeta"><select style={inp} value={f.credit_card_id} onChange={e => setF({ ...f, credit_card_id: e.target.value })}><option value="">—</option>{cards.map(c => <option key={c.id} value={c.id}>{c.name} ••{c.last4}</option>)}</select></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}><Btn v="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={() => saveAccount({ name: f.name, ad_account_id: f.ad_account_id, credit_card_id: f.credit_card_id || null, platform: 'meta' }, d?.id)} disabled={!f.name}>Guardar</Btn></div>
        </> })()}
      </Modal>

      {/* Add TikTok Account */}
      <Modal open={modal === 'addTiktokAcct' || (modal?.type === 'editAcct' && modal.data?.platform === 'tiktok')} onClose={() => setModal(null)} title={modal?.type === 'editAcct' ? 'Editar Cuenta TikTok' : '♪ Nueva Cuenta TikTok'}>
        {(() => { const d = modal?.data; const [f, setF] = useState(d || { name: '', ad_account_id: '', credit_card_id: '', platform: 'tiktok' }); return <>
          <Field label="Nombre"><input style={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="TikTok — Doral Store" /></Field>
          <Field label="Advertiser ID"><input style={inp} value={f.ad_account_id} onChange={e => setF({ ...f, ad_account_id: e.target.value })} /></Field>
          <Field label="Tarjeta"><select style={inp} value={f.credit_card_id} onChange={e => setF({ ...f, credit_card_id: e.target.value })}><option value="">—</option>{cards.map(c => <option key={c.id} value={c.id}>{c.name} ••{c.last4}</option>)}</select></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}><Btn v="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn v="tiktok" onClick={() => saveAccount({ name: f.name, ad_account_id: f.ad_account_id, credit_card_id: f.credit_card_id || null, platform: 'tiktok' }, d?.id)} disabled={!f.name}>Guardar</Btn></div>
        </> })()}
      </Modal>

      {/* Mark Withdrawn */}
      <Modal open={modal?.type === 'withdraw'} onClose={() => setModal(null)} title="Registrar Retiro">
        {(() => { const [ref, setRef] = useState(''); if (!modal?.batch) return null; return <>
          <p style={{ fontSize: 14, color: T.textS, margin: '0 0 16px' }}>Lote por <strong style={{ color: T.text }}>{fmt(modal.batch.total)}</strong> a <strong>{cardLabel(modal.batch.credit_card_id)}</strong></p>
          <Field label="Referencia Dropi"><input style={inp} value={ref} onChange={e => setRef(e.target.value)} placeholder="DRP-12345" /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}><Btn v="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={() => markWithdrawn(modal.batch.id, ref)}>Confirmar</Btn></div>
        </> })()}
      </Modal>

      {/* Batch Created */}
      <Modal open={modal?.type === 'batchCreated'} onClose={() => setModal(null)} title="Lote Creado ✓" w={420}>
        {modal?.batch && <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 36, margin: '0 0 12px' }}>📦</p>
          <p style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", margin: '0 0 8px' }}>{fmt(modal.batch.total)}</p>
          <p style={{ color: T.textS, margin: '0 0 20px' }}>Facturas agrupadas para {cardLabel(modal.batch.credit_card_id)}</p>
          <Btn onClick={() => { setModal(null); setTab('lotes') }}>Ir a Lotes →</Btn>
        </div>}
      </Modal>
    </div>
  )
}

// ═══ ROOT APP (Auth wrapper) ═══
export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F7F9', fontFamily: "'DM Sans', sans-serif" }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <div style={{ width: 24, height: 24, border: '2.5px solid #E2E5EB', borderTopColor: '#1A56DB', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
  </div>

  if (!session) return <LoginPage />
  return <Dashboard user={session.user} />
}

// ─── Piezas de interfaz compartidas por las pantallas del Portal ────────────
import { useEffect } from 'react'

export const T = {
  bg: '#060B14', panel: 'rgba(10,20,45,0.7)', panelSolid: '#0D1830',
  border: 'rgba(0,212,255,0.12)', borderSub: 'rgba(255,255,255,0.07)',
  text: '#E8F0FF', textS: '#9AB8D8', dim: '#6080A0',
  accent: '#00D4FF', accentBg: 'rgba(0,212,255,0.10)',
  green: '#00FFB0', greenBg: 'rgba(0,255,176,0.10)',
  red: '#FF4D75', redBg: 'rgba(255,77,117,0.10)',
  yellow: '#FBBF24', yellowBg: 'rgba(251,191,36,0.10)',
}
export const FONT = "'DM Sans', sans-serif"

export const fmtCOP = (n) => new Intl.NumberFormat('es-CO',
  { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(Number(n) || 0)

export const fmtFecha = (iso) => {
  if (!iso) return '—'
  const [a,m,d] = String(iso).slice(0,10).split('-')
  return `${d}/${m}/${a}`
}

export const hoy = () => new Date().toISOString().slice(0,10)

export const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ── Estilos base de controles ──────────────────────────────────────────────
export const campo = {
  width:'100%', boxSizing:'border-box', padding:'10px 13px', borderRadius:9,
  border:`1.5px solid ${T.border}`, background:'rgba(255,255,255,0.05)',
  color:T.text, fontSize:13.5, fontFamily:FONT, outline:'none',
}

export function Estilos() {
  return <style>{`
    @keyframes ui-spin{to{transform:rotate(360deg)}}
    .ui-fila:hover td{background:rgba(0,212,255,0.05)}
    .ui-btn:disabled{opacity:.45;cursor:not-allowed}
    .ui-in:focus{border-color:${T.accent}!important;box-shadow:0 0 0 3px rgba(0,212,255,0.10)}
    .ui-in::placeholder{color:${T.dim}}
    .ui-in option{background:${T.panelSolid};color:${T.text}}
    .ui-scroll::-webkit-scrollbar{width:5px;height:5px}
    .ui-scroll::-webkit-scrollbar-thumb{background:rgba(0,212,255,0.25);border-radius:5px}
  `}</style>
}

export function Btn({ children, onClick, v='primary', s='md', disabled, type='button', style={} }) {
  const vs = {
    primary:  { background:'linear-gradient(135deg,#00D4FF,#0080FF)', color:'#00131A', border:'none' },
    sec:      { background:'rgba(255,255,255,0.06)', color:T.textS, border:`1px solid ${T.border}` },
    peligro:  { background:T.redBg, color:T.red, border:`1px solid rgba(255,77,117,0.28)` },
    fantasma: { background:'transparent', color:T.dim, border:'none' },
  }
  const ss = { sm:{padding:'6px 11px',fontSize:12}, md:{padding:'9px 17px',fontSize:13} }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="ui-btn" style={{
      ...vs[v], ...ss[s], borderRadius:9, fontWeight:700, cursor:'pointer',
      fontFamily:FONT, display:'inline-flex', alignItems:'center', gap:6,
      whiteSpace:'nowrap', ...style,
    }}>{children}</button>
  )
}

export function Campo({ etiqueta, obligatorio, children, ancho }) {
  return (
    <div style={{ marginBottom:14, gridColumn: ancho ? `span ${ancho}` : undefined }}>
      <label style={{ display:'block', fontSize:10.5, fontWeight:700, color:T.textS,
                      marginBottom:6, textTransform:'uppercase', letterSpacing:'0.5px' }}>
        {etiqueta}{obligatorio && <span style={{ color:T.red }}> *</span>}
      </label>
      {children}
    </div>
  )
}

export function Select({ valor, onChange, opciones, vacio='— Selecciona —' }) {
  return (
    <select className="ui-in" style={campo} value={valor || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{vacio}</option>
      {opciones.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export function Modal({ abierto, onCerrar, titulo, children, ancho=680 }) {
  useEffect(() => {
    if (!abierto) return
    const esc = e => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])
  if (!abierto) return null
  return (
    <div onClick={onCerrar} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(10px)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200, padding:20,
    }}>
      <div onClick={e => e.stopPropagation()} className="ui-scroll" style={{
        width:'100%', maxWidth:ancho, maxHeight:'90vh', overflow:'auto',
        background:'#0B1424', border:`1px solid ${T.border}`, borderRadius:18,
        boxShadow:'0 30px 80px rgba(0,0,0,0.6)', fontFamily:FONT,
      }}>
        <div style={{ position:'sticky', top:0, zIndex:1, background:'#0B1424',
                      padding:'18px 24px', borderBottom:`1px solid ${T.borderSub}`,
                      display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:T.text }}>{titulo}</h3>
          <button onClick={onCerrar} style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`,
            borderRadius:8, width:30, height:30, cursor:'pointer', color:T.dim, fontSize:15 }}>✕</button>
        </div>
        <div style={{ padding:24, color:T.text }}>{children}</div>
      </div>
    </div>
  )
}

export function Kpi({ etiqueta, valor, sub, color=T.accent }) {
  return (
    <div style={{ background:T.panel, border:`1px solid ${T.border}`, borderRadius:14,
                  padding:'16px 18px', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2,
                    background:`linear-gradient(90deg, ${color}70, transparent)` }} />
      <p style={{ margin:'0 0 8px', fontSize:10, fontWeight:700, color:T.dim,
                  textTransform:'uppercase', letterSpacing:'0.7px' }}>{etiqueta}</p>
      <p style={{ margin:0, fontSize:20, fontWeight:700, color,
                  fontFamily:"'DM Mono',monospace", lineHeight:1.15 }}>{valor}</p>
      {sub && <p style={{ margin:'5px 0 0', fontSize:11, color:T.dim }}>{sub}</p>}
    </div>
  )
}

export function Etiqueta({ texto }) {
  const mapa = {
    'Pagado':      { c:T.green,  b:T.greenBg },
    'Pendiente':   { c:T.yellow, b:T.yellowBg },
    'Sin Definir': { c:T.dim,    b:'rgba(255,255,255,0.05)' },
  }
  const e = mapa[texto] || { c:T.textS, b:'rgba(255,255,255,0.05)' }
  return (
    <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                   color:e.c, background:e.b, border:`1px solid ${e.c}28`, whiteSpace:'nowrap' }}>
      {texto || '—'}
    </span>
  )
}

export function Cargando({ texto='Cargando…' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  gap:12, padding:'60px 0', color:T.dim, fontFamily:FONT, fontSize:13 }}>
      <div style={{ width:24, height:24, borderRadius:'50%', border:'2px solid rgba(0,212,255,0.15)',
                    borderTopColor:T.accent, animation:'ui-spin .7s linear infinite' }} />
      {texto}
    </div>
  )
}

export function Vacio({ titulo, sub, accion }) {
  return (
    <div style={{ textAlign:'center', padding:'56px 20px', color:T.dim, fontFamily:FONT }}>
      <p style={{ margin:'0 0 6px', fontSize:14.5, fontWeight:600, color:T.text }}>{titulo}</p>
      {sub && <p style={{ margin:'0 0 18px', fontSize:13 }}>{sub}</p>}
      {accion}
    </div>
  )
}

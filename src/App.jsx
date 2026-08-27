import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabase.js'

// ─── Utilities ────────────────────────────────────────────────────────────────
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const today    = () => localDate()
const daysAgo  = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d) }
const fmt      = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtN     = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n || 0)
const fmtPct   = (n) => `${(n || 0).toFixed(1)}%`
const fmtRoas  = (n) => `${(n || 0).toFixed(2)}x`
const fmtSec   = (n) => n >= 60 ? `${Math.floor(n/60)}m ${Math.round(n%60)}s` : `${Math.round(n||0)}s`
const fmtShort = (n) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : (n||0).toFixed(0)
const toggleSort = (cur, key) => ({ key, dir: cur.key === key ? -cur.dir : -1 })
const fmtRelTime = (iso) => {
  if(!iso) return null
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if(diff < 1) return 'hace un momento'
  if(diff < 60) return `hace ${diff}m`
  const h = Math.floor(diff / 60)
  if(h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h/24)}d`
}

// ── ROAS scale: target 7x / ideal 10x ────────────────────────────────────────
const roasColor = (r) => r >= 7 ? '#00FFB0' : r >= 4 ? '#FBBF24' : '#FF4D75'
const roasBg    = (r) => r >= 7 ? 'rgba(0,255,176,0.12)' : r >= 4 ? 'rgba(251,191,36,0.12)' : 'rgba(255,77,117,0.12)'

// ── Ad score 0-100 (ROAS 50% + Hook 25% + Hold 25%) ──────────────────────────
const calcScore = (a) => {
  if (!a.spend) return 0
  const r = Math.min((a.roas  / 10) * 50, 50)
  const h = Math.min((a.hook_rate / 35) * 25, 25)
  const o = Math.min((a.hold_rate / 55) * 25, 25)
  return Math.round(r + h + o)
}
const scoreLabel = (s) => s >= 75 ? 'Elite' : s >= 50 ? 'Sólido' : s >= 25 ? 'Mejorable' : 'Bajo'
const scoreColor = (s) => s >= 75 ? '#00FFB0' : s >= 50 ? '#FBBF24' : s >= 25 ? '#FB923C' : '#FF4D75'

// ── Campaign diagnosis ────────────────────────────────────────────────────────
const diagnose = (c) => {
  if (!c.spend) return null
  if (c.roas >= 10) return { action: '⭐ Escalar x3',   color: '#00FFB0', bg: 'rgba(0,255,176,0.1)',   detail: 'ROAS elite — triplicar presupuesto' }
  if (c.roas >= 7)  return { action: '🚀 Escalar x2',   color: '#00FFB0', bg: 'rgba(0,255,176,0.1)',   detail: 'ROAS objetivo alcanzado — duplicar' }
  if (c.roas < 2)   return { action: '⛔ Pausar',       color: '#FF4D75', bg: 'rgba(255,77,117,0.1)',  detail: `ROAS ${fmtRoas(c.roas)} — fuga de dinero` }
  if (c.roas >= 4 && c.conv_rate > 1) return { action: '📈 Optimizar', color: '#FBBF24', bg: 'rgba(251,191,36,0.1)', detail: 'Potencial alto — mejorar creativo/audiencia' }
  if (c.ctr < 0.8 && c.roas < 4) return { action: '🎨 Creativo',    color: '#FB923C', bg: 'rgba(251,146,60,0.1)', detail: `CTR ${fmtPct(c.ctr)} bajo — cambiar creatividad` }
  if (c.ctr >= 1 && c.conv_rate < 0.5) return { action: '🎯 Funnel', color: '#A78BFA', bg: 'rgba(167,139,250,0.1)', detail: 'Clics OK pero no convierte — revisar oferta' }
  return { action: '🧪 Testear', color: '#00D4FF', bg: 'rgba(0,212,255,0.1)', detail: 'Resultados mixtos — A/B test' }
}

// ── Product scale potential ───────────────────────────────────────────────────
const scalePotential = (roas) => {
  if (roas >= 10) return { label: '⭐ Escalar agresivo',  color: '#00FFB0', bg: 'rgba(0,255,176,0.1)' }
  if (roas >= 7)  return { label: '🚀 Listo para escalar',color: '#00FFB0', bg: 'rgba(0,255,176,0.1)' }
  if (roas >= 4)  return { label: '📈 Optimizar primero', color: '#FBBF24', bg: 'rgba(251,191,36,0.1)' }
  if (roas >= 2)  return { label: '🧪 Testear creativo',  color: '#FB923C', bg: 'rgba(251,146,60,0.1)' }
  return { label: '⛔ Revisar/Pausar', color: '#FF4D75', bg: 'rgba(255,77,117,0.1)' }
}

const getPeriodRange = (p) => {
  const now = new Date()
  if (p === 'today') return { from: today(), to: today() }
  if (p === '7d')    return { from: daysAgo(7),  to: today() }
  if (p === '30d')   return { from: daysAgo(30), to: today() }
  if (p === 'month') {
    const y = now.getFullYear(), m = now.getMonth() + 1
    return { from: `${y}-${String(m).padStart(2,'0')}-01`, to: today() }
  }
  if (p === 'prev') {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const l = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: localDate(f), to: localDate(l) }
  }
  return { from: daysAgo(30), to: today() }
}

// ─── Design tokens — Futuristic Dark ─────────────────────────────────────────
const T = {
  bg: '#060B14', bgSecondary: '#0A1120',
  surface: 'rgba(10,20,45,0.8)', surface2: 'rgba(255,255,255,0.05)', surfaceSolid: '#0D1830',
  border: 'rgba(0,212,255,0.12)', borderSub: 'rgba(255,255,255,0.07)',
  text: '#E8F0FF', textS: '#9AB8D8', dim: '#6080A0',
  accent: '#00D4FF', accentBg: 'rgba(0,212,255,0.08)', accentGlow: '0 0 20px rgba(0,212,255,0.3)',
  green: '#00FFB0', greenBg: 'rgba(0,255,176,0.08)',
  red: '#FF4D75', redBg: 'rgba(255,77,117,0.08)',
  yellow: '#FBBF24', yellowBg: 'rgba(251,191,36,0.08)',
  purple: '#A78BFA', purpleBg: 'rgba(167,139,250,0.08)',
  orange: '#FB923C', orangeBg: 'rgba(251,146,60,0.08)',
}
const glass = {
  background: 'rgba(10,20,45,0.7)',
  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  border: `1px solid ${T.border}`, borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
}
const inp = {
  background: 'rgba(255,255,255,0.05)', border: `1.5px solid ${T.border}`, borderRadius: 10,
  padding: '10px 14px', color: T.text, fontSize: 14, outline: 'none',
  width: '100%', boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif",
}

// ─── SVG Sparkline ────────────────────────────────────────────────────────────
function Sparkline({ values, color = T.accent }) {
  if (!values || values.length < 2) return null
  const W = 72, H = 28
  const min = Math.min(...values), max = Math.max(...values)
  const range = max === min ? 1 : max - min
  const px = (i) => (i / (values.length - 1)) * W
  const py = (v) => H - 2 - ((v - min) / range) * (H - 4)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <path d={d} fill="none" stroke={up ? color : T.red} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
    </svg>
  )
}

// ─── SVG Area + ROAS Chart ────────────────────────────────────────────────────
function AreaChart({ data, id = 'ac' }) {
  if (!data || data.length < 2) return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, fontSize: 13 }}>
      Necesitas al menos 2 días de datos para ver la gráfica
    </div>
  )
  const W = 800, H = 230
  const pad = { t: 22, r: 60, b: 32, l: 74 }
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b
  const maxSpend = Math.max(...data.map(d => d.spend), 1)
  const roasCeil = Math.max(Math.ceil(Math.max(...data.map(d => d.roas), 7)) + 2, 10)
  const xs = (i) => pad.l + (i / Math.max(data.length - 1, 1)) * iW
  const ys = (v) => pad.t + iH - (v / maxSpend) * iH
  const yr = (v) => pad.t + iH - (v / roasCeil) * iH
  const sp = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(d.spend).toFixed(1)}`).join(' ')
  const ap = `${sp} L${xs(data.length-1).toFixed(1)},${(pad.t+iH).toFixed(1)} L${pad.l},${(pad.t+iH).toFixed(1)}Z`
  const rp = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${yr(d.roas).toFixed(1)}`).join(' ')
  const step = Math.max(1, Math.ceil(data.length / 9))
  const target7y = yr(7)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id={`cg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={T.accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(r => {
        const y = pad.t + iH * (1 - r)
        return (
          <g key={r}>
            <line x1={pad.l} x2={W-pad.r} y1={y} y2={y} stroke={T.border} strokeWidth={r===0?1:0.5} strokeDasharray={r>0?'3 3':''} />
            {r > 0 && <text x={pad.l-7} y={y+4} textAnchor="end" fontSize="10" fill={T.dim} fontFamily="monospace">{fmtShort(maxSpend*r)}</text>}
          </g>
        )
      })}
      {/* ROAS 7x target line */}
      {target7y >= pad.t && target7y <= pad.t+iH && (
        <g>
          <line x1={pad.l} x2={W-pad.r} y1={target7y} y2={target7y} stroke={T.green} strokeWidth="1" strokeDasharray="6 3" opacity="0.6" />
          <text x={W-pad.r+8} y={target7y+4} fontSize="9" fill={T.green} fontFamily="monospace" fontWeight="700">7x ✓</text>
        </g>
      )}
      <path d={ap} fill={`url(#cg-${id})`} />
      <path d={sp} fill="none" stroke={T.accent} strokeWidth="2" strokeLinejoin="round" />
      <path d={rp} fill="none" stroke={T.green} strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => {
        if (i % step !== 0 && i !== data.length-1) return null
        return <circle key={i} cx={xs(i)} cy={yr(d.roas)} r="3.5" fill={roasColor(d.roas)} stroke="white" strokeWidth="1.5" />
      })}
      {data.map((d, i) => {
        if (i % step !== 0 && i !== data.length-1) return null
        return <text key={i} x={xs(i)} y={H-4} textAnchor="middle" fontSize="10" fill={T.dim}>{d.date.slice(5)}</text>
      })}
      {Array.from({length: Math.min(roasCeil+1, 12)}, (_,v) => v).filter(v => v % 2 === 0 || v === 7).map(v => (
        <text key={v} x={W-pad.r+8} y={yr(v)+4} fontSize="10" fill={v>=7?T.green:T.dim} fontFamily="monospace" fontWeight={v===7?'700':'400'}>{v}x</text>
      ))}
      <rect x={pad.l} y={5} width={14} height={4} rx="1" fill={T.accent} opacity="0.7" />
      <text x={pad.l+18} y={11} fontSize="10" fill={T.dim}>Gasto</text>
      <line x1={pad.l+60} y1={7} x2={pad.l+76} y2={7} stroke={T.green} strokeWidth="2" />
      <text x={pad.l+80} y={11} fontSize="10" fill={T.dim}>ROAS · objetivo 7x</text>
    </svg>
  )
}

// ─── Day-of-week Heatmap ──────────────────────────────────────────────────────
function DowHeatmap({ dailyData }) {
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const map = Array.from({length:7}, () => ({spend:0,purchaseValue:0,purchases:0,roas:0,n:0}))
  dailyData.forEach(d => {
    const [y,m,dy] = d.date.split('-').map(Number)
    const dow = new Date(y, m-1, dy).getDay()
    map[dow].spend += d.spend; map[dow].purchaseValue += d.purchaseValue
    map[dow].purchases += d.purchases; map[dow].n++
  })
  const days = DAYS.map((name, i) => ({
    name, n: map[i].n,
    avgSpend: map[i].n ? map[i].spend/map[i].n : 0,
    avgRoas:  map[i].n && map[i].spend > 0 ? map[i].purchaseValue/map[i].spend : 0,
    avgPurch: map[i].n ? map[i].purchases/map[i].n : 0,
  }))
  const maxRoas = Math.max(...days.map(d => d.avgRoas), 0.01)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
      {days.map((d, i) => {
        const rc = roasColor(d.avgRoas)
        return (
          <div key={i} style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: T.dim }}>{d.name}</p>
            <div style={{
              padding: '12px 4px', borderRadius: 12, border: `1px solid ${T.border}`,
              background: d.n > 0 ? `${roasBg(d.avgRoas)}` : T.surface2,
              borderColor: d.n > 0 && d.avgRoas >= 7 ? T.green : T.border,
            }}>
              {d.n > 0 ? <>
                <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:rc }}>{fmtRoas(d.avgRoas)}</p>
                <p style={{ margin:'0 0 2px', fontSize:10, color:T.dim }}>{fmtShort(d.avgSpend)} prom.</p>
                <p style={{ margin:0, fontSize:10, color:T.textS }}>{d.avgPurch.toFixed(1)} compras</p>
              </> : <p style={{ margin:0, fontSize:11, color:T.dim }}>—</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const c = scoreColor(score)
  const circ = 2 * Math.PI * 14
  const dash = (score / 100) * circ
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ position:'relative', width:36, height:36 }}>
        <svg viewBox="0 0 36 36" width="36" height="36" style={{ transform:'rotate(-90deg)' }}>
          <circle cx="18" cy="18" r="14" fill="none" stroke={T.border} strokeWidth="3.5" />
          <circle cx="18" cy="18" r="14" fill="none" stroke={c} strokeWidth="3.5"
            strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`} strokeLinecap="round" />
        </svg>
        <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:c }}>{score}</span>
      </div>
      <span style={{ fontSize:11, fontWeight:700, color:c }}>{scoreLabel(score)}</span>
    </div>
  )
}

// ─── Mini Sparkline (for table rows) ─────────────────────────────────────────
function MiniSparkline({ values, color = T.accent }) {
  if (!values || values.length < 2) return <span style={{ color:T.dim, fontSize:10 }}>—</span>
  const W=52, H=20
  const min=Math.min(...values), max=Math.max(...values)
  const range=max===min?1:max-min
  const px=(i)=>(i/(values.length-1))*W
  const py=(v)=>H-2-((v-min)/range)*(H-4)
  const d=values.map((v,i)=>`${i===0?'M':'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const up=values[values.length-1]>=values[0]
  const c=up?T.green:T.red
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <svg width={W} height={H}><path d={d} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/></svg>
      <span style={{ fontSize:9, color:c, fontWeight:700 }}>{up?'↑':'↓'}</span>
    </div>
  )
}

// ─── Scatter Plot: Gasto vs ROAS ──────────────────────────────────────────────
function ScatterPlot({ campaigns }) {
  if (!campaigns || campaigns.length === 0) return null
  const W=700, H=320
  const pad={t:30,r:30,b:40,l:80}
  const iW=W-pad.l-pad.r, iH=H-pad.t-pad.b
  const withSpend=campaigns.filter(c=>c.spend>0)
  if(withSpend.length===0) return null
  const maxSpend=Math.max(...withSpend.map(c=>c.spend))
  const maxRoas=Math.max(Math.max(...withSpend.map(c=>c.roas)),10)
  const maxPurch=Math.max(...withSpend.map(c=>c.purchases),1)
  const cx=(s)=>pad.l+(s/maxSpend)*iW
  const cy=(r)=>pad.t+iH-(Math.min(r,maxRoas)/maxRoas)*iH
  const cr=(p)=>Math.max(6, Math.min(28, 6+Math.sqrt(p/maxPurch)*22))
  const target7y=cy(7)
  const roasLines=[2,4,7,10].filter(v=>v<=maxRoas)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto' }}>
      {/* Grid */}
      {roasLines.map(v=>{
        const y=cy(v); const isTarget=v===7
        return (
          <g key={v}>
            <line x1={pad.l} x2={W-pad.r} y1={y} y2={y} stroke={isTarget?T.green:T.border} strokeWidth={isTarget?1.5:0.5} strokeDasharray={isTarget?'6 3':'3 3'} opacity={isTarget?0.7:0.5}/>
            <text x={pad.l-8} y={y+4} textAnchor="end" fontSize="10" fill={isTarget?T.green:T.dim} fontWeight={isTarget?'700':'400'}>{v}x</text>
          </g>
        )
      })}
      {/* Axis labels */}
      <text x={pad.l} y={H-4} fontSize="10" fill={T.dim}>$0</text>
      <text x={W-pad.r} y={H-4} textAnchor="end" fontSize="10" fill={T.dim}>{fmtShort(maxSpend)}</text>
      <text x={pad.l-32} y={pad.t+iH/2} fontSize="10" fill={T.dim} transform={`rotate(-90,${pad.l-32},${pad.t+iH/2})`}>ROAS</text>
      <text x={pad.l+iW/2} y={H-4} textAnchor="middle" fontSize="10" fill={T.dim}>Gasto</text>
      {/* Target zone label */}
      {target7y>=pad.t && <text x={W-pad.r-4} y={target7y-6} textAnchor="end" fontSize="9" fill={T.green} fontWeight="700">Objetivo 7x ✓</text>}
      {/* Bubbles */}
      {withSpend.map((c,i)=>{
        const x=cx(c.spend), y=cy(c.roas), r=cr(c.purchases)
        const col=roasColor(c.roas)
        const shortName=c.name?.replace(/\[.*?\]/g,'').trim().slice(0,22)
        return (
          <g key={c.id}>
            <circle cx={x} cy={y} r={r} fill={col} opacity="0.18"/>
            <circle cx={x} cy={y} r={r} fill="none" stroke={col} strokeWidth="1.8" opacity="0.7"/>
            <circle cx={x} cy={y} r="3" fill={col}/>
            {r>10 && <text x={x} y={y+r+11} textAnchor="middle" fontSize="8.5" fill={T.textS} fontWeight="500">{shortName}</text>}
          </g>
        )
      })}
      {/* Legend */}
      <circle cx={pad.l+8} cy={12} r="5" fill={T.green} opacity="0.3"/><circle cx={pad.l+8} cy={12} r="5" fill="none" stroke={T.green} strokeWidth="1.5"/>
      <text x={pad.l+17} y={16} fontSize="9" fill={T.dim}>ROAS ≥ 7x</text>
      <circle cx={pad.l+70} cy={12} r="5" fill={T.yellow} opacity="0.3"/><circle cx={pad.l+70} cy={12} r="5" fill="none" stroke={T.yellow} strokeWidth="1.5"/>
      <text x={pad.l+79} y={16} fontSize="9" fill={T.dim}>4-7x</text>
      <circle cx={pad.l+110} cy={12} r="5" fill={T.red} opacity="0.3"/><circle cx={pad.l+110} cy={12} r="5" fill="none" stroke={T.red} strokeWidth="1.5"/>
      <text x={pad.l+119} y={16} fontSize="9" fill={T.dim}>{'<'}4x · tamaño = compras</text>
    </svg>
  )
}

// ─── Base UI ──────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, v='primary', s='md', style:sx={}, disabled }) => {
  const vs = {
    primary:   { background:'linear-gradient(135deg,#00D4FF,#0080FF)', color:'#000', border:'none', boxShadow:'0 0 16px rgba(0,212,255,0.35)' },
    secondary: { background:'rgba(255,255,255,0.07)', color:T.textS, border:`1px solid ${T.border}` },
    danger:    { background:T.redBg, color:T.red, border:`1px solid rgba(255,77,117,0.25)` },
    ghost:     { background:'transparent', color:T.dim, border:'none' },
    success:   { background:'linear-gradient(135deg,#00FFB0,#00D4FF)', color:'#000', border:'none' },
  }
  const ss = { sm:{padding:'6px 12px',fontSize:12}, md:{padding:'9px 18px',fontSize:13}, lg:{padding:'12px 26px',fontSize:14} }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...vs[v], ...ss[s], borderRadius:10, fontWeight:700, cursor:disabled?'not-allowed':'pointer',
      display:'inline-flex', alignItems:'center', gap:6, fontFamily:"'DM Sans',sans-serif",
      opacity:disabled?0.45:1, whiteSpace:'nowrap', transition:'all .2s', letterSpacing:'0.2px', ...sx,
    }}>{children}</button>
  )
}
const Field = ({ label, sub, children }) => (
  <div style={{ marginBottom:16 }}>
    <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.textS, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</label>
    {children}
    {sub && <p style={{ margin:'5px 0 0', fontSize:11, color:T.dim }}>{sub}</p>}
  </div>
)
const Modal = ({ open, onClose, title, children, w=540 }) => {
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(12px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }} onClick={onClose}>
      <div style={{ ...glass, borderRadius:20, width:'100%', maxWidth:w, maxHeight:'90vh', overflow:'auto', boxShadow:'0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.15)' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'20px 26px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'rgba(6,11,20,0.95)', backdropFilter:'blur(20px)', borderRadius:'20px 20px 0 0', zIndex:1 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:T.text }}>{title}</h3>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.07)', border:`1px solid ${T.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', color:T.dim, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ padding:26, color:T.text }}>{children}</div>
      </div>
    </div>
  )
}
const TH = ({ k, label, sort, setSort }) => (
  <th onClick={() => setSort(s => toggleSort(s,k))} style={{ textAlign:'left', padding:'10px 14px', fontSize:10, fontWeight:700, color:sort.key===k?T.accent:T.dim, textTransform:'uppercase', letterSpacing:'0.6px', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none', background:'rgba(255,255,255,0.03)', borderBottom:`1px solid ${T.border}` }}>
    {label}{sort.key===k?(sort.dir>0?' ↑':' ↓'):''}
  </th>
)
const KPI = ({ label, value, sub, color=T.accent, sparkData, delta }) => (
  <div style={{ ...glass, padding:'20px 22px', position:'relative', overflow:'hidden' }}>
    <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, ${color}60, transparent)` }} />
    <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:700, color:T.dim, textTransform:'uppercase', letterSpacing:'0.8px' }}>{label}</p>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:8 }}>
      <div style={{ minWidth:0 }}>
        <p style={{ margin:0, fontSize:24, fontWeight:700, fontFamily:"'DM Mono',monospace", color, lineHeight:1.1, textShadow:`0 0 20px ${color}50` }}>{value}</p>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6, flexWrap:'wrap' }}>
          {sub && <p style={{ margin:0, fontSize:11, color:T.dim }}>{sub}</p>}
          {delta && <span style={{ fontSize:11, fontWeight:700, color: delta.up ? T.green : T.red, background: delta.up ? T.greenBg : T.redBg, padding:'2px 7px', borderRadius:6, border:`1px solid ${delta.up ? T.green : T.red}30` }}>{delta.label} vs ant.</span>}
        </div>
      </div>
      {sparkData && <Sparkline values={sparkData} color={color} />}
    </div>
  </div>
)
const RoasBadge = ({ roas, size='md' }) => (
  <span style={{ padding:size==='sm'?'3px 10px':'5px 14px', borderRadius:20, fontSize:size==='sm'?11:13, fontWeight:700, color:roasColor(roas), background:roasBg(roas), border:`1px solid ${roasColor(roas)}30`, textShadow:`0 0 8px ${roasColor(roas)}60` }}>
    {fmtRoas(roas)}
  </span>
)

// ─── Product Form ─────────────────────────────────────────────────────────────
function ProductForm({ data, onClose, onSave }) {
  const [f, setF] = useState(data
    ? { name:data.name, keywords:[...(data.keywords||[])], min_roas:data.min_roas||7.0 }
    : { name:'', keywords:[], min_roas:7.0 })
  const [kwInput, setKwInput] = useState('')
  const addKw = () => { const kw=kwInput.trim(); if(kw&&!f.keywords.includes(kw)){setF(p=>({...p,keywords:[...p.keywords,kw]}));setKwInput('')} }
  const removeKw = (kw) => setF(p=>({...p,keywords:p.keywords.filter(k=>k!==kw)}))
  return <>
    <Field label="Nombre del producto">
      <input style={inp} value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Extensor, Cubre Pezón, Plato Bebé..." />
    </Field>
    <Field label="Palabras clave en campañas" sub="Aparecen en el nombre de las campañas. Enter para agregar.">
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <input style={{...inp,flex:1}} value={kwInput} onChange={e=>setKwInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addKw()}}} placeholder="Ej: EXT, extensor..." />
        <Btn v="secondary" s="sm" onClick={addKw}>+ Agregar</Btn>
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', minHeight:28 }}>
        {f.keywords.map(kw=>(
          <span key={kw} style={{ padding:'3px 10px', borderRadius:20, background:T.accentBg, color:T.accent, fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
            {kw}<button onClick={()=>removeKw(kw)} style={{ background:'none', border:'none', cursor:'pointer', color:T.accent, padding:0, fontSize:13 }}>✕</button>
          </span>
        ))}
        {f.keywords.length===0 && <span style={{ fontSize:12, color:T.dim }}>Sin palabras clave aún</span>}
      </div>
    </Field>
    <Field label="ROAS mínimo objetivo" sub="Objetivo de la empresa: 7x — ideal 10x.">
      <input type="number" style={inp} value={f.min_roas} step="0.5" min="0" onChange={e=>setF({...f,min_roas:parseFloat(e.target.value)||7.0})} />
    </Field>
    <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
      <Btn v="secondary" onClick={onClose}>Cancelar</Btn>
      <Btn onClick={()=>onSave({name:f.name,keywords:f.keywords,min_roas:f.min_roas},data?.id)} disabled={!f.name}>Guardar</Btn>
    </div>
  </>
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginPage() {
  const [email,setEmail]=useState(''); const [pass,setPass]=useState('')
  const [loading,setLoading]=useState(false); const [error,setError]=useState('')
  const [mode,setMode]=useState('login')
  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (mode==='login') { const {error}=await supabase.auth.signInWithPassword({email,password:pass}); if(error)throw error }
      else { const {error}=await supabase.auth.signUp({email,password:pass}); if(error)throw error
        const {data:{user}}=await supabase.auth.getUser()
        if(user) await supabase.from('user_config').upsert({user_id:user.id,meta_token:'',usd_rate:4200})
      }
    } catch(err){setError(err.message)}
    setLoading(false)
  }
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:T.bg, padding:20, fontFamily:"'DM Sans',sans-serif", position:'relative', overflow:'hidden' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        .login-glow{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none}
      `}</style>
      <div className="login-glow" style={{ width:400, height:400, background:'rgba(0,212,255,0.08)', top:-100, left:-100 }} />
      <div className="login-glow" style={{ width:300, height:300, background:'rgba(167,139,250,0.07)', bottom:-80, right:-80 }} />
      <div style={{ ...glass, padding:'48px 40px', width:'100%', maxWidth:420, boxShadow:'0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.12)', position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:36, justifyContent:'center' }}>
          <div style={{ width:46, height:46, borderRadius:14, background:'linear-gradient(135deg,#00D4FF,#0080FF)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 24px rgba(0,212,255,0.4)', animation:'float 3s ease-in-out infinite' }}>
            <span style={{ color:'#000', fontWeight:900, fontSize:20, fontFamily:"'DM Mono',monospace" }}>G</span>
          </div>
          <div>
            <p style={{ margin:0, fontSize:20, fontWeight:800, color:T.text, letterSpacing:'-0.3px' }}>GrowthOS</p>
            <p style={{ margin:0, fontSize:11, color:T.dim }}>Analytics & Performance · Target 7-10x</p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <Field label="Correo"><input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" required /></Field>
          <Field label="Contraseña"><input style={inp} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" required minLength={6} /></Field>
          {error && <p style={{ color:T.red, fontSize:13, margin:'0 0 16px', padding:'10px 14px', background:T.redBg, borderRadius:10, border:`1px solid rgba(255,77,117,0.2)` }}>{error}</p>}
          <Btn style={{ width:'100%', justifyContent:'center', padding:'12px 0' }} disabled={loading}>
            {loading?'Cargando...':mode==='login'?'Iniciar sesión':'Crear cuenta'}
          </Btn>
        </form>
        <p style={{ textAlign:'center', margin:'22px 0 0', fontSize:13, color:T.dim }}>
          {mode==='login'?'¿No tienes cuenta?':'¿Ya tienes cuenta?'}{' '}
          <button onClick={()=>{setMode(mode==='login'?'signup':'login');setError('')}} style={{ background:'none', border:'none', color:T.accent, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:13, textShadow:'0 0 8px rgba(0,212,255,0.5)' }}>
            {mode==='login'?'Regístrate':'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user, navOffset = 0 }) {
  const [config,setConfig]         = useState({meta_token:'',usd_rate:4200})
  const [adAccounts,setAdAccounts] = useState([])
  const [products,setProducts]     = useState([])
  const [campaignMetrics,setCM]    = useState([])
  const [tab,setTab]               = useState('dashboard')
  const [period,setPeriod]         = useState('today')
  const [syncing,setSyncing]       = useState(false)
  const [syncMsg,setSyncMsg]       = useState('')
  const [modal,setModal]           = useState(null)
  const [dataLoaded,setDataLoaded] = useState(false)
  const [campSort,setCampSort]     = useState({key:'spend',dir:-1})
  const [adSort,setAdSort]         = useState({key:'score',dir:-1})
  const [prodSort,setProdSort]     = useState({key:'spend',dir:-1})
  const [campFilter,setCampFilter] = useState('')
  const [labEntries,setLabEntries] = useState([])
  const [labModal,setLabModal]     = useState(null)
  const [monthMetrics,setMonthMetrics] = useState([])
  const [prevMetrics,setPrevMetrics]   = useState([])
  const [loadError,setLoadError]       = useState('')
  const [confirmModal,setConfirmModal] = useState(null) // {msg, onConfirm}

  // ── Separate month metrics loader (C-04) ──────────────────────────────────
  const loadMonthMetrics = useCallback(async () => {
    const now = new Date()
    const mStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const {data:mm} = await supabase
      .from('campaign_metrics').select('date,spend,purchase_value,purchases')
      .eq('user_id',user.id).gte('date',mStart)
    if(mm) setMonthMetrics(mm)
  }, [user.id])

  // ── loadMetrics: carga período actual + período anterior para comparativas ──
  const loadMetrics = useCallback(async (p) => {
    setLoadError('')
    const {from,to} = getPeriodRange(p)
    // Calcular período anterior equivalente
    const dFrom = new Date(from), dTo = new Date(to)
    const days = Math.round((dTo - dFrom) / 86400000) + 1
    const prevTo   = new Date(dFrom); prevTo.setDate(prevTo.getDate() - 1)
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1)
    const pFrom = localDate(prevFrom), pTo = localDate(prevTo)
    try {
      const [pm,cm,prev] = await Promise.all([
        supabase.from('products').select('*').eq('user_id',user.id).order('name'),
        supabase.from('campaign_metrics').select('*').eq('user_id',user.id).gte('date',from).lte('date',to),
        supabase.from('campaign_metrics').select('spend,purchase_value,purchases,impressions,clicks').eq('user_id',user.id).gte('date',pFrom).lte('date',pTo),
      ])
      if(pm.error) throw new Error(`Productos: ${pm.error.message}`)
      if(cm.error) throw new Error(`Métricas: ${cm.error.message}`)
      if(pm.data) setProducts(pm.data)
      if(cm.data) setCM(cm.data)
      if(prev.data) setPrevMetrics(prev.data)
    } catch(err) {
      setLoadError(`Error cargando datos: ${err.message}. Recarga la página.`)
    }
  }, [user.id])

  // ── loadData: initial load only (C-02, A-04, M-07) ───────────────────────
  const loadData = useCallback(async () => {
    try {
      const [aa,cfg] = await Promise.all([
        supabase.from('ad_accounts').select('*').eq('user_id',user.id).order('name'),  // A-04: filtro user_id
        supabase.from('user_config').select('*').eq('user_id',user.id).single(),
      ])
      if(aa.data) setAdAccounts(aa.data)
      if(cfg.data) setConfig(cfg.data)
      else await supabase.from('user_config').upsert({user_id:user.id,meta_token:'',usd_rate:4200})
      await loadMonthMetrics()
      const {data:lb} = await supabase.from('learnings').select('*').eq('user_id',user.id).order('date',{ascending:false})
      if(lb) setLabEntries(lb)
      await loadMetrics(period)
    } catch(err) {
      setLoadError(`Error de carga inicial: ${err.message}`)
    } finally {
      setDataLoaded(true)
    }
  }, [user.id, loadMetrics, loadMonthMetrics])  // ← sin period (M-07)

  useEffect(()=>{ loadData() },[loadData])
  // Period change: only re-fetch metrics + month metrics (C-04)
  useEffect(()=>{ if(dataLoaded){ loadMetrics(period); loadMonthMetrics() } },[period, loadMetrics, loadMonthMetrics]) // eslint-disable-line react-hooks/exhaustive-deps
  // Auto-switch to 7d when entering Semanal tab
  useEffect(()=>{ if(tab==='semanal') setPeriod('7d') },[tab]) // eslint-disable-line react-hooks/exhaustive-deps
  // Poll last_sync every 2 min so cron updates are reflected without reloading
  useEffect(()=>{
    if(!user?.id) return
    const iv = setInterval(async()=>{
      const {data} = await supabase.from('user_config').select('last_sync').eq('user_id',user.id).single()
      if(data?.last_sync) setConfig(c=>({...c,last_sync:data.last_sync}))
    }, 120_000)
    return ()=>clearInterval(iv)
  },[user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const syncMeta = async () => {
    setSyncing(true); setSyncMsg('Sincronizando...')
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-meta-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ user_id: user.id, days_back: 30, discover_accounts: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      const r0 = result?.results?.[0]
      const errCount = r0?.errors?.length || 0
      setSyncMsg(r0
        ? `✓ ${r0.added} registros${errCount > 0 ? ` · ${errCount} errores` : ''}`
        : result?.error ? `⚠ ${result.error}` : '✓ Listo'
      )
      // last_sync is now written by the edge function itself; just refresh it locally
      const {data:freshCfg} = await supabase.from('user_config').select('last_sync').eq('user_id',user.id).single()
      if(freshCfg?.last_sync) setConfig(c=>({...c,last_sync:freshCfg.last_sync}))
      const {data:aa} = await supabase.from('ad_accounts').select('*').eq('user_id',user.id).order('name')
      if(aa) setAdAccounts(aa)
      await loadMonthMetrics()
      await loadMetrics(period)
    } catch(err) { setSyncMsg(`⚠ ${err.message}`) }
    setSyncing(false)
  }

  const saveConfig  = async (u) => { await supabase.from('user_config').update(u).eq('user_id',user.id); setConfig(c=>({...c,...u})) }
  const saveProduct = async (f,editId) => {
    if(editId) await supabase.from('products').update(f).eq('id',editId)
    else await supabase.from('products').insert({...f,user_id:user.id})
    setModal(null); loadMetrics(period)
  }
  const deleteProduct = (id) => {
    setConfirmModal({ msg:'¿Eliminar producto? Esta acción no se puede deshacer.', onConfirm: async () => {
      await supabase.from('products').delete().eq('id',id); loadMetrics(period)
    }})
  }

  const saveLearning = async (f, editId) => {
    if(editId) await supabase.from('learnings').update(f).eq('id',editId)
    else await supabase.from('learnings').insert({...f, user_id:user.id})
    setLabModal(null)
    const {data:lb}=await supabase.from('learnings').select('*').eq('user_id',user.id).order('date',{ascending:false})
    if(lb) setLabEntries(lb)
  }
  const deleteLearning = (id) => {
    setConfirmModal({ msg:'¿Eliminar aprendizaje? Esta acción no se puede deshacer.', onConfirm: async () => {
      await supabase.from('learnings').delete().eq('id',id)
      setLabEntries(e=>e.filter(x=>x.id!==id))
    }})
  }

  // ── Analytics ───────────────────────────────────────────────────────────────
  const totalSpend         = useMemo(()=>campaignMetrics.reduce((s,m)=>s+(m.spend||0),0),[campaignMetrics])
  const totalPurchaseValue = useMemo(()=>campaignMetrics.reduce((s,m)=>s+(m.purchase_value||0),0),[campaignMetrics])
  const totalPurchases     = useMemo(()=>campaignMetrics.reduce((s,m)=>s+(m.purchases||0),0),[campaignMetrics])
  const totalImpressions   = useMemo(()=>campaignMetrics.reduce((s,m)=>s+(m.impressions||0),0),[campaignMetrics])
  const totalClicks        = useMemo(()=>campaignMetrics.reduce((s,m)=>s+(m.clicks||0),0),[campaignMetrics])
  const totalAddToCart     = useMemo(()=>campaignMetrics.reduce((s,m)=>s+(m.add_to_cart||0),0),[campaignMetrics])
  const totalInitCheckout  = useMemo(()=>campaignMetrics.reduce((s,m)=>s+(m.initiate_checkout||0),0),[campaignMetrics])
  const globalRoas  = totalSpend>0 ? totalPurchaseValue/totalSpend : 0
  const globalCtr   = totalImpressions>0 ? totalClicks/totalImpressions*100 : 0
  const globalCpa   = totalPurchases>0 ? totalSpend/totalPurchases : 0
  const globalCpm   = totalImpressions>0 ? totalSpend/totalImpressions*1000 : 0

  // ── Período anterior — comparativas ─────────────────────────────────────────
  const prevSpend = useMemo(()=>prevMetrics.reduce((s,m)=>s+(m.spend||0),0),[prevMetrics])
  const prevPV    = useMemo(()=>prevMetrics.reduce((s,m)=>s+(m.purchase_value||0),0),[prevMetrics])
  const prevPurch = useMemo(()=>prevMetrics.reduce((s,m)=>s+(m.purchases||0),0),[prevMetrics])
  const prevImpr  = useMemo(()=>prevMetrics.reduce((s,m)=>s+(m.impressions||0),0),[prevMetrics])
  const prevClics = useMemo(()=>prevMetrics.reduce((s,m)=>s+(m.clicks||0),0),[prevMetrics])
  const prevRoas  = prevSpend>0 ? prevPV/prevSpend : 0
  const prevCtr   = prevImpr>0 ? prevClics/prevImpr*100 : 0
  const prevCpa   = prevPurch>0 ? prevSpend/prevPurch : 0
  const prevCpm   = prevImpr>0 ? prevSpend/prevImpr*1000 : 0
  // delta(current, previous) → "+12.3%" o "-5.1%"
  const delta = (cur, prev) => {
    if (!prev || prev === 0) return null
    const pct = ((cur - prev) / prev) * 100
    const sign = pct >= 0 ? '+' : ''
    return { pct, label: `${sign}${pct.toFixed(1)}%`, up: pct >= 0 }
  }

  // Daily
  const dailyData = useMemo(()=>{
    const map={}
    campaignMetrics.forEach(m=>{
      if(!map[m.date]) map[m.date]={date:m.date,spend:0,purchaseValue:0,purchases:0,impressions:0,clicks:0,addToCart:0}
      const d=map[m.date]
      d.spend+=m.spend||0; d.purchaseValue+=m.purchase_value||0; d.purchases+=m.purchases||0
      d.impressions+=m.impressions||0; d.clicks+=m.clicks||0; d.addToCart+=m.add_to_cart||0
    })
    return Object.values(map).sort((a,b)=>a.date.localeCompare(b.date))
      .map(d=>({...d, roas:d.spend>0?d.purchaseValue/d.spend:0, ctr:d.impressions>0?d.clicks/d.impressions*100:0}))
  },[campaignMetrics])

  const sparkSpend = useMemo(()=>dailyData.map(d=>d.spend),[dailyData])
  const sparkRoas  = useMemo(()=>dailyData.map(d=>d.roas),[dailyData])
  const sparkCtr   = useMemo(()=>dailyData.map(d=>d.ctr),[dailyData])
  const sparkPurch = useMemo(()=>dailyData.map(d=>d.purchases),[dailyData])

  // Account name lookup: ad_account_id → name
  const accountNameMap = useMemo(()=>adAccounts.reduce((m,a)=>{m[a.ad_account_id]=a.name;return m},{}),[adAccounts])
  const accountShort   = (actId) => { const n=accountNameMap[actId]; return n ? n.replace(/^CTA\s*/i,'') : actId?.slice(-6)||'—' }

  // Products
  const productStats = useMemo(()=>products.map(p=>{
    const rows=campaignMetrics.filter(m=>m.product_id===p.id)
    const spend=rows.reduce((s,m)=>s+(m.spend||0),0)
    const purchaseValue=rows.reduce((s,m)=>s+(m.purchase_value||0),0)
    const purchases=rows.reduce((s,m)=>s+(m.purchases||0),0)
    const addToCart=rows.reduce((s,m)=>s+(m.add_to_cart||0),0)
    const impressions=rows.reduce((s,m)=>s+(m.impressions||0),0)
    const roas=spend>0?purchaseValue/spend:0
    const cpa=purchases>0?spend/purchases:0
    const campaignCount=new Set(rows.map(m=>m.campaign_id).filter(Boolean)).size
    return {...p,spend,purchaseValue,purchases,addToCart,impressions,roas,cpa,campaignCount,potential:scalePotential(roas)}
  }),[products,campaignMetrics])

  const sortedProducts = useMemo(()=>[...productStats].sort((a,b)=>prodSort.dir*((b[prodSort.key]||0)-(a[prodSort.key]||0))),[productStats,prodSort])

  // Campaigns
  const campaignStats = useMemo(()=>{
    const cMap={}
    campaignMetrics.forEach(m=>{
      if(!m.campaign_id) return
      if(!cMap[m.campaign_id]) cMap[m.campaign_id]={id:m.campaign_id,name:m.campaign_name,ad_account_id:m.ad_account_id,platform:m.platform||'meta',spend:0,impressions:0,clicks:0,purchases:0,purchase_value:0,add_to_cart:0,initiate_checkout:0}
      const c=cMap[m.campaign_id]
      c.spend+=m.spend||0; c.impressions+=m.impressions||0; c.clicks+=m.clicks||0
      c.purchases+=m.purchases||0; c.purchase_value+=m.purchase_value||0
      c.add_to_cart+=m.add_to_cart||0; c.initiate_checkout+=m.initiate_checkout||0
    })
    return Object.values(cMap).map(c=>({
      ...c,
      ctr:      c.impressions>0?c.clicks/c.impressions*100:0,
      cpc:      c.clicks>0?c.spend/c.clicks:0,
      cpm:      c.impressions>0?c.spend/c.impressions*1000:0,
      roas:     c.spend>0?c.purchase_value/c.spend:0,
      cpa:      c.purchases>0?c.spend/c.purchases:0,
      conv_rate:c.clicks>0?c.purchases/c.clicks*100:0,
    }))
  },[campaignMetrics])

  const filteredCamps = useMemo(()=>campaignStats.filter(c=>!campFilter||c.name?.toLowerCase().includes(campFilter.toLowerCase())),[campaignStats,campFilter])
  const sortedCamps   = useMemo(()=>[...filteredCamps].sort((a,b)=>campSort.dir*((b[campSort.key]||0)-(a[campSort.key]||0))),[filteredCamps,campSort])

  // Ads
  const adStats = useMemo(()=>{
    const aMap={}
    campaignMetrics.forEach(m=>{
      if(!m.ad_id) return
      if(!aMap[m.ad_id]) aMap[m.ad_id]={id:m.ad_id,name:m.ad_name,campaign_name:m.campaign_name,ad_account_id:m.ad_account_id,platform:m.platform||'meta',spend:0,impressions:0,purchases:0,purchase_value:0,video_plays:0,video_p25:0,video_p50:0,video_p75:0,video_p95:0,video_p100:0,_wt:0,_wc:0}
      const a=aMap[m.ad_id]
      a.spend+=m.spend||0; a.impressions+=m.impressions||0; a.purchases+=m.purchases||0; a.purchase_value+=m.purchase_value||0
      a.video_plays+=m.video_plays||0; a.video_p25+=m.video_p25||0; a.video_p50+=m.video_p50||0
      a.video_p75+=m.video_p75||0; a.video_p95+=m.video_p95||0; a.video_p100+=m.video_p100||0
      if(m.video_avg_watch_time){a._wt+=m.video_avg_watch_time;a._wc++}
    })
    return Object.values(aMap).map(a=>({
      ...a,
      roas:            a.spend>0?a.purchase_value/a.spend:0,
      hook_rate:       a.impressions>0?a.video_p25/a.impressions*100:0,
      hold_rate:       a.video_p25>0?a.video_p50/a.video_p25*100:0,
      completion_rate: a.video_plays>0?a.video_p100/a.video_plays*100:0,
      avg_watch:       a._wc>0?a._wt/a._wc:0,
      cpa:             a.purchases>0?a.spend/a.purchases:0,
    })).map(a=>({...a, score:calcScore(a)}))
  },[campaignMetrics])

  const sortedAds = useMemo(()=>[...adStats].sort((a,b)=>adSort.dir*((b[adSort.key]||0)-(a[adSort.key]||0))),[adStats,adSort])

  // Budget pacing
  const pacingData = useMemo(()=>{
    const now=new Date()
    const dom=now.getDate()
    const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate()
    const daysPct=dom/dim
    const monthBudget=config.monthly_budget||0
    const monthSpend=monthMetrics.reduce((s,m)=>s+(m.spend||0),0)
    const spendPct=monthBudget>0?monthSpend/monthBudget:0
    const diff=spendPct-daysPct
    return {dom,dim,daysPct,monthSpend,monthBudget,spendPct,diff}
  },[monthMetrics,config.monthly_budget])

  // Monthly projection
  const projectionData = useMemo(()=>{
    const now=new Date()
    const dom=now.getDate()
    const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate()
    if(!monthMetrics.length||dom===0) return null
    const byDate={}
    monthMetrics.forEach(m=>{
      if(!byDate[m.date]) byDate[m.date]={spend:0,pv:0,purchases:0}
      byDate[m.date].spend+=m.spend||0; byDate[m.date].pv+=m.purchase_value||0; byDate[m.date].purchases+=m.purchases||0
    })
    const days=Object.values(byDate)
    const avgSpend=days.reduce((s,d)=>s+d.spend,0)/days.length
    // A-01: ROAS correcto = totalPV / totalSpend (ponderado), no promedio de ratios diarios
    const totalS=days.reduce((s,d)=>s+d.spend,0)
    const totalPV=days.reduce((s,d)=>s+d.pv,0)
    const avgRoas=totalS>0?totalPV/totalS:0
    return { projSpend:avgSpend*dim, projRevenue:avgSpend*dim*avgRoas, projRoas:avgRoas, daysLeft:dim-dom, dom, dim }
  },[monthMetrics])

  // Per-campaign 7-day ROAS sparklines
  const campRoasHistory = useMemo(()=>{
    const map={}
    campaignMetrics.forEach(m=>{
      if(!m.campaign_id) return
      if(!map[m.campaign_id]) map[m.campaign_id]={}
      if(!map[m.campaign_id][m.date]) map[m.campaign_id][m.date]={spend:0,pv:0}
      map[m.campaign_id][m.date].spend+=m.spend||0
      map[m.campaign_id][m.date].pv+=m.purchase_value||0
    })
    const res={}
    Object.entries(map).forEach(([cid,dates])=>{
      const sorted=Object.entries(dates).sort(([a],[b])=>a.localeCompare(b)).slice(-7)
      res[cid]=sorted.map(([,d])=>d.spend>0?d.pv/d.spend:0)
    })
    return res
  },[campaignMetrics])

  // Ad fatigue: frequency = total_impressions / total_reach (A-02: corrected formula)
  const adFreqMap = useMemo(()=>{
    const map = {}
    campaignMetrics.forEach(m=>{
      if(!m.ad_id) return
      if(!map[m.ad_id]) map[m.ad_id]={sumI:0,sumR:0}
      map[m.ad_id].sumI += m.impressions||0
      map[m.ad_id].sumR += m.reach||0
    })
    const res = {}
    Object.entries(map).forEach(([id,d])=>{ res[id]=d.sumR>0?d.sumI/d.sumR:0 })
    return res
  },[campaignMetrics])

  // Decision engine — exhaustivo y mutuamente excluyente: toda campaña con gasto aparece en exactamente 1 columna
  const toScale  = useMemo(()=>campaignStats.filter(c=>c.spend>0&&c.roas>=7),[campaignStats])
  const toOptim  = useMemo(()=>campaignStats.filter(c=>c.spend>0&&c.roas>=4&&c.roas<7),[campaignStats])
  const toTest   = useMemo(()=>campaignStats.filter(c=>c.spend>0&&c.roas>=2&&c.roas<4),[campaignStats])
  const toPause  = useMemo(()=>campaignStats.filter(c=>c.spend>0&&c.roas<2),[campaignStats])

  // Alerts — productos bajo objetivo ROAS
  const alerts = productStats.filter(p=>p.spend>0&&p.roas>0&&p.roas<(p.min_roas||7))

  // Alertas inteligentes — frecuencia alta, pacing, fugas
  const smartAlerts = useMemo(()=>{
    const list = []
    // Creativos con frecuencia > 3.5x
    const fatiguedAds = adStats.filter(a=>adFreqMap[a.id]>3.5&&a.spend>0)
    if(fatiguedAds.length>0)
      list.push({ level:'warn', icon:'🔥', msg:`${fatiguedAds.length} creativo${fatiguedAds.length>1?'s':''} con frecuencia alta (>${3.5}x) — rotación urgente` })
    // Campañas quemando dinero hoy (ROAS < 2x con gasto)
    if(toPause.length>0){
      const totalWaste = toPause.reduce((s,c)=>s+c.spend,0)
      list.push({ level:'danger', icon:'⛔', msg:`${toPause.length} campaña${toPause.length>1?'s':''} con ROAS < 2x — ${fmt(totalWaste)} en riesgo` })
    }
    // Pacing adelantado >15% — riesgo de agotar presupuesto antes de fin de mes
    if(pacingData.monthBudget>0 && pacingData.diff>0.15)
      list.push({ level:'warn', icon:'⚡', msg:`Pacing adelantado ${fmtPct(pacingData.diff*100)} — presupuesto puede agotarse el día ${Math.round(pacingData.dom/pacingData.spendPct)}` })
    // Pacing atrasado >15% — presupuesto subutilizado
    if(pacingData.monthBudget>0 && pacingData.diff < -0.15)
      list.push({ level:'info', icon:'💤', msg:`Pacing atrasado ${fmtPct(Math.abs(pacingData.diff)*100)} — presupuesto subutilizado` })
    // ROAS global bajo objetivo
    if(campaignMetrics.length>0 && globalRoas>0 && globalRoas<4)
      list.push({ level:'danger', icon:'📉', msg:`ROAS global ${fmtRoas(globalRoas)} — por debajo del mínimo 4x` })
    return list
  },[adStats,adFreqMap,toPause,pacingData,globalRoas,campaignMetrics])
  const hasData = campaignMetrics.length>0
  const PERIODS = [{k:'today',l:'Hoy'},{k:'7d',l:'7D'},{k:'30d',l:'30D'},{k:'month',l:'Este mes'},{k:'prev',l:'Mes ant.'}]
  const tabs = [
    {id:'dashboard',label:'● Dashboard'},{id:'campanas',label:'Campañas'},
    {id:'creativos',label:'Creativos'},{id:'productos',label:'Productos'},
    {id:'lab',label:'🧪 Lab'},{id:'semanal',label:'📊 Semanal'},{id:'setup',label:'Setup'},
  ]

  if(!dataLoaded) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:T.bg, flexDirection:'column', gap:16 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <div style={{ width:32, height:32, border:`2px solid rgba(0,212,255,0.2)`, borderTopColor:T.accent, borderRadius:'50%', animation:'spin .7s linear infinite', boxShadow:'0 0 16px rgba(0,212,255,0.3)' }} />
      <p style={{ color:T.dim, fontSize:13, margin:0, fontFamily:"'DM Sans',sans-serif" }}>Cargando datos...</p>
    </div>
  )

  const SIDEBAR_W = 220
  const NAV_ICONS = { dashboard:'◈', campanas:'◎', creativos:'◉', productos:'⬡', lab:'⬢', semanal:'◑', setup:'◐' }

  return (
    <div style={{ background:T.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", display:'flex', color:T.text }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glow{0%,100%{box-shadow:0 0 8px rgba(0,212,255,0.2)}50%{box-shadow:0 0 20px rgba(0,212,255,0.5)}}
        input:focus,select:focus,textarea:focus{border-color:${T.accent}!important;box-shadow:0 0 0 3px rgba(0,212,255,0.1)!important;outline:none!important}
        input,select,textarea{color:${T.text}!important}
        input::placeholder,textarea::placeholder{color:${T.dim}!important}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(0,212,255,0.2);border-radius:4px}
        table{color:${T.text}}
        table tbody tr:hover td{background:rgba(0,212,255,0.04)!important}
        select option{background:#0D1830;color:#E8F0FF}
        p,span,div,td,th,h1,h2,h3,h4,label{color:inherit}
        * { box-sizing: border-box }
        body { background: ${T.bg}; margin:0; color:${T.text} }
        .bg-grid{
          background-image: linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>

      {/* ── Sidebar ── */}
      <aside style={{ width:SIDEBAR_W, minHeight:'100vh', background:'rgba(6,11,20,0.95)', backdropFilter:'blur(20px)', borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', position:'fixed', top:0, left:navOffset, bottom:0, zIndex:100 }}>
        {/* Logo */}
        <div style={{ padding:'24px 20px 20px', borderBottom:`1px solid ${T.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:11, background:'linear-gradient(135deg,#00D4FF,#0080FF)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 18px rgba(0,212,255,0.4)', flexShrink:0 }}>
              <span style={{ color:'#000', fontWeight:900, fontSize:16, fontFamily:"'DM Mono',monospace" }}>G</span>
            </div>
            <div>
              <p style={{ margin:0, fontSize:15, fontWeight:800, color:T.text, letterSpacing:'-0.3px' }}>GrowthOS</p>
              <p style={{ margin:0, fontSize:9, color:T.dim, letterSpacing:'0.5px' }}>TARGET 7x · IDEAL 10x</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:2 }}>
          {tabs.map(t=>{
            const active = tab === t.id
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'none',
                cursor:'pointer', textAlign:'left', fontFamily:"'DM Sans',sans-serif", width:'100%', transition:'all .15s',
                background: active ? 'rgba(0,212,255,0.1)' : 'transparent',
                color: active ? T.accent : T.dim,
                borderLeft: active ? `2px solid ${T.accent}` : '2px solid transparent',
                boxShadow: active ? '0 0 12px rgba(0,212,255,0.1)' : 'none',
              }}>
                <span style={{ fontSize:14, width:18, textAlign:'center', opacity: active ? 1 : 0.6 }}>{NAV_ICONS[t.id]}</span>
                <span style={{ fontSize:13, fontWeight:active?700:500 }}>{t.label.replace(/[●🧪📊]/g,'').trim()}</span>
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding:'14px 16px', borderTop:`1px solid ${T.border}` }}>
          {config.meta_token && (
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:T.green, boxShadow:`0 0 6px ${T.green}`, animation:'glow 2s ease-in-out infinite' }} />
              <span style={{ fontSize:11, color:T.green, fontWeight:600 }}>Meta conectado</span>
            </div>
          )}
          <p style={{ margin:'0 0 8px', fontSize:11, color:T.dim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</p>
          <button onClick={()=>supabase.auth.signOut()} style={{ background:'rgba(255,77,117,0.08)', border:'1px solid rgba(255,77,117,0.2)', borderRadius:8, padding:'6px 12px', color:T.red, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", width:'100%' }}>Cerrar sesión</button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ marginLeft:SIDEBAR_W + navOffset, flex:1, display:'flex', flexDirection:'column', minHeight:'100vh' }}>

        {/* Top bar */}
        <header style={{ background:'rgba(6,11,20,0.9)', backdropFilter:'blur(20px)', borderBottom:`1px solid ${T.border}`, padding:'0 28px', display:'flex', alignItems:'center', justifyContent:'space-between', height:58, position:'sticky', top:0, zIndex:50 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {tab!=='setup' && (
              <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:24, padding:'4px 6px' }}>
                {PERIODS.map(p=>(
                  <button key={p.k} onClick={()=>setPeriod(p.k)} style={{ padding:'4px 14px', borderRadius:18, border:'none', background:period===p.k?T.accent:'transparent', color:period===p.k?'#000':T.dim, fontSize:12, fontWeight:period===p.k?700:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all .15s', boxShadow:period===p.k?'0 0 12px rgba(0,212,255,0.4)':'none' }}>
                    {p.l}
                  </button>
                ))}
              </div>
            )}
            {pacingData.monthBudget>0 && tab!=='setup' && (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 12px', background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:20 }}>
                <div style={{ width:80, height:4, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden', position:'relative' }}>
                  <div style={{ position:'absolute', left:`${pacingData.daysPct*100}%`, top:0, bottom:0, width:1, background:T.dim, zIndex:2 }}/>
                  <div style={{ height:'100%', borderRadius:2, width:`${Math.min(pacingData.spendPct*100,100)}%`, background: pacingData.diff>0.05?T.red:pacingData.diff<-0.05?T.green:T.yellow, transition:'width .4s', boxShadow:`0 0 6px ${pacingData.diff>0.05?T.red:pacingData.diff<-0.05?T.green:T.yellow}80` }}/>
                </div>
                <span style={{ fontSize:11, color: pacingData.diff>0.05?T.red:pacingData.diff<-0.05?T.green:T.yellow, fontWeight:600, whiteSpace:'nowrap' }}>
                  {(pacingData.spendPct*100).toFixed(0)}% presup.
                </span>
              </div>
            )}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {config.last_sync && !syncing && !syncMsg && (
              <span style={{ fontSize:11, color:T.dim }}>sync {fmtRelTime(config.last_sync)}</span>
            )}
            {syncing && <span style={{ fontSize:12, color:T.accent, animation:'pulse 1.2s infinite' }}>{syncMsg}</span>}
            {!syncing && syncMsg && <span style={{ fontSize:12, color:T.dim }}>{syncMsg}</span>}
            <Btn v="secondary" s="sm" onClick={syncMeta} disabled={syncing||!config.meta_token}>⟳ Sync</Btn>
          </div>
        </header>

        {/* Load error banner */}
        {loadError && (
          <div style={{ background:'rgba(255,77,117,0.08)', borderBottom:`1px solid rgba(255,77,117,0.2)`, padding:'10px 28px', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:13, fontWeight:700, color:T.red }}>⚠ {loadError}</span>
            <Btn v="danger" s="sm" onClick={()=>{ setLoadError(''); loadData() }}>Reintentar</Btn>
          </div>
        )}

        {/* Smart alerts strip */}
        {(alerts.length>0||smartAlerts.length>0) && (
          <div style={{ borderBottom:`1px solid ${T.border}`, padding:'6px 28px', display:'flex', gap:8, alignItems:'center', overflowX:'auto', background:'rgba(6,11,20,0.6)', flexWrap:'nowrap' }}>
            {alerts.map(p=>(
              <span key={p.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:20, background:T.redBg, border:`1px solid rgba(255,77,117,0.25)`, fontSize:11, fontWeight:600, color:T.red, whiteSpace:'nowrap', flexShrink:0 }}>
                🎯 {p.name} · {fmtRoas(p.roas)} <span style={{ color:T.dim, fontWeight:400 }}>(obj {p.min_roas}x)</span>
              </span>
            ))}
            {smartAlerts.map((a,i)=>{
              const col = a.level==='danger' ? T.red : a.level==='warn' ? T.yellow : T.accent
              const bg  = a.level==='danger' ? T.redBg : a.level==='warn' ? T.yellowBg : T.accentBg
              return (
                <span key={i} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:20, background:bg, border:`1px solid ${col}25`, fontSize:11, fontWeight:600, color:col, whiteSpace:'nowrap', flexShrink:0 }}>
                  {a.icon} {a.msg}
                </span>
              )
            })}
          </div>
        )}

      <main className="bg-grid" style={{ flex:1, padding:'28px 28px 80px', animation:'fadeIn .3s ease' }}>

        {/* ═══════════════ DASHBOARD ═══════════════ */}
        {tab==='dashboard' && <>

          {/* ── Centro de Comando ── */}
          {hasData && (
            <div style={{ marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>Centro de Comando</h2>
                  <span style={{ fontSize:12, color:T.dim }}>Todas las campañas activas · {campaignStats.filter(c=>c.spend>0).length} en total</span>
                </div>
                <span style={{ fontSize:11, color:T.dim, background:T.surface2, padding:'4px 12px', borderRadius:20, border:`1px solid ${T.border}` }}>
                  ≥7x Escalar · 4-7x Optimizar · 2-4x Testear · {'<'}2x Pausar
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>

                {/* ESCALAR */}
                {[
                  { label:'🚀 ESCALAR', sub:'ROAS ≥ 7x · subir presupuesto ya', color:T.green, bg:'rgba(5,150,105,0.07)', border:`${T.green}30`, items:toScale, sortKey:'roas', emptyMsg:'Sin campañas en zona óptima aún', emptyColor:T.dim },
                  { label:'📈 OPTIMIZAR', sub:'ROAS 4–7x · mejorar creativo', color:T.yellow, bg:'rgba(217,119,6,0.07)', border:`${T.yellow}30`, items:toOptim, sortKey:'roas', emptyMsg:'Sin campañas en esta zona', emptyColor:T.dim },
                  { label:'🧪 TESTEAR', sub:'ROAS 2–4x · necesita más datos', color:T.accent, bg:'rgba(37,99,235,0.07)', border:`${T.accent}30`, items:toTest, sortKey:'spend', emptyMsg:'Sin campañas en zona de test', emptyColor:T.dim },
                  { label:'⛔ PAUSAR', sub:'ROAS < 2x · fuga de dinero', color:T.red, bg:'rgba(220,38,38,0.07)', border:`${T.red}30`, items:toPause, sortKey:'spend', emptyMsg:'✓ Sin fugas detectadas', emptyColor:T.green },
                ].map(col=>(
                  <div key={col.label} style={{ background:T.surface, border:`1.5px solid ${col.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                    <div style={{ padding:'12px 16px', background:col.bg, borderBottom:`1px solid ${col.border}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:12, fontWeight:800, color:col.color }}>{col.label}</span>
                        <span style={{ padding:'2px 8px', borderRadius:20, background:col.color, color:'#fff', fontSize:11, fontWeight:700 }}>{col.items.length}</span>
                      </div>
                      <p style={{ margin:'3px 0 0', fontSize:10, color:T.textS }}>{col.sub}</p>
                    </div>
                    <div style={{ maxHeight:320, overflowY:'auto' }}>
                      {col.items.length===0
                        ? <p style={{ margin:0, padding:'14px 16px', fontSize:12, color:col.emptyColor }}>{col.emptyMsg}</p>
                        : [...col.items].sort((a,b)=>b[col.sortKey]-a[col.sortKey]).map(c=>(
                          <div key={c.id} style={{ padding:'8px 14px', borderBottom:`1px solid ${T.border}20` }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
                              <div style={{ minWidth:0, flex:1 }}>
                                <div style={{ fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.3 }} title={c.name}>{c.name}</div>
                                <div style={{ fontSize:10, color:T.dim, marginTop:2 }}>{accountShort(c.ad_account_id)} · {fmt(c.spend)}</div>
                              </div>
                              <RoasBadge roas={c.roas} size="sm" />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── KPIs ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:12 }}>
            <KPI label="Gasto total"       value={fmt(totalSpend)}         sub={`${fmtN(totalImpressions)} impresiones`}  color={T.accent} sparkData={sparkSpend} delta={delta(totalSpend,prevSpend)} />
            <KPI label="Ventas atribuidas" value={fmt(totalPurchaseValue)} sub={`${fmtN(totalPurchases)} compras pixel`} color={T.green}  sparkData={sparkPurch} delta={delta(totalPurchaseValue,prevPV)} />
            <KPI label="ROAS global"       value={<RoasBadge roas={globalRoas}/>} sub="obj 7x · ideal 10x"              color={roasColor(globalRoas)} sparkData={sparkRoas} delta={delta(globalRoas,prevRoas)} />
            <KPI label="CPA"               value={fmt(globalCpa)}          sub="Costo por compra"                       color={T.purple} delta={delta(globalCpa,prevCpa)} />
            <KPI label="CTR"               value={fmtPct(globalCtr)}       sub={`${fmtN(totalClicks)} clics`}           color={T.orange} sparkData={sparkCtr} delta={delta(globalCtr,prevCtr)} />
            <KPI label="CPM"               value={fmt(globalCpm)}          sub="por mil impresiones"                    color={T.textS} delta={delta(globalCpm,prevCpm)} />
          </div>

          {/* ── Funnel ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
            {[
              {label:'Clics',         val:totalClicks,       pct:null,                                                          color:T.accent,  cost:null},
              {label:'Add to Cart',   val:totalAddToCart,    pct:totalClicks>0?totalAddToCart/totalClicks*100:0,                 color:T.accent,  cost:totalAddToCart>0?totalSpend/totalAddToCart:0},
              {label:'Init. Checkout',val:totalInitCheckout, pct:totalAddToCart>0?totalInitCheckout/totalAddToCart*100:0,        color:T.yellow,  cost:totalInitCheckout>0?totalSpend/totalInitCheckout:0},
              {label:'Compras',       val:totalPurchases,    pct:totalInitCheckout>0?totalPurchases/totalInitCheckout*100:0,     color:T.green,   cost:totalPurchases>0?totalSpend/totalPurchases:0},
            ].map((f,i)=>(
              <div key={i} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px 18px', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:600, color:T.dim, textTransform:'uppercase', letterSpacing:'0.4px' }}>{f.label}</p>
                <p style={{ margin:0, fontSize:20, fontWeight:700, fontFamily:"'DM Mono',monospace", color:f.color }}>{fmtN(f.val)}</p>
                {f.pct!==null && <p style={{ margin:'3px 0 3px', fontSize:11, color:T.dim }}>{fmtPct(f.pct)} del paso anterior</p>}
                {f.cost>0 && <p style={{ margin:'0 0 6px', fontSize:11, fontWeight:600, color:T.textS }}>Costo: {fmt(f.cost)}</p>}
                {f.pct===null && <div style={{ marginBottom:6 }}/>}
                <div style={{ height:3, borderRadius:2, background:T.border }}>
                  <div style={{ height:'100%', borderRadius:2, background:f.color, width:`${Math.min(f.pct||((i===0)?100:0),100)}%`, transition:'width .4s ease' }} />
                </div>
              </div>
            ))}
          </div>

          {/* ── Trend chart ── */}
          {dailyData.length>0 && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'20px 24px', marginBottom:24, boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
                <div>
                  <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>Tendencia Diaria</h3>
                  <p style={{ margin:'3px 0 0', fontSize:12, color:T.dim }}>Gasto y ROAS por día · línea verde = objetivo 7x</p>
                </div>
                <div style={{ display:'flex', gap:20, fontSize:12, color:T.dim }}>
                  <span>Mejor ROAS: <strong style={{ color:T.green }}>{dailyData.length>0?fmtRoas(Math.max(...dailyData.map(d=>d.roas))):'-'}</strong></span>
                  <span>Promedio diario: <strong style={{ color:T.accent }}>{fmt(totalSpend/Math.max(dailyData.length,1))}</strong></span>
                  <span>Días ≥ 7x: <strong style={{ color:T.green }}>{dailyData.filter(d=>d.roas>=7).length}</strong></span>
                </div>
              </div>
              <AreaChart data={dailyData} />
            </div>
          )}

          {/* ── Día de semana heatmap ── */}
          {dailyData.length>=3 && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'20px 24px', marginBottom:24, boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div style={{ marginBottom:14 }}>
                <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>Rendimiento por Día de Semana</h3>
                <p style={{ margin:'3px 0 0', fontSize:12, color:T.dim }}>ROAS y gasto promedio · identifica los mejores días para pautar</p>
              </div>
              <DowHeatmap dailyData={dailyData} />
            </div>
          )}

          {/* ── Proyección fin de mes ── */}
          {projectionData && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:24 }}>
              {[
                { label:'Gasto proyectado', value:fmt(projectionData.projSpend), sub:`${projectionData.daysLeft} días restantes`, color:T.accent },
                { label:'Ingresos proyectados', value:fmt(projectionData.projRevenue), sub:'A ritmo actual', color:T.green },
                { label:'ROAS proyectado', value:<RoasBadge roas={projectionData.projRoas}/>, sub:`Promedio diario del mes`, color:roasColor(projectionData.projRoas) },
                { label:'Días transcurridos', value:`${projectionData.dom}/${projectionData.dim}`, sub:`${((projectionData.dom/projectionData.dim)*100).toFixed(0)}% del mes`, color:T.purple },
              ].map((c,i)=>(
                <div key={i} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:'16px 20px', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:c.color, opacity:0.4, borderRadius:'14px 14px 0 0' }}/>
                  <p style={{ margin:'0 0 6px', fontSize:10, fontWeight:600, color:T.dim, textTransform:'uppercase', letterSpacing:'0.5px' }}>{c.label}</p>
                  <p style={{ margin:0, fontSize:20, fontWeight:700, fontFamily:"'DM Mono',monospace", color:c.color }}>{c.value}</p>
                  <p style={{ margin:'4px 0 0', fontSize:11, color:T.dim }}>{c.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Scatter: Gasto vs ROAS ── */}
          {campaignStats.filter(c=>c.spend>0).length>=3 && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'20px 24px', marginBottom:24, boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div style={{ marginBottom:14 }}>
                <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>Mapa de Campañas · Gasto vs ROAS</h3>
                <p style={{ margin:'3px 0 0', fontSize:12, color:T.dim }}>Burbuja grande = más compras · zona verde = objetivo 7x · escalar las de arriba a la derecha</p>
              </div>
              <ScatterPlot campaigns={campaignStats.filter(c=>c.spend>0)} />
            </div>
          )}

          {/* ── ROAS por Producto ── */}
          {products.length>0 && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden', marginBottom:20, boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div style={{ padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>ROAS por Producto</h3>
                <Btn v="ghost" s="sm" onClick={()=>setTab('productos')}>Ver todos →</Btn>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr>
                    {['Producto','Gasto','Ventas attr.','ROAS','Compras','CPA','Potencial de escala'].map(h=>(
                      <th key={h} style={{ textAlign:'left', padding:'9px 14px', fontSize:11, fontWeight:600, color:T.dim, textTransform:'uppercase', background:'rgba(255,255,255,0.03)' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {productStats.filter(p=>p.spend>0).sort((a,b)=>b.spend-a.spend).map(p=>(
                      <tr key={p.id} style={{ borderBottom:`1px solid ${T.border}20` }}>
                        <td style={{ padding:'12px 14px', fontWeight:600 }}>{p.name}</td>
                        <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontWeight:600, color:T.accent }}>{fmt(p.spend)}</td>
                        <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace" }}>{fmt(p.purchaseValue)}</td>
                        <td style={{ padding:'12px 14px' }}><RoasBadge roas={p.roas} /></td>
                        <td style={{ padding:'12px 14px', color:T.textS }}>{fmtN(p.purchases)}</td>
                        <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", color:T.dim }}>{p.cpa>0?fmt(p.cpa):'—'}</td>
                        <td style={{ padding:'12px 14px' }}>
                          {p.spend>0 && <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, color:p.potential.color, background:p.potential.bg }}>{p.potential.label}</span>}
                        </td>
                      </tr>
                    ))}
                    {productStats.filter(p=>p.spend>0).length===0 && (
                      <tr><td colSpan={7} style={{ padding:'30px', textAlign:'center', color:T.dim }}>
                        {products.length>0?'Sin gasto en este período':<span>Crea productos en <strong>Productos</strong></span>}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!hasData && (
            <div style={{ background:T.surface, border:`1px dashed rgba(0,212,255,0.2)`, borderRadius:16, padding:'60px 20px', textAlign:'center' }}>
              <p style={{ fontSize:36, margin:'0 0 16px' }}>📊</p>
              <p style={{ fontWeight:700, fontSize:16, margin:'0 0 8px' }}>Sin datos aún</p>
              <p style={{ fontSize:14, color:T.dim, margin:'0 0 24px' }}>Configura tu Meta token en Setup y ejecuta la sincronización.</p>
              <Btn onClick={()=>setTab('setup')}>Ir a Setup →</Btn>
            </div>
          )}

          {/* ── Detalle Diario ── */}
          {dailyData.length>0 && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden', marginTop:24, boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div style={{ padding:'16px 22px', borderBottom:`1px solid ${T.border}` }}>
                <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>Detalle Diario</h3>
                <p style={{ margin:'3px 0 0', fontSize:12, color:T.dim }}>{dailyData.length} días · más reciente primero</p>
              </div>
              <div style={{ overflowX:'auto', maxHeight:380, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1 }}><tr>
                    {['Fecha','Gasto','Impresiones','Clics','CTR','ATC','Compras','Valor','ROAS'].map(h=>(
                      <th key={h} style={{ textAlign:'left', padding:'9px 14px', fontSize:10, fontWeight:600, color:T.dim, textTransform:'uppercase', background:T.surface2, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[...dailyData].reverse().map(d=>(
                      <tr key={d.date} style={{ borderBottom:`1px solid ${T.border}15` }}>
                        <td style={{ padding:'9px 14px', fontWeight:600, fontFamily:"'DM Mono',monospace" }}>{d.date}</td>
                        <td style={{ padding:'9px 14px', fontFamily:"'DM Mono',monospace", fontWeight:600, color:T.accent }}>{fmt(d.spend)}</td>
                        <td style={{ padding:'9px 14px', color:T.textS }}>{fmtN(d.impressions)}</td>
                        <td style={{ padding:'9px 14px', color:T.textS }}>{fmtN(d.clicks)}</td>
                        <td style={{ padding:'9px 14px' }}>{fmtPct(d.ctr)}</td>
                        <td style={{ padding:'9px 14px', color:T.textS }}>{fmtN(d.addToCart)}</td>
                        <td style={{ padding:'9px 14px', color:T.textS }}>{fmtN(d.purchases)}</td>
                        <td style={{ padding:'9px 14px', fontFamily:"'DM Mono',monospace" }}>{fmt(d.purchaseValue)}</td>
                        <td style={{ padding:'9px 14px' }}><RoasBadge roas={d.roas} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>}

        {/* ═══════════════ CAMPAÑAS ═══════════════ */}
        {tab==='campanas' && <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
            <div>
              <h2 style={{ margin:'0 0 3px', fontSize:20, fontWeight:700, color:T.text }}>Campañas</h2>
              <p style={{ margin:0, color:T.dim, fontSize:13 }}>{sortedCamps.length} campañas · clic en columna para ordenar</p>
            </div>
            <input style={{...inp,width:280,fontSize:13}} placeholder="🔍 Buscar campaña..." value={campFilter} onChange={e=>setCampFilter(e.target.value)} />
          </div>
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr>
                  {[{k:'name',l:'Campaña'},{k:'spend',l:'Gasto'},{k:'impressions',l:'Impr.'},{k:'clicks',l:'Clics'},{k:'ctr',l:'CTR'},{k:'cpc',l:'CPC'},{k:'cpm',l:'CPM'},{k:'add_to_cart',l:'ATC'},{k:'purchases',l:'Compras'},{k:'purchase_value',l:'Valor'},{k:'roas',l:'ROAS'},{k:'cpa',l:'CPA'},{k:'conv_rate',l:'Conv%'}].map(h=>(
                    <TH key={h.k} k={h.k} label={h.l} sort={campSort} setSort={setCampSort} />
                  ))}
                  <th style={{ padding:'10px 12px', background:T.surface2, fontSize:11, fontWeight:600, color:T.dim, textTransform:'uppercase', whiteSpace:'nowrap' }}>Tendencia</th>
                  <th style={{ padding:'10px 12px', background:T.surface2, fontSize:11, fontWeight:600, color:T.dim, textTransform:'uppercase', whiteSpace:'nowrap' }}>Acción</th>
                </tr></thead>
                <tbody>
                  {sortedCamps.map(c=>{
                    const dx=diagnose(c)
                    return (
                      <tr key={c.id} style={{ borderBottom:`1px solid ${T.border}15` }}>
                        <td style={{ padding:'9px 12px', fontWeight:500, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={c.name}>{c.name}</td>
                        <td style={{ padding:'9px 12px', fontFamily:"'DM Mono',monospace", fontWeight:600, color:T.accent }}>{fmt(c.spend)}</td>
                        <td style={{ padding:'9px 12px', color:T.textS }}>{fmtN(c.impressions)}</td>
                        <td style={{ padding:'9px 12px', color:T.textS }}>{fmtN(c.clicks)}</td>
                        <td style={{ padding:'9px 12px' }}>{fmtPct(c.ctr)}</td>
                        <td style={{ padding:'9px 12px', fontFamily:"'DM Mono',monospace", color:T.dim }}>{fmt(c.cpc)}</td>
                        <td style={{ padding:'9px 12px', fontFamily:"'DM Mono',monospace", color:T.dim }}>{fmt(c.cpm)}</td>
                        <td style={{ padding:'9px 12px', color:T.textS }}>{fmtN(c.add_to_cart)}</td>
                        <td style={{ padding:'9px 12px', color:T.textS }}>{fmtN(c.purchases)}</td>
                        <td style={{ padding:'9px 12px', fontFamily:"'DM Mono',monospace" }}>{fmt(c.purchase_value)}</td>
                        <td style={{ padding:'9px 12px' }}><RoasBadge roas={c.roas} size="sm" /></td>
                        <td style={{ padding:'9px 12px', fontFamily:"'DM Mono',monospace", color:T.dim }}>{c.cpa>0?fmt(c.cpa):'—'}</td>
                        <td style={{ padding:'9px 12px' }}>{fmtPct(c.conv_rate)}</td>
                        <td style={{ padding:'9px 12px' }}><MiniSparkline values={campRoasHistory[c.id]} /></td>
                        <td style={{ padding:'9px 12px' }}>
                          {dx && (
                            <div>
                              <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, color:dx.color, background:dx.bg, whiteSpace:'nowrap' }}>{dx.action}</span>
                              <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim, whiteSpace:'nowrap' }}>{dx.detail}</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {sortedCamps.length===0 && <tr><td colSpan={14} style={{ padding:'50px', textAlign:'center', color:T.dim }}>Sin datos · ejecuta ⟳ Sincronizar</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* ═══════════════ CREATIVOS ═══════════════ */}
        {tab==='creativos' && <>
          <div style={{ marginBottom:20 }}>
            <h2 style={{ margin:'0 0 3px', fontSize:20, fontWeight:700, color:T.text }}>Creativos</h2>
            <p style={{ margin:0, color:T.dim, fontSize:13 }}>Score = ROAS 50% + Hook 25% + Hold 25% · ordenado por score por defecto</p>
          </div>
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr>
                  {[{k:'score',l:'Score'},{k:'name',l:'Anuncio'},{k:'campaign_name',l:'Campaña'},{k:'ad_account_id',l:'Cuenta'},{k:'spend',l:'Gasto'},{k:'roas',l:'ROAS'},{k:'purchases',l:'Compras'},{k:'cpa',l:'CPA'},{k:'impressions',l:'Impr.'},{k:'hook_rate',l:'Hook %'},{k:'hold_rate',l:'Hold %'},{k:'completion_rate',l:'Fin %'},{k:'avg_watch',l:'T.visto'},{k:'video_p95',l:'P95'}].map(h=>(
                    <TH key={h.k} k={h.k} label={h.l} sort={adSort} setSort={setAdSort} />
                  ))}
                  <th style={{ padding:'10px 12px', background:T.surface2, fontSize:11, fontWeight:600, color:T.dim, textTransform:'uppercase', whiteSpace:'nowrap' }}>Fatiga</th>
                </tr></thead>
                <tbody>
                  {sortedAds.map(a=>(
                    <tr key={a.id} style={{ borderBottom:`1px solid ${T.border}15` }}>
                      <td style={{ padding:'9px 12px' }}><ScoreRing score={a.score} /></td>
                      <td style={{ padding:'9px 12px', fontWeight:500, maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={a.name}>{a.name||'—'}</td>
                      <td style={{ padding:'9px 12px', color:T.dim, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={a.campaign_name}>{a.campaign_name||'—'}</td>
                      <td style={{ padding:'9px 12px', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        <span style={{ padding:'2px 7px', borderRadius:20, fontSize:10, fontWeight:600, background:T.accentBg, color:T.accent }}>{accountShort(a.ad_account_id)}</span>
                      </td>
                      <td style={{ padding:'9px 12px', fontFamily:"'DM Mono',monospace", fontWeight:600, color:T.accent }}>{fmt(a.spend)}</td>
                      <td style={{ padding:'9px 12px' }}>{a.roas>0?<RoasBadge roas={a.roas} size="sm"/>:'—'}</td>
                      <td style={{ padding:'9px 12px', color:T.textS }}>{fmtN(a.purchases)}</td>
                      <td style={{ padding:'9px 12px', fontFamily:"'DM Mono',monospace", color:T.dim }}>{a.cpa>0?fmt(a.cpa):'—'}</td>
                      <td style={{ padding:'9px 12px', color:T.textS }}>{fmtN(a.impressions)}</td>
                      <td style={{ padding:'9px 12px' }}>
                        {a.hook_rate>0?(
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ width:44, height:5, background:T.surface2, borderRadius:3, overflow:'hidden' }}>
                              <div style={{ height:'100%', borderRadius:3, width:`${Math.min(a.hook_rate*2.5,100)}%`, background:a.hook_rate>25?T.green:a.hook_rate>15?T.yellow:T.red }} />
                            </div>
                            <span style={{ fontWeight:700, color:a.hook_rate>25?T.green:a.hook_rate>15?T.yellow:T.red }}>{fmtPct(a.hook_rate)}</span>
                          </div>
                        ):'—'}
                      </td>
                      <td style={{ padding:'9px 12px' }}>
                        {a.hold_rate>0?(
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ width:44, height:5, background:T.surface2, borderRadius:3, overflow:'hidden' }}>
                              <div style={{ height:'100%', borderRadius:3, width:`${Math.min(a.hold_rate,100)}%`, background:a.hold_rate>40?T.green:a.hold_rate>25?T.yellow:T.red }} />
                            </div>
                            <span style={{ fontWeight:700, color:a.hold_rate>40?T.green:a.hold_rate>25?T.yellow:T.red }}>{fmtPct(a.hold_rate)}</span>
                          </div>
                        ):'—'}
                      </td>
                      <td style={{ padding:'9px 12px', color:T.textS }}>{a.completion_rate>0?fmtPct(a.completion_rate):'—'}</td>
                      <td style={{ padding:'9px 12px', color:T.textS }}>{a.avg_watch>0?fmtSec(a.avg_watch):'—'}</td>
                      <td style={{ padding:'9px 12px', color:T.dim }}>{a.video_p95>0?fmtN(a.video_p95):'—'}</td>
                      <td style={{ padding:'9px 12px' }}>
                        {(()=>{
                          const freq=adFreqMap[a.id]||0
                          if(freq===0) return <span style={{ color:T.dim, fontSize:10 }}>—</span>
                          const isHigh=freq>2.5, isMed=freq>1.8
                          const col=isHigh?T.red:isMed?T.yellow:T.green
                          const label=isHigh?'🔴 Alta':isMed?'🟡 Media':'🟢 OK'
                          return (
                            <div>
                              <span style={{ fontSize:10, fontWeight:700, color:col }}>{label}</span>
                              <p style={{ margin:'2px 0 0', fontSize:10, color:T.dim }}>{freq.toFixed(1)}x freq.</p>
                              {isHigh && <p style={{ margin:'2px 0 0', fontSize:9, color:T.red }}>Rotar creativo</p>}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                  {sortedAds.length===0 && <tr><td colSpan={15} style={{ padding:'50px', textAlign:'center', color:T.dim }}>Sin datos · ejecuta ⟳ Sincronizar</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* ═══════════════ PRODUCTOS ═══════════════ */}
        {tab==='productos' && <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <h2 style={{ margin:'0 0 3px', fontSize:20, fontWeight:700, color:T.text }}>Productos</h2>
              <p style={{ margin:0, color:T.dim, fontSize:13 }}>Mapeados por palabras clave en el nombre de campaña</p>
            </div>
            <Btn onClick={()=>setModal('addProduct')}>+ Nuevo producto</Btn>
          </div>
          {/* Budget share chart */}
          {productStats.filter(p=>p.spend>0).length>0 && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'20px 24px', marginBottom:20, boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin:'0 0 14px', fontSize:15, fontWeight:700 }}>Distribución de Presupuesto por Producto</h3>
              {productStats.filter(p=>p.spend>0).sort((a,b)=>b.spend-a.spend).map(p=>{
                const pct=totalSpend>0?p.spend/totalSpend*100:0
                return (
                  <div key={p.id} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600 }}>{p.name}</span>
                      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                        <span style={{ fontSize:11, color:T.dim }}>{pct.toFixed(1)}%</span>
                        <span style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color:T.accent }}>{fmt(p.spend)}</span>
                        <RoasBadge roas={p.roas} size="sm"/>
                      </div>
                    </div>
                    <div style={{ height:8, background:T.surface2, borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:4, width:`${pct}%`, background:roasColor(p.roas), opacity:0.7, transition:'width .4s' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {products.length>0 && (
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden', marginBottom:20, boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr>
                    {[{k:'name',l:'Producto'},{k:'spend',l:'Gasto'},{k:'purchaseValue',l:'Ventas attr.'},{k:'roas',l:'ROAS'},{k:'purchases',l:'Pedidos'},{k:'cpa',l:'CPA'},{k:'addToCart',l:'ATC'},{k:'campaignCount',l:'Campañas'}].map(h=>(
                      <TH key={h.k} k={h.k} label={h.l} sort={prodSort} setSort={setProdSort} />
                    ))}
                    <th style={{ padding:'10px 12px', background:T.surface2, fontSize:11, fontWeight:600, color:T.dim, textTransform:'uppercase' }}>Potencial</th>
                    <th style={{ padding:'10px 12px', background:'rgba(255,255,255,0.03)' }}></th>
                  </tr></thead>
                  <tbody>
                    {sortedProducts.map(p=>(
                      <tr key={p.id} style={{ borderBottom:`1px solid ${T.border}20` }}>
                        <td style={{ padding:'12px 14px' }}>
                          <p style={{ margin:0, fontWeight:700 }}>{p.name}</p>
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
                            {[p.name,...(p.keywords||[])].slice(0,4).map(kw=>(
                              <span key={kw} style={{ padding:'1px 7px', borderRadius:20, background:T.accentBg, color:T.accent, fontSize:10, fontWeight:600 }}>{kw}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", fontWeight:600, color:T.accent }}>{fmt(p.spend)}</td>
                        <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace" }}>{fmt(p.purchaseValue)}</td>
                        <td style={{ padding:'12px 14px' }}>{p.roas>0?<RoasBadge roas={p.roas}/>:<span style={{ color:T.dim }}>—</span>}</td>
                        <td style={{ padding:'12px 14px', color:T.textS }}>{fmtN(p.purchases)}</td>
                        <td style={{ padding:'12px 14px', fontFamily:"'DM Mono',monospace", color:T.dim }}>{p.cpa>0?fmt(p.cpa):'—'}</td>
                        <td style={{ padding:'12px 14px', color:T.textS }}>{fmtN(p.addToCart)}</td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ fontSize:15, fontWeight:700, fontFamily:"'DM Mono',monospace", color:p.campaignCount>0?T.accent:T.dim }}>{p.campaignCount}</span>
                            {p.campaignCount===0 && <span style={{ fontSize:10, color:T.red }}>Sin campañas</span>}
                            {p.campaignCount>0 && p.campaignCount<3 && <span style={{ fontSize:10, color:T.yellow }}>Pocos</span>}
                            {p.campaignCount>=3 && <span style={{ fontSize:10, color:T.green }}>OK</span>}
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          {p.spend>0 && <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, color:p.potential.color, background:p.potential.bg }}>{p.potential.label}</span>}
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', gap:2 }}>
                            <Btn v="ghost" s="sm" onClick={()=>setModal({type:'editProduct',data:p})}>✏️</Btn>
                            <Btn v="ghost" s="sm" onClick={()=>deleteProduct(p.id)}>🗑</Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {products.length===0 && (
            <div style={{ background:T.surface, border:`1px dashed rgba(0,212,255,0.2)`, borderRadius:16, padding:'50px 20px', textAlign:'center' }}>
              <p style={{ fontWeight:700, fontSize:15, color:T.textS, margin:'0 0 8px' }}>Sin productos</p>
              <p style={{ fontSize:13, color:T.dim, margin:'0 0 20px' }}>Crea un producto con el nombre que aparece en tus campañas.</p>
              <Btn onClick={()=>setModal('addProduct')}>Crear primer producto</Btn>
            </div>
          )}
          {/* Unmapped */}
          {(() => {
            const map={}
            campaignMetrics.filter(m=>!m.product_id).forEach(m=>{
              if(!map[m.campaign_id]) map[m.campaign_id]={id:m.campaign_id,name:m.campaign_name,spend:0,pv:0}
              map[m.campaign_id].spend+=m.spend||0; map[m.campaign_id].pv+=m.purchase_value||0
            })
            const list=Object.values(map).sort((a,b)=>b.spend-a.spend)
            const total=list.reduce((s,c)=>s+c.spend,0)
            if(!list.length) return null
            return (
              <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden' }}>
                <div style={{ padding:'14px 20px', borderBottom:`1px solid ${T.border}`, background:T.yellowBg }}>
                  <h3 style={{ margin:0, fontSize:14, fontWeight:700, color:T.yellow }}>⚠ Campañas sin producto ({list.length})</h3>
                  <p style={{ margin:'3px 0 0', fontSize:12, color:T.textS }}>Gasto sin mapear: {fmt(total)} · Agrega palabras clave a tus productos para capturarlas.</p>
                </div>
                <div style={{ maxHeight:280, overflowY:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ background:'rgba(255,255,255,0.03)' }}>
                      {['Campaña','Gasto','ROAS'].map(h=><th key={h} style={{ textAlign:'left', padding:'8px 14px', fontSize:11, fontWeight:600, color:T.dim, textTransform:'uppercase' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {list.map(c=>(
                        <tr key={c.id} style={{ borderBottom:`1px solid ${T.border}15` }}>
                          <td style={{ padding:'8px 14px', maxWidth:360, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={c.name}>{c.name}</td>
                          <td style={{ padding:'8px 14px', fontFamily:"'DM Mono',monospace" }}>{fmt(c.spend)}</td>
                          <td style={{ padding:'8px 14px' }}><RoasBadge roas={c.spend>0?c.pv/c.spend:0} size="sm" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </>}

        {/* ═══════════════ LAB ═══════════════ */}
        {tab==='lab' && <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <h2 style={{ margin:'0 0 3px', fontSize:20, fontWeight:700, color:T.text }}>🧪 Lab de Aprendizajes</h2>
              <p style={{ margin:0, color:T.dim, fontSize:13 }}>Registra tests, hipótesis y resultados. El conocimiento que no se escribe se pierde.</p>
            </div>
            <Btn onClick={()=>setLabModal({type:'add'})}>+ Nuevo aprendizaje</Btn>
          </div>

          {labEntries.length>0 ? (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {labEntries.map(e=>{
                const statusColors={pending:{c:T.dim,bg:T.surface2,l:'Pendiente'},winner:{c:T.green,bg:T.greenBg,l:'✓ Ganador'},loser:{c:T.red,bg:T.redBg,l:'✗ Perdedor'},inconclusive:{c:T.yellow,bg:T.yellowBg,l:'~ Inconcluso'}}
                const sc=statusColors[e.status]||statusColors.pending
                return (
                  <div key={e.id} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:'16px 20px', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, color:sc.c, background:sc.bg }}>{sc.l}</span>
                          {e.product_name && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:T.accentBg, color:T.accent, fontWeight:600 }}>{e.product_name}</span>}
                          <span style={{ fontSize:10, color:T.dim }}>{e.date}</span>
                        </div>
                        <p style={{ margin:'0 0 6px', fontWeight:700, fontSize:14 }}>{e.hypothesis}</p>
                        {e.result && <p style={{ margin:'0 0 4px', fontSize:13, color:T.textS }}><strong>Resultado:</strong> {e.result}</p>}
                        {e.action && <p style={{ margin:0, fontSize:13, color:T.accent }}><strong>Acción:</strong> {e.action}</p>}
                      </div>
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        <Btn v="ghost" s="sm" onClick={()=>setLabModal({type:'edit',data:e})}>✏️</Btn>
                        <Btn v="ghost" s="sm" onClick={()=>deleteLearning(e.id)}>🗑</Btn>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ background:T.surface, border:`1px dashed rgba(0,212,255,0.2)`, borderRadius:16, padding:'60px 20px', textAlign:'center' }}>
              <p style={{ fontSize:36, margin:'0 0 16px' }}>🧪</p>
              <p style={{ fontWeight:700, fontSize:15, color:T.textS, margin:'0 0 8px' }}>Sin aprendizajes aún</p>
              <p style={{ fontSize:13, color:T.dim, margin:'0 0 20px' }}>Registra cada test que hagas: qué probaste, qué pasó, qué harás diferente.</p>
              <Btn onClick={()=>setLabModal({type:'add'})}>Registrar primer aprendizaje</Btn>
            </div>
          )}
        </>}

        {/* ═══════════════ SEMANAL ═══════════════ */}
        {tab==='semanal' && (() => {
          const topCamps = [...campaignStats].filter(c=>c.spend>0).sort((a,b)=>b.roas-a.roas).slice(0,5)
          const topAds   = [...adStats].filter(a=>a.spend>0).sort((a,b)=>b.score-a.score).slice(0,5)
          const winners  = labEntries.filter(e=>e.status==='winner')
          const bestDay  = dailyData.length>0 ? [...dailyData].sort((a,b)=>b.roas-a.roas)[0] : null
          const worstDay = dailyData.length>0 ? [...dailyData].filter(d=>d.spend>0).sort((a,b)=>a.roas-b.roas)[0] : null
          return <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:10 }}>
              <div>
                <h2 style={{ margin:'0 0 4px', fontSize:20, fontWeight:700, color:T.text }}>Reporte Semanal</h2>
                <p style={{ margin:0, color:T.dim, fontSize:13 }}>Resumen de los últimos 7 días · {dailyData.length} días con datos</p>
              </div>
              <span style={{ fontSize:11, color:T.dim, background:T.surface2, padding:'6px 14px', borderRadius:20, border:`1px solid ${T.border}` }}>
                {daysAgo(7)} → {today()}
              </span>
            </div>

            {/* KPIs con comparativa */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:24 }}>
              <KPI label="Gasto 7d"         value={fmt(totalSpend)}         sub={`vs ${fmt(prevSpend)} sem. ant.`}   color={T.accent} sparkData={sparkSpend} delta={delta(totalSpend,prevSpend)} />
              <KPI label="Ventas atribuidas" value={fmt(totalPurchaseValue)} sub={`vs ${fmt(prevPV)} sem. ant.`}     color={T.green}  sparkData={sparkPurch} delta={delta(totalPurchaseValue,prevPV)} />
              <KPI label="ROAS semanal"     value={<RoasBadge roas={globalRoas}/>} sub="obj 7x · ideal 10x"        color={roasColor(globalRoas)} sparkData={sparkRoas} delta={delta(globalRoas,prevRoas)} />
              <KPI label="Compras pixel"    value={fmtN(totalPurchases)}    sub={`CPA: ${fmt(globalCpa)}`}          color={T.purple} delta={delta(totalPurchases,prevPurch)} />
              <KPI label="CTR promedio"     value={fmtPct(globalCtr)}       sub={`${fmtN(totalClicks)} clics`}      color={T.orange} sparkData={sparkCtr} delta={delta(globalCtr,prevCtr)} />
              <KPI label="CPM promedio"     value={fmt(globalCpm)}          sub="por mil impresiones"               color={T.textS} delta={delta(globalCpm,prevCpm)} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
              {/* Top campañas */}
              <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                <div style={{ padding:'14px 18px', borderBottom:`1px solid ${T.border}`, background:T.greenBg }}>
                  <p style={{ margin:0, fontWeight:800, fontSize:13, color:T.green }}>🏆 Top Campañas · ROAS</p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:T.textS }}>Mejores performers de la semana</p>
                </div>
                {topCamps.length>0 ? topCamps.map((c,i)=>(
                  <div key={c.id} style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}15`, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:800, color:T.dim, minWidth:18 }}>{i+1}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={c.name}>{c.name}</p>
                      <p style={{ margin:0, fontSize:10, color:T.dim }}>{fmt(c.spend)} · {fmtN(c.purchases)} compras</p>
                    </div>
                    <RoasBadge roas={c.roas} size="sm" />
                  </div>
                )) : <p style={{ padding:'20px 16px', color:T.dim, fontSize:13, margin:0 }}>Sin datos en el período</p>}
              </div>

              {/* Top creativos */}
              <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                <div style={{ padding:'14px 18px', borderBottom:`1px solid ${T.border}`, background:T.accentBg }}>
                  <p style={{ margin:0, fontWeight:800, fontSize:13, color:T.accent }}>🎨 Top Creativos · Score</p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:T.textS }}>ROAS 50% + Hook 25% + Hold 25%</p>
                </div>
                {topAds.length>0 ? topAds.map((a,i)=>(
                  <div key={a.id} style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}15`, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:800, color:T.dim, minWidth:18 }}>{i+1}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={a.name}>{a.name||'—'}</p>
                      <p style={{ margin:0, fontSize:10, color:T.dim }}>Hook {fmtPct(a.hook_rate)} · Hold {fmtPct(a.hold_rate)}</p>
                    </div>
                    <ScoreRing score={a.score} />
                  </div>
                )) : <p style={{ padding:'20px 16px', color:T.dim, fontSize:13, margin:0 }}>Sin datos en el período</p>}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
              {/* Mejor y peor día */}
              <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'18px 20px', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                <p style={{ margin:'0 0 14px', fontWeight:800, fontSize:13 }}>📅 Días Destacados</p>
                {bestDay ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ padding:'10px 14px', borderRadius:10, background:T.greenBg, border:`1px solid ${T.green}20` }}>
                      <p style={{ margin:'0 0 3px', fontSize:11, fontWeight:700, color:T.green }}>Mejor día · {bestDay.date}</p>
                      <div style={{ display:'flex', gap:16, fontSize:12 }}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:700, color:T.green }}>{fmtRoas(bestDay.roas)}</span>
                        <span style={{ color:T.dim }}>{fmt(bestDay.spend)} gasto</span>
                        <span style={{ color:T.textS }}>{fmtN(bestDay.purchases)} compras</span>
                      </div>
                    </div>
                    {worstDay && worstDay.date !== bestDay.date && (
                      <div style={{ padding:'10px 14px', borderRadius:10, background:T.redBg, border:`1px solid ${T.red}20` }}>
                        <p style={{ margin:'0 0 3px', fontSize:11, fontWeight:700, color:T.red }}>Día a mejorar · {worstDay.date}</p>
                        <div style={{ display:'flex', gap:16, fontSize:12 }}>
                          <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:700, color:T.red }}>{fmtRoas(worstDay.roas)}</span>
                          <span style={{ color:T.dim }}>{fmt(worstDay.spend)} gasto</span>
                          <span style={{ color:T.textS }}>{fmtN(worstDay.purchases)} compras</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : <p style={{ color:T.dim, fontSize:13, margin:0 }}>Sin datos en el período</p>}
              </div>

              {/* Aprendizajes de la semana */}
              <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'18px 20px', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <p style={{ margin:0, fontWeight:800, fontSize:13 }}>🧪 Lab de Aprendizajes</p>
                  <Btn v="ghost" s="sm" onClick={()=>setTab('lab')}>Ver todos →</Btn>
                </div>
                <div style={{ display:'flex', gap:16, marginBottom:12 }}>
                  <div style={{ textAlign:'center' }}>
                    <p style={{ margin:0, fontSize:22, fontWeight:700, color:T.accent }}>{labEntries.length}</p>
                    <p style={{ margin:0, fontSize:10, color:T.dim }}>Total</p>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <p style={{ margin:0, fontSize:22, fontWeight:700, color:T.green }}>{winners.length}</p>
                    <p style={{ margin:0, fontSize:10, color:T.dim }}>Ganadores</p>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <p style={{ margin:0, fontSize:22, fontWeight:700, color:T.red }}>{labEntries.filter(e=>e.status==='loser').length}</p>
                    <p style={{ margin:0, fontSize:10, color:T.dim }}>Perdedores</p>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <p style={{ margin:0, fontSize:22, fontWeight:700, color:T.dim }}>{labEntries.filter(e=>e.status==='pending').length}</p>
                    <p style={{ margin:0, fontSize:10, color:T.dim }}>Pendientes</p>
                  </div>
                </div>
                {winners.slice(0,2).map(e=>(
                  <div key={e.id} style={{ padding:'8px 12px', marginBottom:6, borderRadius:8, background:T.greenBg, border:`1px solid ${T.green}20` }}>
                    <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:T.green }}>✓ {e.product_name||'General'}</p>
                    <p style={{ margin:0, fontSize:11, color:T.textS, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.hypothesis}</p>
                  </div>
                ))}
                {winners.length===0 && <p style={{ color:T.dim, fontSize:12, margin:0 }}>Sin ganadores registrados aún</p>}
              </div>
            </div>

            {/* Acciones recomendadas para la próxima semana */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'20px 24px', boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <p style={{ margin:'0 0 16px', fontWeight:800, fontSize:14 }}>Acciones para la próxima semana</p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {toScale.length>0 && (
                  <div style={{ padding:'10px 16px', borderRadius:10, background:T.greenBg, border:`1px solid ${T.green}20`, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:18 }}>🚀</span>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:T.green }}>Escalar presupuesto ({toScale.length} campaña{toScale.length>1?'s':''})</p>
                      <p style={{ margin:0, fontSize:12, color:T.textS }}>{toScale.map(c=>c.name).slice(0,2).join(' · ')}{toScale.length>2?` +${toScale.length-2} más`:''} · ROAS ≥ 7x</p>
                    </div>
                  </div>
                )}
                {toOptim.length>0 && (
                  <div style={{ padding:'10px 16px', borderRadius:10, background:T.yellowBg, border:`1px solid ${T.yellow}20`, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:18 }}>📈</span>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:T.yellow }}>Optimizar creativo ({toOptim.length} campaña{toOptim.length>1?'s':''})</p>
                      <p style={{ margin:0, fontSize:12, color:T.textS }}>ROAS 4-7x — ajustar audiencia o copy para alcanzar objetivo</p>
                    </div>
                  </div>
                )}
                {toPause.length>0 && (
                  <div style={{ padding:'10px 16px', borderRadius:10, background:T.redBg, border:`1px solid ${T.red}20`, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:18 }}>⛔</span>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:T.red }}>Pausar o revisar ({toPause.length} campaña{toPause.length>1?'s':''})</p>
                      <p style={{ margin:0, fontSize:12, color:T.textS }}>{toPause.map(c=>c.name).slice(0,2).join(' · ')}{toPause.length>2?` +${toPause.length-2} más`:''} · ROAS {'<'} 2x</p>
                    </div>
                  </div>
                )}
                {adStats.filter(a=>adFreqMap[a.id]>3.5&&a.spend>0).length>0 && (
                  <div style={{ padding:'10px 16px', borderRadius:10, background:T.orangeBg, border:`1px solid ${T.orange}20`, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:18 }}>🔥</span>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:T.orange }}>Rotar creativos con fatiga</p>
                      <p style={{ margin:0, fontSize:12, color:T.textS }}>{adStats.filter(a=>adFreqMap[a.id]>3.5&&a.spend>0).length} anuncios con frecuencia {'>'} 3.5x — preparar nuevas variaciones</p>
                    </div>
                  </div>
                )}
                {toScale.length===0 && toOptim.length===0 && toPause.length===0 && (
                  <p style={{ color:T.dim, fontSize:13, margin:0 }}>Sin datos suficientes — sincroniza y selecciona período de 7 días</p>
                )}
              </div>
            </div>
          </>
        })()}

        {/* ═══════════════ SETUP ═══════════════ */}
        {tab==='setup' && <>
          <h2 style={{ margin:'0 0 4px', fontSize:20, fontWeight:700, color:T.text }}>Setup</h2>
          <p style={{ margin:'0 0 28px', color:T.dim, fontSize:13 }}>Conecta tus fuentes de datos.</p>
          <div style={{ ...glass, padding:28, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, paddingBottom:20, borderBottom:`1px solid ${T.border}` }}>
              <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,rgba(0,212,255,0.2),rgba(0,128,255,0.2))', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>Ⓜ</div>
              <div>
                <p style={{ margin:0, fontWeight:700, fontSize:15, color:T.text }}>Meta Ads</p>
                <p style={{ margin:0, fontSize:12, color:config.meta_token?T.green:T.dim }}>{config.meta_token?'● Conectado':'○ Sin conectar'}</p>
              </div>
              {config.meta_token && <div style={{ marginLeft:'auto', padding:'4px 12px', borderRadius:20, background:T.greenBg, border:`1px solid ${T.green}30`, color:T.green, fontSize:11, fontWeight:700 }}>Activo</div>}
            </div>
            <Field label="System User Token" sub="Genera en business.facebook.com → Configuración → Usuarios del sistema. No expira.">
              <input style={{...inp,fontFamily:"'DM Mono',monospace",fontSize:12}} type="password" defaultValue={config.meta_token||''} onBlur={e=>{if(e.target.value!==config.meta_token)saveConfig({meta_token:e.target.value})}} placeholder="EAAxxxxxxxxx..." />
            </Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <Field label="Tasa USD → COP">
                <input type="number" style={inp} defaultValue={config.usd_rate||4200} onBlur={e=>{if(Number(e.target.value)!==config.usd_rate)saveConfig({usd_rate:Number(e.target.value)})}} />
              </Field>
              <Field label="Presupuesto mensual (COP)" sub="Para el indicador de pacing.">
                <input type="number" style={inp} defaultValue={config.monthly_budget||0} step="100000" onBlur={e=>{if(Number(e.target.value)!==config.monthly_budget)saveConfig({monthly_budget:Number(e.target.value)})}} placeholder="Ej: 8000000" />
              </Field>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8 }}>
              <Btn onClick={syncMeta} disabled={!config.meta_token||syncing}>{syncing?'Sincronizando...':'⟳ Sincronizar ahora'}</Btn>
              {config.last_sync && <p style={{ margin:0, fontSize:12, color:T.dim }}>Última sync: {new Date(config.last_sync).toLocaleString('es-CO')}</p>}
            </div>
          </div>
          <div style={{ ...glass, padding:24, marginBottom:16 }}>
            <h3 style={{ margin:'0 0 6px', fontSize:14, fontWeight:700, color:T.text }}>Cuentas Publicitarias <span style={{ color:T.accent, fontFamily:"'DM Mono',monospace" }}>({adAccounts.length})</span></h3>
            <p style={{ margin:'0 0 16px', fontSize:13, color:T.dim }}>Se auto-detectan al sincronizar.</p>
            {adAccounts.filter(a=>a.ad_account_id).length>0?(
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {adAccounts.filter(a=>a.ad_account_id).map(a=>(
                  <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:10 }}>
                    <div>
                      <p style={{ margin:0, fontWeight:600, fontSize:13, color:T.text }}>{a.name}</p>
                      <p style={{ margin:0, fontSize:11, color:T.dim, fontFamily:"'DM Mono',monospace" }}>{a.ad_account_id}</p>
                    </div>
                    <span style={{ padding:'3px 10px', borderRadius:6, fontSize:10, fontWeight:700, background:T.accentBg, color:T.accent, border:`1px solid ${T.border}` }}>Meta</span>
                  </div>
                ))}
              </div>
            ):<p style={{ fontSize:13, color:T.dim, margin:0 }}>Sin cuentas detectadas. Agrega tu token y sincroniza.</p>}
          </div>
        </>}

      </main>
      </div>{/* end main area */}

      <Modal open={modal==='addProduct'||modal?.type==='editProduct'} onClose={()=>setModal(null)} title={modal?.type==='editProduct'?'Editar Producto':'Nuevo Producto'}>
        <ProductForm data={modal?.data} onClose={()=>setModal(null)} onSave={saveProduct} />
      </Modal>

      <Modal open={!!labModal} onClose={()=>setLabModal(null)} title={labModal?.type==='edit'?'Editar Aprendizaje':'Nuevo Aprendizaje'} w={560}>
        {labModal && <LabForm data={labModal.data} products={products} onClose={()=>setLabModal(null)} onSave={saveLearning} />}
      </Modal>

      {confirmModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(12px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20 }} onClick={()=>setConfirmModal(null)}>
          <div style={{ ...glass, padding:28, maxWidth:380, width:'100%', boxShadow:'0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,77,117,0.2)' }} onClick={e=>e.stopPropagation()}>
            <p style={{ margin:'0 0 8px', fontSize:16, fontWeight:700, color:T.text }}>Confirmar acción</p>
            <p style={{ margin:'0 0 24px', fontSize:14, color:T.textS }}>{confirmModal.msg}</p>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <Btn v="secondary" onClick={()=>setConfirmModal(null)}>Cancelar</Btn>
              <Btn v="danger" onClick={()=>{ confirmModal.onConfirm(); setConfirmModal(null) }}>Eliminar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Lab Form ─────────────────────────────────────────────────────────────────
function LabForm({ data, products, onClose, onSave }) {
  const [f,setF]=useState(data
    ? {date:data.date,product_name:data.product_name||'',hypothesis:data.hypothesis,result:data.result||'',action:data.action||'',status:data.status||'pending'}
    : {date:today(),product_name:'',hypothesis:'',result:'',action:'',status:'pending'})
  return <>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:4 }}>
      <Field label="Fecha"><input type="date" style={inp} value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></Field>
      <Field label="Producto">
        <select style={inp} value={f.product_name} onChange={e=>setF({...f,product_name:e.target.value})}>
          <option value="">General</option>
          {products.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </Field>
    </div>
    <Field label="Hipótesis / Qué probaste" sub="Ej: Creativo UGC vs producción profesional en Extensor">
      <textarea style={{...inp,height:70,resize:'vertical'}} value={f.hypothesis} onChange={e=>setF({...f,hypothesis:e.target.value})} placeholder="¿Qué hypothesis estás probando?"/>
    </Field>
    <Field label="Resultado">
      <textarea style={{...inp,height:60,resize:'vertical'}} value={f.result} onChange={e=>setF({...f,result:e.target.value})} placeholder="¿Qué pasó? Números concretos..."/>
    </Field>
    <Field label="Acción a tomar">
      <input style={inp} value={f.action} onChange={e=>setF({...f,action:e.target.value})} placeholder="¿Qué harás diferente?"/>
    </Field>
    <Field label="Estado">
      <select style={inp} value={f.status} onChange={e=>setF({...f,status:e.target.value})}>
        <option value="pending">Pendiente</option>
        <option value="winner">Ganador</option>
        <option value="loser">Perdedor</option>
        <option value="inconclusive">Inconcluso</option>
      </select>
    </Field>
    <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
      <Btn v="secondary" onClick={onClose}>Cancelar</Btn>
      <Btn onClick={()=>onSave(f,data?.id)} disabled={!f.hypothesis}>Guardar</Btn>
    </div>
  </>
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App({ navOffset = 0 }) {
  const [session,setSession]=useState(null)
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);setLoading(false)})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>subscription.unsubscribe()
  },[])
  if(loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#060B14', fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:28, height:28, border:'2px solid rgba(0,212,255,0.15)', borderTopColor:'#00D4FF', borderRadius:'50%', animation:'spin .7s linear infinite', boxShadow:'0 0 16px rgba(0,212,255,0.3)' }} />
    </div>
  )
  if(!session) return <LoginPage />
  return <Dashboard user={session.user} navOffset={navOffset} />
}

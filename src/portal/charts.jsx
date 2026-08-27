import { useState } from 'react'
import { T, FONT, fmtCOP } from './ui.jsx'

// ─── Gráficas ───────────────────────────────────────────────────────────────
// Paleta categórica validada contra el fondo oscuro del Portal (#0A142D):
// luminosidad OKLCH en banda, croma suficiente, separación para daltonismo
// protan/deutan/tritan y contraste ≥ 3:1. Orden fijo — nunca se recicla.
// Los textos usan tinta, nunca el color de la serie.
// ─────────────────────────────────────────────────────────────────────────

export const SERIES = ['#008fac', '#b76b2c', '#856fc7', '#009869']

const corto = (n) => {
  const v = Math.abs(Number(n) || 0)
  if (v >= 1e9) return `${(n/1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(n/1e6).toFixed(0)}M`
  if (v >= 1e3) return `${(n/1e3).toFixed(0)}K`
  return String(Math.round(n || 0))
}

// ── Barras agrupadas por mes · 2 series, un solo eje ───────────────────────
export function BarrasMensuales({ datos, series, alto = 230 }) {
  const [activo, setActivo] = useState(null)
  if (!datos?.length) return null

  const W = 760, H = alto
  const pad = { t: 26, r: 14, b: 30, l: 56 }
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b
  const max = Math.max(...datos.flatMap(d => series.map(s => d[s.key] || 0)), 1)
  const paso = iW / datos.length
  const anchoBarra = Math.min(16, (paso - 8) / series.length)
  const y = (v) => pad.t + iH - (v / max) * iH

  return (
    <div style={{ position:'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', display:'block' }}
           role="img" aria-label="Gasto e inversión por mes">
        {[0, .25, .5, .75, 1].map(r => {
          const yy = pad.t + iH * (1 - r)
          return (
            <g key={r}>
              <line x1={pad.l} x2={W-pad.r} y1={yy} y2={yy}
                    stroke={T.borderSub} strokeWidth={r === 0 ? 1 : 0.5} />
              <text x={pad.l-8} y={yy+3.5} textAnchor="end" fontSize="9.5" fill={T.dim}
                    fontFamily="'DM Mono',monospace">{corto(max*r)}</text>
            </g>
          )
        })}
        {datos.map((d, i) => (
          <g key={d.etiqueta}>
            {series.map((s, j) => {
              const v = d[s.key] || 0
              const x = pad.l + i*paso + (paso - anchoBarra*series.length - 2)/2 + j*(anchoBarra+2)
              const altura = Math.max(v > 0 ? 2 : 0, pad.t + iH - y(v))
              return (
                <rect key={s.key} x={x} y={y(v)} width={anchoBarra} height={altura}
                      rx="3" fill={SERIES[j]}
                      opacity={activo && activo.i !== i ? 0.45 : 1}
                      onMouseEnter={() => setActivo({ i, d })}
                      onMouseLeave={() => setActivo(null)} />
              )
            })}
            <text x={pad.l + i*paso + paso/2} y={H-9} textAnchor="middle"
                  fontSize="9.5" fill={T.dim}>{d.etiqueta}</text>
          </g>
        ))}
      </svg>

      {activo && (
        <div style={{ position:'absolute', top:6, left:'50%', transform:'translateX(-50%)',
                      background:'#0B1424', border:`1px solid ${T.border}`, borderRadius:9,
                      padding:'9px 13px', fontSize:12, color:T.text, fontFamily:FONT,
                      pointerEvents:'none', whiteSpace:'nowrap', zIndex:5,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ fontWeight:700, marginBottom:5 }}>{activo.d.etiqueta}</div>
          {series.map((s, j) => (
            <div key={s.key} style={{ display:'flex', alignItems:'center', gap:7, marginTop:2 }}>
              <span style={{ width:9, height:9, borderRadius:2, background:SERIES[j], flexShrink:0 }} />
              <span style={{ color:T.textS }}>{s.nombre}</span>
              <span style={{ marginLeft:'auto', fontFamily:"'DM Mono',monospace" }}>
                {fmtCOP(activo.d[s.key] || 0)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:10 }}>
        {series.map((s, j) => (
          <span key={s.key} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, color:T.textS }}>
            <span style={{ width:11, height:11, borderRadius:3, background:SERIES[j] }} />
            {s.nombre}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Ranking horizontal · una sola serie, sin leyenda ───────────────────────
export function Ranking({ items, limite = 10, color = SERIES[0] }) {
  if (!items?.length) return null
  const lista = items.slice(0, limite)
  const max = Math.max(...lista.map(i => i.valor), 1)
  const total = items.reduce((s,i) => s + i.valor, 0)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
      {lista.map(it => (
        <div key={it.nombre} title={`${it.nombre}: ${fmtCOP(it.valor)}`}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:4 }}>
            <span style={{ fontSize:12.5, color:T.text, overflow:'hidden',
                           textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.nombre}</span>
            <span style={{ fontSize:12, color:T.textS, fontFamily:"'DM Mono',monospace", whiteSpace:'nowrap' }}>
              {fmtCOP(it.valor)}
              <span style={{ color:T.dim, marginLeft:7 }}>
                {total ? `${((it.valor/total)*100).toFixed(1)}%` : ''}
              </span>
            </span>
          </div>
          <div style={{ height:7, borderRadius:4, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${(it.valor/max)*100}%`, background:color, borderRadius:4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Proporción de dos partes (fijos vs variables) ──────────────────────────
export function Proporcion({ partes }) {
  const total = partes.reduce((s,p) => s + p.valor, 0) || 1
  return (
    <div>
      <div style={{ display:'flex', height:13, borderRadius:7, overflow:'hidden', gap:2, marginBottom:12 }}>
        {partes.map((p, j) => (
          <div key={p.nombre} style={{ width:`${(p.valor/total)*100}%`, background:SERIES[j] }} />
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {partes.map((p, j) => (
          <div key={p.nombre} style={{ display:'flex', alignItems:'center', gap:9, fontSize:13 }}>
            <span style={{ width:11, height:11, borderRadius:3, background:SERIES[j], flexShrink:0 }} />
            <span style={{ color:T.textS }}>{p.nombre}</span>
            <span style={{ marginLeft:'auto', color:T.text, fontFamily:"'DM Mono',monospace" }}>
              {fmtCOP(p.valor)}
            </span>
            <span style={{ color:T.dim, width:52, textAlign:'right' }}>
              {((p.valor/total)*100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Panel({ titulo, sub, children, acciones }) {
  return (
    <div style={{ background:T.panel, border:`1px solid ${T.border}`, borderRadius:14,
                  padding:'18px 20px', fontFamily:FONT }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12, marginBottom:16 }}>
        <div>
          <h3 style={{ margin:0, fontSize:14, fontWeight:700, color:T.text }}>{titulo}</h3>
          {sub && <p style={{ margin:'3px 0 0', fontSize:11.5, color:T.dim }}>{sub}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabase.js'
import { T, FONT, Estilos, Kpi, Cargando, fmtCOP, MESES } from '../ui.jsx'
import { Panel, Ranking, SERIES } from '../charts.jsx'

// ─── Costos Fijos ───────────────────────────────────────────────────────────
// Matriz concepto × mes, igual que la hoja "💵 Costos Fijos" del Excel,
// agrupada por NÓMINA / INSTALACIONES / SOFTWARE / FINANCIEROS / OTROS.
// ─────────────────────────────────────────────────────────────────────────

export default function CostosFijos() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const { data, error:e } = await supabase.from('costos_fijos')
        .select('grupo,concepto,anio,mes,valor').order('grupo')
      if (e) setError(e.message); else setFilas(data || [])
      setCargando(false)
    })()
  }, [])

  const d = useMemo(() => {
    const conceptos = new Map()
    const porMes = Array(13).fill(0)
    let total = 0
    filas.forEach(r => {
      const k = `${r.grupo}||${r.concepto}`
      const row = conceptos.get(k) || { grupo:r.grupo, concepto:r.concepto, meses:Array(13).fill(0), total:0 }
      const v = Number(r.valor || 0)
      row.meses[r.mes] += v; row.total += v
      conceptos.set(k, row)
      porMes[r.mes] += v; total += v
    })
    const lista = [...conceptos.values()]
    const grupos = new Map()
    lista.forEach(r => grupos.set(r.grupo, (grupos.get(r.grupo) || 0) + r.total))
    const activos = porMes.filter((v,i) => i > 0 && v > 0).length
    const mesAlto = porMes.reduce((mejor,v,i) => i > 0 && v > mejor.v ? { v, i } : mejor, { v:0, i:0 })
    return {
      lista: lista.sort((a,b) => a.grupo === b.grupo ? b.total - a.total : a.grupo.localeCompare(b.grupo)),
      porMes, total, promedio: activos ? total/activos : 0, mesAlto,
      porGrupo: [...grupos].map(([nombre,valor]) => ({ nombre, valor })).sort((a,b) => b.valor - a.valor),
    }
  }, [filas])

  const th = { padding:'9px 10px', fontSize:9.5, fontWeight:700, color:T.dim, textTransform:'uppercase',
               letterSpacing:'0.5px', borderBottom:`1px solid ${T.border}`, background:'rgba(255,255,255,0.03)',
               position:'sticky', top:0, whiteSpace:'nowrap' }
  const td = { padding:'8px 10px', fontSize:12.5, borderBottom:`1px solid ${T.borderSub}`, whiteSpace:'nowrap' }
  const mono = { fontFamily:"'DM Mono',monospace", textAlign:'right' }

  let grupoPrevio = null

  return (
    <div style={{ padding:'26px 28px', fontFamily:FONT, color:T.text }}>
      <Estilos />
      <div style={{ fontSize:11.5, color:T.dim, marginBottom:5 }}>Administración <span style={{ opacity:.5 }}>/</span> Costos Fijos</div>
      <h1 style={{ margin:'0 0 22px', fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>Costos Fijos</h1>

      {error && <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.redBg,
                              border:'1px solid rgba(255,77,117,0.25)', color:T.red, fontSize:13 }}>{error}</div>}

      {cargando ? <Cargando /> : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:18 }}>
            <Kpi etiqueta="Total del año" valor={fmtCOP(d.total)} sub={`${d.lista.length} conceptos`} />
            <Kpi etiqueta="Promedio mensual" valor={fmtCOP(d.promedio)} color={T.green} />
            <Kpi etiqueta="Mes más alto" valor={fmtCOP(d.mesAlto.v)} sub={MESES[d.mesAlto.i] || '—'} color={T.yellow} />
            <Kpi etiqueta="Grupos" valor={String(d.porGrupo.length)} color={T.textS} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(280px,340px)', gap:14, alignItems:'start' }}>
            <Panel titulo="Detalle por concepto y mes" sub="Cada fila es un concepto; las columnas son los meses de 2026">
              <div className="ui-scroll" style={{ overflow:'auto', maxHeight:'56vh' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign:'left', left:0, zIndex:2 }}>Concepto</th>
                      {MESES.slice(1).map(m => (
                        <th key={m} style={{ ...th, textAlign:'right' }}>{m.slice(0,3)}</th>
                      ))}
                      <th style={{ ...th, textAlign:'right', color:T.textS }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.lista.map(r => {
                      const nuevoGrupo = r.grupo !== grupoPrevio
                      grupoPrevio = r.grupo
                      return (
                        <>
                          {nuevoGrupo && (
                            <tr key={`g-${r.grupo}`}>
                              <td colSpan={14} style={{ ...td, fontSize:10.5, fontWeight:700, color:T.accent,
                                letterSpacing:'0.6px', paddingTop:14, background:'rgba(0,212,255,0.04)' }}>
                                {r.grupo}
                              </td>
                            </tr>
                          )}
                          <tr key={`${r.grupo}-${r.concepto}`} className="ui-fila">
                            <td style={{ ...td, color:T.text }}>{r.concepto}</td>
                            {r.meses.slice(1).map((v,i) => (
                              <td key={i} style={{ ...td, ...mono, color: v ? T.textS : T.dim }}>
                                {v ? Math.round(v).toLocaleString('es-CO') : '·'}
                              </td>
                            ))}
                            <td style={{ ...td, ...mono, color:T.text, fontWeight:600 }}>
                              {Math.round(r.total).toLocaleString('es-CO')}
                            </td>
                          </tr>
                        </>
                      )
                    })}
                    <tr>
                      <td style={{ ...td, fontWeight:700, color:T.text, borderTop:`1px solid ${T.border}` }}>TOTAL</td>
                      {d.porMes.slice(1).map((v,i) => (
                        <td key={i} style={{ ...td, ...mono, fontWeight:700, color:T.accent, borderTop:`1px solid ${T.border}` }}>
                          {v ? Math.round(v).toLocaleString('es-CO') : '·'}
                        </td>
                      ))}
                      <td style={{ ...td, ...mono, fontWeight:700, color:T.accent, borderTop:`1px solid ${T.border}` }}>
                        {Math.round(d.total).toLocaleString('es-CO')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel titulo="Peso por grupo" sub="Dónde está tu estructura de costo">
              <Ranking items={d.porGrupo} limite={8} color={SERIES[0]} />
            </Panel>
          </div>

          <p style={{ marginTop:16, fontSize:12, color:T.dim, lineHeight:1.6, maxWidth:760 }}>
            Nota: este detalle suma <b style={{ color:T.textS }}>{fmtCOP(d.total)}</b>. En tu Excel, el total de
            la hoja de Costos Fijos se calculaba filtrando el Registro de Gastos por tipo "Costo Fijo", y daba
            $94.376.159 — una diferencia de $3.400.000 frente a este detalle. Vale la pena reconciliarlo.
          </p>
        </>
      )}
    </div>
  )
}

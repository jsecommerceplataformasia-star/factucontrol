import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../supabase.js'
import { T, FONT, Estilos, Kpi, Cargando, Btn, Modal, Campo, campo, fmtCOP, MESES } from '../ui.jsx'
import { Panel } from '../charts.jsx'
import { calcularPYG } from '../finanzas.js'

// ─── Inventario ─────────────────────────────────────────────────────────────
// Replica la hoja "📦 Inventario": inventario inicial + compras − COGS = final,
// encadenado mes a mes. Las compras salen solas de gastos categoría
// "Importaciones China". El COGS y el inventario inicial de enero son lo único
// que se ingresa a mano — y desde aquí, porque el PYG los usa también.
// ─────────────────────────────────────────────────────────────────────────

const ANIO = 2026

export default function Inventario() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editar, setEditar] = useState(null)   // { mes, cogs, inventario_inicial }
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const [g, p, d, pm] = await Promise.all([
      supabase.from('gastos').select('fecha,categoria,tipo_gasto,valor'),
      supabase.from('pauta_pagos').select('fecha,plataforma,inversion'),
      supabase.from('dropi_ordenes').select('fecha,estatus,orden_id,total_linea,precio_flete,precio_proveedor,costo_devolucion_flete'),
      supabase.from('parametros_mensuales').select('*').eq('anio', ANIO),
    ])
    const err = [g,p,d,pm].find(x => x.error)
    if (err) setError(err.error.message)
    setDatos({ gastos:g.data||[], pauta:p.data||[], dropi:d.data||[], parametros:pm.data||[] })
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const meses = useMemo(() => datos ? calcularPYG({ ...datos, anio:ANIO }) : [], [datos])
  const paramDe = (mes) => datos?.parametros.find(p => p.mes === mes) || {}
  const conMovimiento = meses.filter(m => m.compras !== 0 || m.cogs !== 0 || m.inventarioInicial !== 0)
  const vacio = !cargando && conMovimiento.length === 0

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true); setError('')
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      const fila = {
        user_id: user.id, anio: ANIO, mes: editar.mes,
        cogs: editar.cogs === '' ? null : Number(editar.cogs),
        inventario_inicial: editar.inventario_inicial === '' ? null : Number(editar.inventario_inicial),
      }
      const { error:err } = await supabase.from('parametros_mensuales')
        .upsert(fila, { onConflict: 'user_id,anio,mes' })
      if (err) throw new Error(err.message)
      setEditar(null); await cargar()
    } catch (err) { setError(err.message) }
    setGuardando(false)
  }

  const th = { padding:'10px 12px', fontSize:10, fontWeight:700, color:T.dim, textTransform:'uppercase',
               letterSpacing:'0.5px', borderBottom:`1px solid ${T.border}`, background:'rgba(255,255,255,0.03)',
               whiteSpace:'nowrap' }
  const td = { padding:'10px 12px', fontSize:13, borderBottom:`1px solid ${T.borderSub}`,
               fontFamily:"'DM Mono',monospace", textAlign:'right', whiteSpace:'nowrap' }

  return (
    <div style={{ padding:'26px 28px', fontFamily:FONT, color:T.text }}>
      <Estilos />
      <div style={{ fontSize:11.5, color:T.dim, marginBottom:5 }}>Administración <span style={{ opacity:.5 }}>/</span> Inventario</div>
      <h1 style={{ margin:'0 0 8px', fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>Control de Inventario {ANIO}</h1>
      <p style={{ margin:'0 0 22px', fontSize:13, color:T.dim, lineHeight:1.6, maxWidth:720 }}>
        Las compras salen solas de tus gastos de <b style={{ color:T.textS }}>Importaciones China</b>.
        El COGS (costo de mercancía vendida) es lo único que fijas tú cada mes — y ese mismo valor
        alimenta el P&G.
      </p>

      {error && <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.redBg,
                              border:'1px solid rgba(255,77,117,0.25)', color:T.red, fontSize:13 }}>{error}</div>}

      {cargando ? <Cargando /> : vacio ? (
        <div style={{ background:T.panel, border:`1px solid ${T.border}`, borderRadius:14, padding:'48px 28px', textAlign:'center' }}>
          <p style={{ margin:'0 0 8px', fontSize:15, fontWeight:600 }}>Todavía no hay movimientos de inventario</p>
          <p style={{ margin:0, fontSize:13, color:T.dim }}>
            Sube tu Excel en <b style={{ color:T.textS }}>Importar datos</b>: las compras de importación aparecen aquí solas.
          </p>
        </div>
      ) : (
        <>
          {(() => {
            const ultimo = [...meses].reverse().find(m => m.inventarioFinal !== 0) || meses[0]
            const compras = meses.reduce((s,m) => s + m.compras, 0)
            const cogs = meses.reduce((s,m) => s + m.cogs, 0)
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:18 }}>
                <Kpi etiqueta="Inventario actual" valor={fmtCOP(ultimo.inventarioFinal)}
                     color={ultimo.inventarioFinal >= 0 ? T.green : T.red} sub={`al cierre de ${MESES[ultimo.mes]}`} />
                <Kpi etiqueta="Compras del año" valor={fmtCOP(compras)} />
                <Kpi etiqueta="Costo mercancía vendida" valor={fmtCOP(cogs)} color={T.textS} />
              </div>
            )
          })()}

          {meses.some(m => m.inventarioFinal < 0) && (
            <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.yellowBg,
                          border:'1px solid rgba(251,191,36,0.25)', color:T.yellow, fontSize:12.5, lineHeight:1.6 }}>
              Hay meses con inventario final negativo. En tu Excel también pasa: significa que el COGS registrado
              supera lo comprado más el saldo inicial. Suele ser porque falta cargar una compra de importación,
              o porque el COGS de un mes está sobrestimado. Ajusta el COGS del mes con el botón "Fijar".
            </div>
          )}

          <Panel titulo="Movimiento mes a mes" sub="Inicial + compras − COGS = final. El final de un mes es el inicial del siguiente.">
            <div className="ui-scroll" style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:640 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign:'left' }}>Mes</th>
                    <th style={{ ...th, textAlign:'right' }}>Inventario inicial</th>
                    <th style={{ ...th, textAlign:'right' }}>(+) Compras</th>
                    <th style={{ ...th, textAlign:'right' }}>(−) COGS</th>
                    <th style={{ ...th, textAlign:'right' }}>(=) Inventario final</th>
                    <th style={{ ...th, textAlign:'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map(m => {
                    const activo = m.compras !== 0 || m.cogs !== 0 || m.inventarioInicial !== 0
                    if (!activo && m.mes > (conMovimiento.at(-1)?.mes || 0)) return null
                    return (
                      <tr key={m.mes} className="ui-fila">
                        <td style={{ padding:'10px 12px', fontSize:13, color:T.text, fontWeight:600,
                                     borderBottom:`1px solid ${T.borderSub}` }}>{MESES[m.mes]}</td>
                        <td style={{ ...td, color:T.textS }}>{fmtCOP(m.inventarioInicial)}</td>
                        <td style={{ ...td, color: m.compras ? T.green : T.dim }}>{m.compras ? fmtCOP(m.compras) : '·'}</td>
                        <td style={{ ...td, color: m.cogs ? T.textS : T.dim }}>
                          {m.cogs ? fmtCOP(m.cogs) : '·'}{m.cogsEsAuto && m.cogs ? '*' : ''}
                        </td>
                        <td style={{ ...td, fontWeight:700, color: m.inventarioFinal >= 0 ? T.text : T.red }}>
                          {fmtCOP(m.inventarioFinal)}
                        </td>
                        <td style={{ padding:'8px 12px', textAlign:'center', borderBottom:`1px solid ${T.borderSub}` }}>
                          <Btn v="fantasma" s="sm" onClick={() => setEditar({
                            mes:m.mes,
                            cogs: paramDe(m.mes).cogs ?? '',
                            inventario_inicial: paramDe(m.mes).inventario_inicial ?? '',
                          })}>Fijar</Btn>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ margin:'12px 0 0', fontSize:11.5, color:T.dim }}>
              COGS con <b style={{ color:T.textS }}>*</b>: calculado automático desde Dropi porque no lo has fijado a mano.
            </p>
          </Panel>
        </>
      )}

      <Modal abierto={!!editar} onCerrar={() => setEditar(null)} titulo={`Fijar valores de ${editar ? MESES[editar.mes] : ''}`} ancho={460}>
        {editar && (
          <form onSubmit={guardar}>
            <Campo etiqueta="COGS del mes (costo de mercancía vendida)">
              <input className="ui-in" style={campo} type="number" min="0" step="1"
                     placeholder="Déjalo vacío para calcularlo desde Dropi"
                     value={editar.cogs} onChange={e => setEditar({ ...editar, cogs:e.target.value })} />
            </Campo>
            {editar.mes === 1 && (
              <Campo etiqueta="Inventario inicial (solo enero)">
                <input className="ui-in" style={campo} type="number" step="1"
                       value={editar.inventario_inicial} onChange={e => setEditar({ ...editar, inventario_inicial:e.target.value })} />
              </Campo>
            )}
            <p style={{ fontSize:12, color:T.dim, lineHeight:1.6, margin:'4px 0 16px' }}>
              Si dejas el COGS vacío, el sistema usa el precio de proveedor de las órdenes entregadas ese mes.
              Este valor también se refleja en el P&G.
            </p>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <Btn v="sec" onClick={() => setEditar(null)}>Cancelar</Btn>
              <Btn type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

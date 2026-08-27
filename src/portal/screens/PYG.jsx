import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabase.js'
import { T, FONT, Estilos, Kpi, Cargando, fmtCOP, MESES } from '../ui.jsx'
import { BarrasMensuales, Panel } from '../charts.jsx'
import { calcularPYG, totalizar } from '../finanzas.js'

// ─── PYG · Estado de Resultados ─────────────────────────────────────────────
// Replica la hoja "📈 PYG" del Excel, calculada en vivo desde gastos, pauta,
// órdenes de Dropi y los parámetros mensuales (COGS).
// ─────────────────────────────────────────────────────────────────────────

const ANIO = 2026

// Definición de las filas del P&L. tipo: 'grupo' | 'linea' | 'total' | 'pct' | 'num'
const FILAS = [
  { grupo:'OPERACIÓN' },
  { campo:'pedidos', etiqueta:'Pedidos entregados', tipo:'num' },
  { grupo:'INGRESOS' },
  { campo:'ventaBruta', etiqueta:'Venta bruta (recaudo)' },
  { campo:'flete', etiqueta:'(−) Flete (descuento)', neg:true },
  { campo:'comision', etiqueta:'(−) Comisión recaudo', neg:true },
  { campo:'recaudoNeto', etiqueta:'(=) Recaudo neto', tipo:'sub' },
  { campo:'ticket', etiqueta:'Ticket promedio', tipo:'num$' },
  { grupo:'COSTO DE PRODUCTO' },
  { campo:'cogs', etiqueta:'(−) COGS (costo producto)', neg:true },
  { campo:'utilidadBruta', etiqueta:'(=) Utilidad bruta', tipo:'sub' },
  { campo:'margenBruto', etiqueta:'Margen bruto %', tipo:'pct' },
  { grupo:'DEVOLUCIONES Y EFECTIVIDAD' },
  { campo:'devueltas', etiqueta:'Órdenes devueltas', tipo:'num' },
  { campo:'rechazadas', etiqueta:'Órdenes rechazadas', tipo:'num' },
  { campo:'costoDevoluciones', etiqueta:'(−) Costo devoluciones', neg:true },
  { grupo:'PAUTA' },
  { campo:'meta', etiqueta:'Meta Ads', neg:true },
  { campo:'tiktok', etiqueta:'TikTok Ads', neg:true },
  { campo:'totalPauta', etiqueta:'(=) Total pauta', tipo:'sub' },
  { campo:'cpa', etiqueta:'CPA real', tipo:'num$' },
  { campo:'roas', etiqueta:'ROAS', tipo:'x' },
  { campo:'margenContribucion', etiqueta:'(=) Margen de contribución', tipo:'sub' },
  { grupo:'GASTOS OPERATIVOS' },
  { campo:'costosVariables', etiqueta:'(−) Costos variables', neg:true },
  { campo:'gastosFijos', etiqueta:'(−) Gastos fijos', neg:true },
  { campo:'utilidadNeta', etiqueta:'(=) UTILIDAD NETA', tipo:'total' },
  { campo:'margenNeto', etiqueta:'Margen neto %', tipo:'pct' },
]

const celda = (fila, v) => {
  if (v == null) return '·'
  if (fila.tipo === 'num') return Math.round(v).toLocaleString('es-CO')
  if (fila.tipo === 'num$') return v ? fmtCOP(v) : '·'
  if (fila.tipo === 'pct') return v ? `${(v*100).toFixed(1)}%` : '·'
  if (fila.tipo === 'x') return v ? `${v.toFixed(2)}x` : '·'
  return v ? Math.round(v).toLocaleString('es-CO') : '·'
}

export default function PYG() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const [g, p, d, pm] = await Promise.all([
        supabase.from('gastos').select('fecha,categoria,tipo_gasto,valor'),
        supabase.from('pauta_pagos').select('fecha,plataforma,inversion'),
        supabase.from('dropi_ordenes').select('fecha,estatus,orden_id,total_linea,precio_flete,precio_proveedor,costo_devolucion_flete'),
        supabase.from('parametros_mensuales').select('*').eq('anio', ANIO),
      ])
      const err = [g,p,d,pm].find(x => x.error)
      if (err) setError(err.error.message)
      setDatos({
        gastos: g.data || [], pauta: p.data || [], dropi: d.data || [], parametros: pm.data || [],
      })
      setCargando(false)
    })()
  }, [])

  const meses = useMemo(() => datos ? calcularPYG({ ...datos, anio:ANIO }) : [], [datos])
  const conDatos = meses.filter(m => m.tieneDatos)
  const vacio = !cargando && conDatos.length === 0

  const th = { padding:'9px 10px', fontSize:9.5, fontWeight:700, color:T.dim, textTransform:'uppercase',
               letterSpacing:'0.4px', borderBottom:`1px solid ${T.border}`, background:'#0A1428',
               position:'sticky', top:0, whiteSpace:'nowrap' }
  const td = { padding:'7px 10px', fontSize:12, borderBottom:`1px solid ${T.borderSub}`,
               whiteSpace:'nowrap', fontFamily:"'DM Mono',monospace", textAlign:'right' }

  return (
    <div style={{ padding:'26px 28px', fontFamily:FONT, color:T.text }}>
      <Estilos />
      <div style={{ fontSize:11.5, color:T.dim, marginBottom:5 }}>Administración <span style={{ opacity:.5 }}>/</span> Pérdidas y Ganancias</div>
      <h1 style={{ margin:'0 0 22px', fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>Pérdidas y Ganancias {ANIO}</h1>

      {error && <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.redBg,
                              border:'1px solid rgba(255,77,117,0.25)', color:T.red, fontSize:13 }}>{error}</div>}

      {cargando ? <Cargando /> : vacio ? (
        <div style={{ background:T.panel, border:`1px solid ${T.border}`, borderRadius:14, padding:'48px 28px', textAlign:'center' }}>
          <p style={{ margin:'0 0 8px', fontSize:15, fontWeight:600 }}>El P&G necesita datos de tres fuentes</p>
          <p style={{ margin:'0 0 4px', fontSize:13, color:T.dim, lineHeight:1.7 }}>
            Ingresos y devoluciones vienen de <b style={{ color:T.textS }}>órdenes de Dropi</b>,
            la pauta de <b style={{ color:T.textS }}>pagos de pauta</b>, y los costos de <b style={{ color:T.textS }}>gastos</b>.
          </p>
          <p style={{ margin:'12px 0 0', fontSize:13, color:T.dim }}>
            Ve a <b style={{ color:T.textS }}>Importar datos</b>, sube tu Excel y el reporte de Dropi, y este estado se arma solo.
          </p>
        </div>
      ) : (
        <>
          {(() => {
            const un = totalizar(meses, 'utilidadNeta')
            const vb = totalizar(meses, 'ventaBruta')
            const pa = totalizar(meses, 'totalPauta')
            const roas = pa ? vb / pa : 0
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:18 }}>
                <Kpi etiqueta="Venta bruta (año)" valor={fmtCOP(vb)} />
                <Kpi etiqueta="Utilidad neta (año)" valor={fmtCOP(un)} color={un >= 0 ? T.green : T.red} />
                <Kpi etiqueta="Inversión en pauta" valor={fmtCOP(pa)} color={T.textS} />
                <Kpi etiqueta="ROAS del año" valor={`${roas.toFixed(2)}x`} color={roas >= 3 ? T.green : T.yellow} />
              </div>
            )
          })()}

          <div style={{ marginBottom:14 }}>
            <Panel titulo="Utilidad neta por mes" sub="Barras: venta bruta y utilidad neta en la misma escala">
              <BarrasMensuales
                datos={conDatos.map(m => ({ etiqueta: MESES[m.mes].slice(0,3), venta:m.ventaBruta, util:m.utilidadNeta }))}
                series={[{ key:'venta', nombre:'Venta bruta' }, { key:'util', nombre:'Utilidad neta' }]} />
            </Panel>
          </div>

          <Panel titulo="Estado de resultados detallado" sub="Cada columna es un mes; la última es el total del año">
            <div className="ui-scroll" style={{ overflow:'auto', maxHeight:'62vh' }}>
              <table style={{ borderCollapse:'collapse', width:'max-content', minWidth:'100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign:'left', left:0, zIndex:3, minWidth:210 }}>Concepto</th>
                    {conDatos.map(m => <th key={m.mes} style={{ ...th, textAlign:'right' }}>{MESES[m.mes].slice(0,3)}</th>)}
                    <th style={{ ...th, textAlign:'right', color:T.textS }}>Total año</th>
                  </tr>
                </thead>
                <tbody>
                  {FILAS.map((f, i) => {
                    if (f.grupo) return (
                      <tr key={`g${i}`}>
                        <td colSpan={conDatos.length + 2} style={{ padding:'12px 10px 5px', fontSize:10,
                          fontWeight:700, color:T.accent, letterSpacing:'0.6px', background:'rgba(0,212,255,0.04)',
                          position:'sticky', left:0 }}>{f.grupo}</td>
                      </tr>
                    )
                    const esTotal = f.tipo === 'total', esSub = f.tipo === 'sub'
                    const totalAnio = ['num','num$','pct','x'].includes(f.tipo)
                      ? (f.tipo === 'pct' || f.tipo === 'x' || f.tipo === 'num$'
                          ? null : totalizar(meses, f.campo))
                      : totalizar(meses, f.campo)
                    const colorFila = esTotal ? (totalizar(meses,'utilidadNeta') >= 0 ? T.green : T.red)
                                     : esSub ? T.text : T.textS
                    return (
                      <tr key={f.campo} className="ui-fila">
                        <td style={{ padding:'7px 10px', fontSize: esTotal ? 12.5 : 12,
                          fontWeight: esTotal ? 800 : esSub ? 700 : 500,
                          color: esTotal ? colorFila : esSub ? T.text : T.textS,
                          borderBottom:`1px solid ${T.borderSub}`, borderTop: esTotal ? `1px solid ${T.border}` : undefined,
                          position:'sticky', left:0, background:'#0B1424', whiteSpace:'nowrap' }}>
                          {f.etiqueta}
                        </td>
                        {conDatos.map(m => (
                          <td key={m.mes} style={{ ...td,
                            fontWeight: esTotal ? 800 : esSub ? 700 : 400,
                            color: esTotal ? colorFila : f.neg ? T.dim : esSub ? T.text : T.textS,
                            borderTop: esTotal ? `1px solid ${T.border}` : undefined }}>
                            {f.campo === 'cogs' && m.cogsEsAuto && m[f.campo]
                              ? <span title="Calculado automático desde Dropi (sin parámetro)">{celda(f, m[f.campo])}*</span>
                              : celda(f, m[f.campo])}
                          </td>
                        ))}
                        <td style={{ ...td, fontWeight: esTotal ? 800 : 700,
                          color: esTotal ? colorFila : T.text,
                          borderTop: esTotal ? `1px solid ${T.border}` : undefined,
                          background:'rgba(255,255,255,0.02)' }}>
                          {totalAnio == null ? '' : celda(f, totalAnio)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ margin:'12px 0 0', fontSize:11.5, color:T.dim, lineHeight:1.6 }}>
              El COGS marcado con <b style={{ color:T.textS }}>*</b> se calculó automático desde el precio de
              proveedor de Dropi, porque ese mes no tiene un valor fijado en Parámetros. Para cuadrarlo con tu
              contabilidad, fija el COGS del mes en la pantalla de Inventario.
            </p>
          </Panel>
        </>
      )}
    </div>
  )
}

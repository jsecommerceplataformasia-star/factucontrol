import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabase.js'
import { T, FONT, Estilos, Kpi, Btn, Cargando, fmtCOP, MESES } from '../ui.jsx'
import { BarrasMensuales, Ranking, Proporcion, Panel, SERIES } from '../charts.jsx'

// ─── Dashboard Financiero ───────────────────────────────────────────────────
// Reemplaza las hojas de resumen del Excel: 🎯 Dashboard, 📊 Resumen Mensual,
// 📈 Por Categoría, 📈 Por Plataforma y 💰 Fijos vs Variables.
// Todo se calcula en vivo desde `gastos` y `pauta_pagos`.
// ─────────────────────────────────────────────────────────────────────────

const suma = (arr, campo) => arr.reduce((s, r) => s + Number(r[campo] || 0), 0)

function agrupar(arr, clave, campo) {
  const m = new Map()
  arr.forEach(r => {
    const k = r[clave] || 'Sin definir'
    m.set(k, (m.get(k) || 0) + Number(r[campo] || 0))
  })
  return [...m].map(([nombre, valor]) => ({ nombre, valor })).sort((a,b) => b.valor - a.valor)
}

export default function DashboardFinanciero() {
  const [gastos, setGastos] = useState([])
  const [pauta, setPauta]   = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]   = useState('')
  const [tabla, setTabla]   = useState(false)

  useEffect(() => {
    (async () => {
      const [g, p] = await Promise.all([
        supabase.from('gastos').select('fecha,categoria,tipo_gasto,valor,estado,origen'),
        supabase.from('pauta_pagos').select('fecha,plataforma,cuenta_publicitaria,inversion,estado'),
      ])
      if (g.error || p.error) setError((g.error || p.error).message)
      setGastos(g.data || []); setPauta(p.data || [])
      setCargando(false)
    })()
  }, [])

  const d = useMemo(() => {
    const totalGastos = suma(gastos, 'valor')
    const totalPauta  = suma(pauta, 'inversion')
    const pendGastos  = suma(gastos.filter(g => g.estado === 'Pendiente'), 'valor')
    const pendPauta   = suma(pauta.filter(p => p.estado === 'Pendiente'), 'inversion')
    const fijos       = suma(gastos.filter(g => g.tipo_gasto === 'Costo Fijo'), 'valor')
    const variables   = suma(gastos.filter(g => g.tipo_gasto === 'Costo Variable'), 'valor')

    const mesesMap = new Map()
    const anota = (fecha, campo, v) => {
      if (!fecha) return
      const m = Number(String(fecha).slice(5,7))
      if (!m) return
      const row = mesesMap.get(m) || { mes:m, etiqueta: MESES[m].slice(0,3), gastos:0, pauta:0 }
      row[campo] += Number(v || 0)
      mesesMap.set(m, row)
    }
    gastos.forEach(g => anota(g.fecha, 'gastos', g.valor))
    pauta.forEach(p => anota(p.fecha, 'pauta', p.inversion))
    const meses = [...mesesMap.values()].sort((a,b) => a.mes - b.mes)

    return {
      totalGastos, totalPauta, costoTotal: totalGastos + totalPauta,
      pendientes: pendGastos + pendPauta, fijos, variables, meses,
      porCategoria: agrupar(gastos, 'categoria', 'valor'),
      porPlataforma: agrupar(pauta, 'plataforma', 'inversion'),
      porCuenta: agrupar(pauta, 'cuenta_publicitaria', 'inversion'),
    }
  }, [gastos, pauta])

  const vacio = !cargando && gastos.length === 0 && pauta.length === 0

  return (
    <div style={{ padding:'26px 28px', fontFamily:FONT, color:T.text }}>
      <Estilos />
      <div style={{ fontSize:11.5, color:T.dim, marginBottom:5 }}>Administración <span style={{ opacity:.5 }}>/</span> Dashboard Financiero</div>
      <h1 style={{ margin:'0 0 22px', fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>Dashboard Financiero</h1>

      {error && (
        <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.redBg,
                      border:'1px solid rgba(255,77,117,0.25)', color:T.red, fontSize:13 }}>{error}</div>
      )}

      {cargando ? <Cargando /> : vacio ? (
        <div style={{ background:T.panel, border:`1px solid ${T.border}`, borderRadius:14,
                      padding:'48px 28px', textAlign:'center' }}>
          <p style={{ margin:'0 0 8px', fontSize:15, fontWeight:600 }}>Todavía no hay datos financieros</p>
          <p style={{ margin:'0 0 20px', fontSize:13, color:T.dim, lineHeight:1.6 }}>
            Ve a <b style={{ color:T.textS }}>Importar datos</b> y sube <code>gastos.csv</code> y{' '}
            <code>pauta_pagos.csv</code>. En cuanto estén cargados, todo este tablero se llena solo.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:18 }}>
            <Kpi etiqueta="Gastos operativos" valor={fmtCOP(d.totalGastos)} sub={`${gastos.length} registros`} />
            <Kpi etiqueta="Inversión en pauta" valor={fmtCOP(d.totalPauta)} sub={`${pauta.length} pagos`} color={T.green} />
            <Kpi etiqueta="Costo total empresa" valor={fmtCOP(d.costoTotal)} color={T.text} />
            <Kpi etiqueta="Pendiente por pagar" valor={fmtCOP(d.pendientes)} color={T.yellow} />
          </div>

          <div style={{ display:'grid', gap:14, marginBottom:14 }}>
            <Panel titulo="Gasto e inversión por mes" sub="Ambas series en la misma escala de pesos"
                   acciones={<Btn v="fantasma" s="sm" onClick={() => setTabla(t => !t)}>
                     {tabla ? 'Ver gráfica' : 'Ver tabla'}</Btn>}>
              {tabla ? (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead><tr>
                      {['Mes','Gastos','Pauta','Total'].map(h => (
                        <th key={h} style={{ textAlign: h==='Mes'?'left':'right', padding:'8px 10px',
                          fontSize:10, color:T.dim, textTransform:'uppercase', letterSpacing:'0.6px',
                          borderBottom:`1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {d.meses.map(m => (
                        <tr key={m.mes}>
                          <td style={{ padding:'8px 10px', borderBottom:`1px solid ${T.borderSub}` }}>{MESES[m.mes]}</td>
                          <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:"'DM Mono',monospace", borderBottom:`1px solid ${T.borderSub}` }}>{fmtCOP(m.gastos)}</td>
                          <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:"'DM Mono',monospace", borderBottom:`1px solid ${T.borderSub}` }}>{fmtCOP(m.pauta)}</td>
                          <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:"'DM Mono',monospace", color:T.textS, borderBottom:`1px solid ${T.borderSub}` }}>{fmtCOP(m.gastos + m.pauta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <BarrasMensuales datos={d.meses} series={[
                  { key:'gastos', nombre:'Gastos operativos' },
                  { key:'pauta',  nombre:'Inversión pauta' },
                ]} />
              )}
            </Panel>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(330px,1fr))', gap:14 }}>
            <Panel titulo="Gastos por categoría" sub="De mayor a menor en el periodo cargado">
              <Ranking items={d.porCategoria} limite={10} color={SERIES[0]} />
            </Panel>

            <Panel titulo="Costos fijos vs variables" sub="Cuánto de tu gasto es estructura">
              <Proporcion partes={[
                { nombre:'Costos fijos', valor:d.fijos },
                { nombre:'Costos variables', valor:d.variables },
              ]} />
            </Panel>

            <Panel titulo="Pauta por plataforma" sub="Dónde se está yendo la inversión">
              <Ranking items={d.porPlataforma} limite={6} color={SERIES[1]} />
            </Panel>

            <Panel titulo="Pauta por cuenta publicitaria" sub="Las 8 cuentas con más inversión">
              <Ranking items={d.porCuenta} limite={8} color={SERIES[2]} />
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

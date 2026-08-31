import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../supabase.js'

// ─── Torre de Control ───────────────────────────────────────────────────────
// Monta el tablero logístico (public/logistica/torre-de-control.html) y lo
// alimenta con los datos COMPARTIDOS de dropi_ordenes en Supabase, enviados al
// iframe por postMessage. Así, cuando Brenny sube el reporte en "Cargar reporte
// Dropi", este tablero se actualiza solo para todo el equipo.
// ─────────────────────────────────────────────────────────────────────────

const SRC = '/logistica/torre-de-control.html'

// Columnas que el tablero espera, en el mismo orden que su formato interno.
const D_COLS = [
  'ID','FECHA','ESTATUS','TRANSPORTADORA','DEPARTAMENTO DESTINO','CIUDAD DESTINO',
  'TIPO DE ENVIO','TOTAL DE LA ORDEN','PRECIO FLETE','COSTO DEVOLUCION FLETE',
  'PRECIO PROVEEDOR X CANTIDAD','CANTIDAD','NOVEDAD','FUE SOLUCIONADA LA NOVEDAD',
  'FECHA DE NOVEDAD','FECHA DE SOLUCIÓN','FECHA GUIA GENERADA','FECHA DE ÚLTIMO MOVIMIENTO',
  'PRODUCTO','DIRECCION','TIENDA','TAGS',
]

const SELECT = 'orden_id,fecha,estatus,transportadora,departamento_destino,ciudad_destino,' +
  'tipo_envio,total_linea,precio_flete,costo_devolucion_flete,precio_proveedor,cantidad,' +
  'novedad,novedad_solucionada,fecha_novedad,fecha_solucion,fecha_guia,fecha_ultimo_movimiento,' +
  'producto,direccion,tienda,tags'

// Supabase guarda fechas ISO (YYYY-MM-DD); el tablero las lee como DD-MM-YYYY.
const dmy = (s) => {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s)
}
const sol = (b) => (b === true ? 'SI' : b === false ? 'NO' : '')

function aFilas(data) {
  return data.map((r) => ([
    r.orden_id, dmy(r.fecha), r.estatus, r.transportadora, r.departamento_destino, r.ciudad_destino,
    r.tipo_envio, r.total_linea, r.precio_flete, r.costo_devolucion_flete, r.precio_proveedor, r.cantidad,
    r.novedad, sol(r.novedad_solucionada), dmy(r.fecha_novedad), dmy(r.fecha_solucion),
    dmy(r.fecha_guia), dmy(r.fecha_ultimo_movimiento), r.producto, r.direccion, r.tienda,
    Array.isArray(r.tags) ? r.tags.join(',') : (r.tags || ''),
  ]))
}

export default function TorreControl() {
  const [estado, setEstado] = useState('cargando')   // cargando | ok | vacio | error
  const [error, setError] = useState('')
  const [filas, setFilas] = useState(null)
  const [iframeListo, setIframeListo] = useState(false)
  const iframeRef = useRef(null)

  const cargar = useCallback(async () => {
    setEstado('cargando'); setError('')
    try {
      const PAGE = 1000
      let todo = [], desde = 0
      for (;;) {
        const { data, error: err } = await supabase
          .from('dropi_ordenes').select(SELECT).range(desde, desde + PAGE - 1)
        if (err) throw new Error(err.message)
        todo = todo.concat(data || [])
        if (!data || data.length < PAGE) break
        desde += PAGE
      }
      const f = aFilas(todo)
      setFilas(f)
      setEstado(f.length ? 'ok' : 'vacio')
    } catch (e) { setError(e.message); setEstado('error') }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Envía los datos al iframe cuando ya cargó y ya tenemos filas.
  useEffect(() => {
    if (iframeListo && filas && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'dropi-data', cols: D_COLS, filas }, '*')
    }
  }, [iframeListo, filas])

  const T = { bg:'#0E1420', accent:'#00D4FF', dim:'#8497AE', text:'#E8F0FF' }
  const FONT = "'DM Sans', system-ui, sans-serif"

  const Overlay = ({ children }) => (
    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap:14, textAlign:'center', padding:24,
      background:T.bg, color:T.dim, fontFamily:FONT, zIndex:2 }}>{children}</div>
  )

  return (
    <div style={{ position:'relative', width:'100%', height:'100vh', background:T.bg }}>
      <style>{`@keyframes tc-spin{to{transform:rotate(360deg)}}`}</style>

      {estado === 'cargando' && (
        <Overlay>
          <div style={{ width:26, height:26, borderRadius:'50%',
            border:`2px solid rgba(0,212,255,0.15)`, borderTopColor:T.accent,
            animation:'tc-spin .7s linear infinite' }} />
          <div style={{ fontSize:13 }}>Cargando datos de Dropi…</div>
        </Overlay>
      )}

      {estado === 'error' && (
        <Overlay>
          <div style={{ fontSize:15, fontWeight:600, color:'#FF6B8A' }}>No pude cargar los datos</div>
          <div style={{ fontSize:13, maxWidth:420, lineHeight:1.6 }}>{error}</div>
          <button onClick={cargar} style={{ marginTop:6, padding:'8px 16px', borderRadius:9,
            border:`1px solid ${T.accent}`, background:'transparent', color:T.accent,
            fontFamily:FONT, fontSize:13, cursor:'pointer' }}>Reintentar</button>
        </Overlay>
      )}

      {estado === 'vacio' && (
        <Overlay>
          <div style={{ fontSize:16, fontWeight:700, color:T.text }}>Todavía no hay reporte de Dropi cargado</div>
          <div style={{ fontSize:13.5, maxWidth:460, lineHeight:1.7 }}>
            Ve a <b style={{ color:T.accent }}>Cargar reporte Dropi</b> (en este mismo menú de Logística),
            sube el archivo de Dropi de hoy, y este tablero se llena solo — para todo el equipo.
          </div>
          <button onClick={cargar} style={{ marginTop:6, padding:'8px 16px', borderRadius:9,
            border:`1px solid ${T.accent}`, background:'transparent', color:T.accent,
            fontFamily:FONT, fontSize:13, cursor:'pointer' }}>Ya lo subí — recargar</button>
        </Overlay>
      )}

      <iframe
        ref={iframeRef}
        src={SRC}
        title="Torre de Control"
        onLoad={() => setIframeListo(true)}
        style={{ width:'100%', height:'100%', border:'none', display:'block',
          visibility: estado === 'ok' ? 'visible' : 'hidden' }}
      />
    </div>
  )
}

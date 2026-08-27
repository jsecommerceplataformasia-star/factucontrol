import { useState, useRef } from 'react'
import { supabase } from '../../supabase.js'
import { T, FONT, Estilos, Btn, Kpi, campo, fmtCOP } from '../ui.jsx'

// ─── Importar datos ─────────────────────────────────────────────────────────
// Carga archivos CSV a las tablas del sistema. Pensado para dos usos:
//   · La mudanza del histórico del Excel (una sola vez).
//   · La carga diaria del reporte de Dropi (repetida) — por eso usa `upsert`
//     con llave única: volver a subir el mismo reporte actualiza, no duplica.
// ─────────────────────────────────────────────────────────────────────────

const LOTE = 500

const num = (v) => { const x = Number(String(v ?? '').replace(/[^\d.-]/g,'')); return isNaN(x) ? 0 : x }
const txt = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s }
const fec = (v) => { const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null }
const bool = (v) => { const s = String(v ?? '').trim().toLowerCase(); return s === 'true' ? true : s === 'false' ? false : null }
const arr = (v) => {
  const s = String(v ?? '').trim()
  if (!s || s === '{}') return null
  return s.replace(/^\{|\}$/g,'').split(',').map(x => x.replace(/^"|"$/g,'').trim()).filter(Boolean)
}

const DESTINOS = [
  {
    key:'gastos', etiqueta:'Registro de Gastos', tabla:'gastos', archivo:'gastos.csv',
    conflicto:null, montoCol:'valor',
    nota:'Histórico de gastos operativos y pagos consolidados del Excel.',
    mapa:(r) => ({
      origen: txt(r.origen) || 'operativo', consecutivo: r.consecutivo ? num(r.consecutivo) : null,
      fecha: fec(r.fecha), producto_servicio: txt(r.producto_servicio), categoria: txt(r.categoria),
      tipo_gasto: txt(r.tipo_gasto), valor: num(r.valor), descripcion: txt(r.descripcion),
      banco_tarjeta: txt(r.banco_tarjeta), estado: txt(r.estado), responsable: txt(r.responsable),
      comprobante_dropi: txt(r.comprobante_dropi), fecha_pago: fec(r.fecha_pago),
    }),
  },
  {
    key:'pauta', etiqueta:'Registro de Pauta', tabla:'pauta_pagos', archivo:'pauta_pagos.csv',
    conflicto:null, montoCol:'inversion',
    nota:'Pagos de Meta, TikTok, cuota de manejo y wallet Dropi.',
    mapa:(r) => ({
      consecutivo: r.consecutivo ? num(r.consecutivo) : null, fecha: fec(r.fecha),
      plataforma: txt(r.plataforma), cuenta_publicitaria: txt(r.cuenta_publicitaria),
      inversion: num(r.inversion), id_transaccion: txt(r.id_transaccion),
      banco_tarjeta: txt(r.banco_tarjeta), estado: txt(r.estado), ajuste: txt(r.ajuste),
      cod_retiro_dropi: txt(r.cod_retiro_dropi), notas: txt(r.notas),
    }),
  },
  {
    key:'dropi', etiqueta:'Órdenes de Dropi', tabla:'dropi_ordenes', archivo:'dropi_ordenes.csv',
    conflicto:'sync_key', montoCol:'total_linea',
    nota:'Reporte diario de Dropi. Volver a subirlo actualiza las órdenes existentes en vez de duplicarlas.',
    mapa:(r) => ({
      orden_id: num(r.orden_id), fecha: fec(r.fecha), estatus: txt(r.estatus),
      transportadora: txt(r.transportadora), departamento_destino: txt(r.departamento_destino),
      ciudad_destino: txt(r.ciudad_destino), tipo_envio: txt(r.tipo_envio),
      total_linea: num(r.total_linea), precio_flete: num(r.precio_flete),
      costo_devolucion_flete: num(r.costo_devolucion_flete), precio_proveedor: num(r.precio_proveedor),
      cantidad: num(r.cantidad), novedad: txt(r.novedad), novedad_solucionada: bool(r.novedad_solucionada),
      fecha_novedad: fec(r.fecha_novedad), fecha_solucion: fec(r.fecha_solucion),
      fecha_guia: fec(r.fecha_guia), fecha_ultimo_movimiento: fec(r.fecha_ultimo_movimiento),
      producto: txt(r.producto), direccion: txt(r.direccion), tienda: txt(r.tienda),
      tags: arr(r.tags), sync_key: txt(r.sync_key) || `${num(r.orden_id)}|${String(r.producto ?? '').trim()}`,
    }),
  },
]

// ── Lector de CSV que respeta comillas y saltos de línea dentro de campos ──
function leerCSV(texto) {
  const filas = []; let campoActual = ''; let fila = []; let enComillas = false
  const t = texto.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (enComillas) {
      if (c === '"') { if (t[i+1] === '"') { campoActual += '"'; i++ } else enComillas = false }
      else campoActual += c
    } else if (c === '"') enComillas = true
    else if (c === ',') { fila.push(campoActual); campoActual = '' }
    else if (c === '\n') { fila.push(campoActual); filas.push(fila); fila = []; campoActual = '' }
    else if (c !== '\r') campoActual += c
  }
  if (campoActual !== '' || fila.length) { fila.push(campoActual); filas.push(fila) }
  if (!filas.length) return { cabeceras:[], datos:[] }
  const cabeceras = filas[0].map(h => h.trim())
  const datos = filas.slice(1)
    .filter(f => f.some(v => String(v).trim() !== ''))
    .map(f => Object.fromEntries(cabeceras.map((h, j) => [h, f[j] ?? ''])))
  return { cabeceras, datos }
}

export default function ImportarDatos() {
  const [destino, setDestino]   = useState(DESTINOS[0])
  const [datos, setDatos]       = useState(null)
  const [nombre, setNombre]     = useState('')
  const [reemplazar, setReemplazar] = useState(false)
  const [progreso, setProgreso] = useState(null)
  const [error, setError]       = useState('')
  const [resultado, setResultado] = useState(null)
  const inputRef = useRef(null)

  const elegirArchivo = async (file) => {
    setError(''); setResultado(null); setDatos(null)
    if (!file) return
    setNombre(file.name)
    try {
      const { cabeceras, datos } = leerCSV(await file.text())
      if (!datos.length) { setError('El archivo no tiene filas de datos.'); return }
      const faltantes = ['fecha'].filter(c => !cabeceras.includes(c))
      if (faltantes.length) setError(`Ojo: el archivo no trae la columna "${faltantes.join(', ')}". Revisa que sea el CSV correcto.`)
      setDatos(datos)
    } catch (e) { setError(`No se pudo leer el archivo: ${e.message}`) }
  }

  const importar = async () => {
    if (!datos) return
    setError(''); setResultado(null); setProgreso({ hechas:0, total:datos.length })
    try {
      const { data:{ user } } = await supabase.auth.getUser()

      if (reemplazar) {
        const { error:eDel } = await supabase.from(destino.tabla).delete().eq('user_id', user.id)
        if (eDel) throw new Error(`No se pudo limpiar la tabla: ${eDel.message}`)
      }

      let insertadas = 0
      for (let i = 0; i < datos.length; i += LOTE) {
        const lote = datos.slice(i, i + LOTE).map(r => ({ ...destino.mapa(r), user_id: user.id }))
        const r = destino.conflicto
          ? await supabase.from(destino.tabla).upsert(lote, { onConflict: destino.conflicto })
          : await supabase.from(destino.tabla).insert(lote)
        if (r.error) throw new Error(`Fila ~${i + 1}: ${r.error.message}`)
        insertadas += lote.length
        setProgreso({ hechas: Math.min(i + LOTE, datos.length), total: datos.length })
      }

      const { count } = await supabase.from(destino.tabla).select('*', { count:'exact', head:true })
      setResultado({ insertadas, enTabla: count })
      setDatos(null); setNombre(''); if (inputRef.current) inputRef.current.value = ''
    } catch (e) { setError(e.message) }
    setProgreso(null)
  }

  const totalArchivo = datos ? datos.reduce((s,r) => s + num(r[destino.montoCol]), 0) : 0

  return (
    <div style={{ padding:'26px 28px', fontFamily:FONT, color:T.text, maxWidth:900 }}>
      <Estilos />
      <div style={{ fontSize:11.5, color:T.dim, marginBottom:5 }}>Administración <span style={{ opacity:.5 }}>/</span> Importar datos</div>
      <h1 style={{ margin:'0 0 22px', fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>Importar datos</h1>

      {/* Destino */}
      <p style={{ fontSize:10.5, fontWeight:700, color:T.textS, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>¿Qué vas a cargar?</p>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
        {DESTINOS.map(d => (
          <button key={d.key} onClick={() => { setDestino(d); setDatos(null); setResultado(null); setError(''); setNombre('') }}
            style={{ padding:'9px 15px', borderRadius:9, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:FONT,
              border:`1px solid ${destino.key === d.key ? T.accent : T.border}`,
              background: destino.key === d.key ? T.accentBg : 'transparent',
              color: destino.key === d.key ? T.accent : T.textS }}>
            {d.etiqueta}
          </button>
        ))}
      </div>
      <p style={{ fontSize:12.5, color:T.dim, margin:'0 0 22px', lineHeight:1.6 }}>
        {destino.nota} Archivo esperado: <code style={{ color:T.textS }}>{destino.archivo}</code>
      </p>

      {/* Archivo */}
      <div style={{ background:T.panel, border:`1px dashed ${T.border}`, borderRadius:14, padding:'22px 24px', marginBottom:18 }}>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="ui-in"
               style={{ ...campo, padding:'9px 12px' }}
               onChange={e => elegirArchivo(e.target.files?.[0])} />
        {nombre && <p style={{ margin:'10px 0 0', fontSize:12.5, color:T.textS }}>Archivo: <b>{nombre}</b></p>}
      </div>

      {error && (
        <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.redBg,
                      border:'1px solid rgba(255,77,117,0.25)', color:T.red, fontSize:13 }}>{error}</div>
      )}

      {/* Vista previa */}
      {datos && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:12, marginBottom:16 }}>
            <Kpi etiqueta="Filas en el archivo" valor={datos.length.toLocaleString('es-CO')} />
            <Kpi etiqueta="Suma del archivo" valor={fmtCOP(totalArchivo)} color={T.green} />
            <Kpi etiqueta="Modo" valor={destino.conflicto ? 'Actualiza' : 'Agrega'}
                 sub={destino.conflicto ? `sin duplicar (${destino.conflicto})` : 'inserta filas nuevas'} color={T.textS} />
          </div>

          <label style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18, fontSize:13, color:T.textS, cursor:'pointer' }}>
            <input type="checkbox" checked={reemplazar} onChange={e => setReemplazar(e.target.checked)} />
            Borrar lo que ya existe en <b style={{ color:T.text }}>{destino.tabla}</b> antes de cargar
            <span style={{ fontSize:11.5, color:T.dim }}>(úsalo solo para la carga inicial del histórico)</span>
          </label>

          <Btn onClick={importar} disabled={!!progreso}>
            {progreso ? `Cargando ${progreso.hechas.toLocaleString('es-CO')} de ${progreso.total.toLocaleString('es-CO')}…`
                      : `Importar ${datos.length.toLocaleString('es-CO')} filas`}
          </Btn>

          {progreso && (
            <div style={{ marginTop:14, height:6, borderRadius:6, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(progreso.hechas / progreso.total) * 100}%`,
                            background:`linear-gradient(90deg,${T.accent},${T.green})`, transition:'width .25s' }} />
            </div>
          )}
        </>
      )}

      {resultado && (
        <div style={{ marginTop:18, padding:'16px 20px', borderRadius:12, background:T.greenBg,
                      border:'1px solid rgba(0,255,176,0.25)', color:T.text, fontSize:13.5, lineHeight:1.7 }}>
          Listo: se procesaron <b>{resultado.insertadas.toLocaleString('es-CO')}</b> filas.
          La tabla <b>{destino.tabla}</b> ahora tiene <b>{(resultado.enTabla ?? 0).toLocaleString('es-CO')}</b> registros.
        </div>
      )}
    </div>
  )
}

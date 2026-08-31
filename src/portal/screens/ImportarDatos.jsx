import { useState, useRef } from 'react'
import { supabase } from '../../supabase.js'
import { T, FONT, Estilos, Btn, Kpi, campo, fmtCOP } from '../ui.jsx'

// ─── Importar datos ─────────────────────────────────────────────────────────
// Acepta el Excel de Control Financiero tal cual (sin convertir a CSV) y el
// reporte de Dropi en Excel o CSV.
//
// Cuidados que ya están resueltos aquí, porque el Excel los tiene:
//   · La fila de encabezados no es la primera — se busca por su contenido.
//   · Hay filas "▶ TOTAL" dentro del rango que duplicarían las sumas.
//   · La columna "#" es fórmula y muchas filas no traen el valor calculado,
//     así que la fila se valida por su monto, no por el consecutivo.
//   · Dropi se carga con upsert: volver a subir el reporte no duplica.
// ─────────────────────────────────────────────────────────────────────────

const LOTE = 500
const MES = { Ene:1, Feb:2, Mar:3, Abr:4, May:5, Jun:6, Jul:7, Ago:8, Sep:9, Oct:10, Nov:11, Dic:12 }

const txt = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s }
const num = (v) => { const x = Number(String(v ?? '').replace(/[^\d.-]/g,'')); return isNaN(x) ? 0 : x }

// Fecha: acepta Date de Excel, ISO, DD-MM-YYYY y DD/MM/YYYY
const fec = (v) => {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`
  }
  const s = String(v ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10)
  const m = s.replace(/\//g,'-').match(/^(\d{2})-(\d{2})-(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const esFilaTotal = (r) => r.slice(0,8).some(c => {
  const s = String(c ?? '')
  return s.includes('▶') || s.toUpperCase().includes('TOTAL')
})

const filaEncabezado = (filas, clave) =>
  filas.findIndex(r => r && r.some(c => String(c ?? '').trim().toUpperCase() === clave))

// Busca una columna: primero por nombre exacto, y solo si no aparece, por
// coincidencia parcial. El orden importa — sin él, "user_id" se lleva la
// búsqueda de "ID" y "fecha_novedad" la de "FECHA".
const indice = (cab, ...fragmentos) => {
  const up = cab.map(c => String(c ?? '').toUpperCase().trim())
  for (const f of fragmentos) { const i = up.indexOf(f); if (i >= 0) return i }
  for (const f of fragmentos) { const i = up.findIndex(s => s.includes(f)); if (i >= 0) return i }
  return -1
}

// ── Lector de CSV con comillas ─────────────────────────────────────────────
function leerCSV(texto) {
  const filas = []; let campoActual = ''; let fila = []; let comillas = false
  const t = texto.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (comillas) {
      if (c === '"') { if (t[i+1] === '"') { campoActual += '"'; i++ } else comillas = false }
      else campoActual += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campoActual); campoActual = '' }
    else if (c === '\n') { fila.push(campoActual); filas.push(fila); fila = []; campoActual = '' }
    else if (c !== '\r') campoActual += c
  }
  if (campoActual !== '' || fila.length) { fila.push(campoActual); filas.push(fila) }
  return filas.filter(f => f.some(v => String(v).trim() !== ''))
}

// ── Extractores ────────────────────────────────────────────────────────────
function extraerGastos(hojas) {
  const out = []
  for (const [nombre, filas, origen] of hojas) {
    if (!filas?.length) continue
    const hi = filaEncabezado(filas, '#')
    if (hi < 0) continue
    const cab = filas[hi]
    const jv = indice(cab, 'VALOR')
    if (jv < 0) continue
    const j = {
      fecha: indice(cab,'FECHA') , prod: indice(cab,'PRODUCTO'), cat: indice(cab,'CATEGOR'),
      tipo: indice(cab,'TIPO'), desc: indice(cab,'DESCRIPCI'), banco: indice(cab,'BANCO'),
      estado: indice(cab,'ESTADO'), resp: indice(cab,'RESPONSABLE'),
      comp: indice(cab,'COMPROBANTE'), fpago: cab.findIndex(c => String(c??'').toUpperCase().includes('FECHA DE PAGO')),
    }
    for (const r of filas.slice(hi+1)) {
      const v = r[jv]
      if (typeof v !== 'number' || esFilaTotal(r)) continue
      out.push({
        origen, fecha: fec(r[j.fecha]), producto_servicio: txt(r[j.prod]), categoria: txt(r[j.cat]),
        tipo_gasto: txt(r[j.tipo]), valor: v, descripcion: txt(r[j.desc]),
        banco_tarjeta: txt(r[j.banco]), estado: txt(r[j.estado]), responsable: txt(r[j.resp]),
        comprobante_dropi: txt(r[j.comp]), fecha_pago: j.fpago >= 0 ? fec(r[j.fpago]) : null,
      })
    }
  }
  return out
}

function extraerPauta(filas) {
  if (!filas?.length) return []
  const hi = filaEncabezado(filas, '#'); if (hi < 0) return []
  const cab = filas[hi]
  const jv = indice(cab, 'INVERSI'); if (jv < 0) return []
  const j = {
    fecha: indice(cab,'FECHA'), plat: indice(cab,'PLATAFORMA'), cta: indice(cab,'CUENTA'),
    idt: indice(cab,'ID TRANS'), banco: indice(cab,'BANCO'), estado: indice(cab,'ESTADO'),
    ajuste: indice(cab,'AJUSTE'), retiro: indice(cab,'RETIRO'), notas: indice(cab,'NOTAS'),
  }
  const out = []
  for (const r of filas.slice(hi+1)) {
    const v = r[jv]
    if (typeof v !== 'number' || esFilaTotal(r)) continue
    out.push({
      fecha: fec(r[j.fecha]), plataforma: txt(r[j.plat]), cuenta_publicitaria: txt(r[j.cta]),
      inversion: v, id_transaccion: txt(r[j.idt]), banco_tarjeta: txt(r[j.banco]),
      estado: txt(r[j.estado]), ajuste: txt(r[j.ajuste]),
      cod_retiro_dropi: txt(r[j.retiro]), notas: txt(r[j.notas]),
    })
  }
  return out
}

function extraerCostosFijos(filas, anio = new Date().getFullYear()) {
  if (!filas?.length) return []
  const hi = filaEncabezado(filas, 'CONCEPTO'); if (hi < 0) return []
  const cab = filas[hi]
  const jc = cab.findIndex(c => String(c ?? '').trim().toUpperCase() === 'CONCEPTO')
  const meses = []
  cab.forEach((c, j) => { const k = String(c ?? '').trim(); if (MES[k]) meses.push([j, MES[k]]) })
  const out = []; let grupo = ''
  for (const r of filas.slice(hi+1)) {
    const raw = r[jc]; if (raw == null) continue
    const s = String(raw), nombre = s.trim()
    if (!nombre || nombre.toUpperCase().startsWith('TOTAL') || nombre.startsWith('▶')) continue
    if (s.slice(0,2) !== '  ' && nombre === nombre.toUpperCase()) { grupo = nombre; continue }
    for (const [j, mes] of meses) {
      const v = r[j]
      if (typeof v === 'number' && v !== 0) out.push({ grupo, concepto: nombre, anio, mes, valor: v })
    }
  }
  return out
}

function extraerDropi(filas) {
  if (!filas?.length) return []
  const cab = filas[0].map(c => String(c ?? '').trim())
  const j = (...f) => indice(cab, ...f)
  const c = {
    id: j('ORDEN_ID','ID'), fecha: j('FECHA'), est: j('ESTATUS'), transp: j('TRANSPORTADORA'),
    depto: j('DEPARTAMENTO'), ciudad: j('CIUDAD'), tipo: j('TIPO DE ENVIO','TIPO_ENVIO'),
    total: j('TOTAL DE LA ORDEN','TOTAL_LINEA'), flete: j('PRECIO FLETE','PRECIO_FLETE'),
    devol: j('COSTO DEVOLUCION','COSTO_DEVOLUCION'), prov: j('PRECIO PROVEEDOR X CANTIDAD','PRECIO_PROVEEDOR'),
    cant: j('CANTIDAD'), nov: j('NOVEDAD'), novOk: j('FUE SOLUCIONADA','NOVEDAD_SOLUCIONADA'),
    fNov: j('FECHA DE NOVEDAD','FECHA_NOVEDAD'), fSol: j('FECHA DE SOLUCI','FECHA_SOLUCION'),
    fGuia: j('GUIA GENERADA','FECHA_GUIA'), fMov: j('ÚLTIMO MOVIMIENTO','ULTIMO_MOVIMIENTO'),
    prod: j('PRODUCTO'), dir: j('DIRECCION'), tienda: j('TIENDA'), tags: j('TAGS'),
  }
  const out = []
  for (const r of filas.slice(1)) {
    const oid = num(r[c.id]); if (!oid) continue
    const producto = txt(r[c.prod]) || ''
    const sn = String(r[c.novOk] ?? '').trim().toUpperCase()
    const crudoTags = String(r[c.tags] ?? '').replace(/^\{|\}$/g,'')
    out.push({
      orden_id: oid, fecha: fec(r[c.fecha]), estatus: txt(r[c.est]), transportadora: txt(r[c.transp]),
      departamento_destino: txt(r[c.depto]), ciudad_destino: txt(r[c.ciudad]), tipo_envio: txt(r[c.tipo]),
      total_linea: num(r[c.total]), precio_flete: num(r[c.flete]),
      costo_devolucion_flete: num(r[c.devol]), precio_proveedor: num(r[c.prov]),
      cantidad: num(r[c.cant]), novedad: txt(r[c.nov]),
      novedad_solucionada: sn === 'SI' || sn === 'TRUE' ? true : (sn === 'NO' || sn === 'FALSE' ? false : null),
      fecha_novedad: fec(r[c.fNov]), fecha_solucion: fec(r[c.fSol]),
      fecha_guia: fec(r[c.fGuia]), fecha_ultimo_movimiento: fec(r[c.fMov]),
      producto, direccion: txt(r[c.dir]), tienda: txt(r[c.tienda]),
      tags: crudoTags ? crudoTags.split(',').map(t => t.replace(/^"|"$/g,'').trim()).filter(Boolean) : null,
      sync_key: `${oid}|${producto}`,
    })
  }
  return out
}

// ── Destinos ───────────────────────────────────────────────────────────────
const DESTINOS = [
  {
    key:'financiero', etiqueta:'Excel de Control Financiero', acepta:'.xlsx,.xls',
    nota:'Sube tu archivo CONTROL FINANCIERO tal cual. De un solo golpe carga gastos, pagos de pauta y costos fijos.',
    soloExcel:true,
  },
  {
    key:'dropi', etiqueta:'Reporte de Dropi', acepta:'.xlsx,.xls,.csv',
    nota:'El reporte de órdenes de Dropi, en Excel o CSV. Volver a subirlo actualiza lo existente en vez de duplicarlo.',
  },
]

export default function ImportarDatos() {
  const [destino, setDestino] = useState(DESTINOS[0])
  const [lotes, setLotes]     = useState(null)   // [{tabla, filas, monto, conflicto}]
  const [nombre, setNombre]   = useState('')
  const [reemplazar, setReemplazar] = useState(true)
  const [progreso, setProgreso] = useState(null)
  const [error, setError]     = useState('')
  const [resultado, setResultado] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const inputRef = useRef(null)

  const elegir = async (file) => {
    setError(''); setResultado(null); setLotes(null)
    if (!file) return
    setNombre(file.name); setLeyendo(true)
    try {
      const esExcel = /\.xlsx?$/i.test(file.name)
      if (destino.soloExcel && !esExcel) throw new Error('Este destino espera un archivo de Excel (.xlsx).')

      let preparados = []
      if (esExcel) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { cellDates:true })
        const hoja = (frag) => {
          const n = wb.SheetNames.find(s => s.toUpperCase().includes(frag))
          return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, raw:true, defval:null }) : null
        }
        if (destino.key === 'financiero') {
          const gastos = extraerGastos([
            ['Registro de Gastos',  hoja('REGISTRO DE GASTOS'), 'operativo'],
            ['Pago Consolidados',   hoja('CONSOLIDADO'),        'consolidado'],
          ])
          const pauta  = extraerPauta(hoja('REGISTRO PAUTA'))
          const fijos  = extraerCostosFijos(hoja('COSTOS FIJOS'))
          preparados = [
            { tabla:'gastos',       filas:gastos, monto:gastos.reduce((s,r)=>s+r.valor,0) },
            { tabla:'pauta_pagos',  filas:pauta,  monto:pauta.reduce((s,r)=>s+r.inversion,0) },
            { tabla:'costos_fijos', filas:fijos,  monto:fijos.reduce((s,r)=>s+r.valor,0) },
          ].filter(l => l.filas.length)
        } else {
          const primera = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true, defval:null })
          const f = extraerDropi(primera)
          preparados = [{ tabla:'dropi_ordenes', filas:f, monto:f.reduce((s,r)=>s+r.total_linea,0), conflicto:'sync_key' }]
        }
      } else {
        const f = extraerDropi(leerCSV(await file.text()))
        preparados = [{ tabla:'dropi_ordenes', filas:f, monto:f.reduce((s,r)=>s+r.total_linea,0), conflicto:'sync_key' }]
      }

      if (!preparados.length || !preparados.some(l => l.filas.length)) {
        throw new Error('No encontré filas de datos en ese archivo. Revisa que sea el correcto.')
      }
      setLotes(preparados)
    } catch (e) { setError(e.message) }
    setLeyendo(false)
  }

  const importar = async () => {
    setError(''); setResultado(null)
    const total = lotes.reduce((s,l) => s + l.filas.length, 0)
    setProgreso({ hechas:0, total })
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      let hechas = 0; const resumen = []
      for (const lote of lotes) {
        if (reemplazar && !lote.conflicto) {
          const { error:eDel } = await supabase.from(lote.tabla).delete().eq('user_id', user.id)
          if (eDel) throw new Error(`No se pudo limpiar ${lote.tabla}: ${eDel.message}`)
        }
        for (let i = 0; i < lote.filas.length; i += LOTE) {
          const trozo = lote.filas.slice(i, i+LOTE).map(r => ({ ...r, user_id:user.id }))
          const r = lote.conflicto
            ? await supabase.from(lote.tabla).upsert(trozo, { onConflict: lote.conflicto })
            : await supabase.from(lote.tabla).insert(trozo)
          if (r.error) throw new Error(`${lote.tabla}, fila ~${i+1}: ${r.error.message}`)
          hechas += trozo.length
          setProgreso({ hechas, total })
        }
        const { count } = await supabase.from(lote.tabla).select('*', { count:'exact', head:true })
        resumen.push({ tabla:lote.tabla, cargadas:lote.filas.length, enTabla:count })
      }
      setResultado(resumen)
      setLotes(null); setNombre(''); if (inputRef.current) inputRef.current.value = ''
    } catch (e) { setError(e.message) }
    setProgreso(null)
  }

  return (
    <div style={{ padding:'26px 28px', fontFamily:FONT, color:T.text, maxWidth:900 }}>
      <Estilos />
      <div style={{ fontSize:11.5, color:T.dim, marginBottom:5 }}>Administración <span style={{ opacity:.5 }}>/</span> Importar datos</div>
      <h1 style={{ margin:'0 0 22px', fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>Importar datos</h1>

      <p style={{ fontSize:10.5, fontWeight:700, color:T.textS, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>¿Qué vas a cargar?</p>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
        {DESTINOS.map(d => (
          <button key={d.key} onClick={() => { setDestino(d); setLotes(null); setResultado(null); setError(''); setNombre('') }}
            style={{ padding:'9px 15px', borderRadius:9, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:FONT,
              border:`1px solid ${destino.key === d.key ? T.accent : T.border}`,
              background: destino.key === d.key ? T.accentBg : 'transparent',
              color: destino.key === d.key ? T.accent : T.textS }}>{d.etiqueta}</button>
        ))}
      </div>
      <p style={{ fontSize:12.5, color:T.dim, margin:'0 0 22px', lineHeight:1.6 }}>{destino.nota}</p>

      <div style={{ background:T.panel, border:`1px dashed ${T.border}`, borderRadius:14, padding:'22px 24px', marginBottom:18 }}>
        <input ref={inputRef} type="file" accept={destino.acepta} className="ui-in"
               style={{ ...campo, padding:'9px 12px' }}
               onChange={e => elegir(e.target.files?.[0])} />
        {nombre && <p style={{ margin:'10px 0 0', fontSize:12.5, color:T.textS }}>Archivo: <b>{nombre}</b></p>}
        {leyendo && <p style={{ margin:'8px 0 0', fontSize:12.5, color:T.accent }}>Leyendo el archivo…</p>}
      </div>

      {error && <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.redBg,
                              border:'1px solid rgba(255,77,117,0.25)', color:T.red, fontSize:13 }}>{error}</div>}

      {lotes && (
        <>
          <p style={{ fontSize:13, color:T.textS, marginBottom:12 }}>
            Esto es lo que encontré. <b style={{ color:T.text }}>Compáralo con tu archivo antes de confirmar.</b>
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12, marginBottom:16 }}>
            {lotes.map(l => (
              <Kpi key={l.tabla} etiqueta={l.tabla.replace('_',' ')}
                   valor={`${l.filas.length.toLocaleString('es-CO')} filas`}
                   sub={fmtCOP(l.monto)} color={T.green} />
            ))}
          </div>

          {!lotes.every(l => l.conflicto) && (
            <label style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18, fontSize:13, color:T.textS, cursor:'pointer' }}>
              <input type="checkbox" checked={reemplazar} onChange={e => setReemplazar(e.target.checked)} />
              Borrar lo que ya existe antes de cargar
              <span style={{ fontSize:11.5, color:T.dim }}>(déjalo marcado si estás volviendo a subir el mismo Excel)</span>
            </label>
          )}

          <Btn onClick={importar} disabled={!!progreso}>
            {progreso ? `Cargando ${progreso.hechas.toLocaleString('es-CO')} de ${progreso.total.toLocaleString('es-CO')}…`
                      : `Importar ${lotes.reduce((s,l)=>s+l.filas.length,0).toLocaleString('es-CO')} filas`}
          </Btn>

          {progreso && (
            <div style={{ marginTop:14, height:6, borderRadius:6, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(progreso.hechas/progreso.total)*100}%`,
                            background:`linear-gradient(90deg,${T.accent},${T.green})`, transition:'width .25s' }} />
            </div>
          )}
        </>
      )}

      {resultado && (
        <div style={{ marginTop:18, padding:'16px 20px', borderRadius:12, background:T.greenBg,
                      border:'1px solid rgba(0,255,176,0.25)', fontSize:13.5, lineHeight:1.8 }}>
          <b>Listo.</b>
          {resultado.map(r => (
            <div key={r.tabla}>
              · <b>{r.tabla.replace('_',' ')}</b>: {r.cargadas.toLocaleString('es-CO')} filas procesadas —
              la tabla queda con {(r.enTabla ?? 0).toLocaleString('es-CO')} registros.
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

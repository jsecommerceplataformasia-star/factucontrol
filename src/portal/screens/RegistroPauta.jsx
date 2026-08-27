import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../supabase.js'
import {
  T, FONT, Estilos, Btn, Campo, Select, Modal, Kpi, Etiqueta, Cargando, Vacio,
  campo, fmtCOP, fmtFecha, hoy, MESES,
} from '../ui.jsx'

// ─── Registro de Pauta ──────────────────────────────────────────────────────
// Reemplaza la hoja "📢 Registro Pauta 2026": cada pago de Meta, TikTok,
// cuota de manejo y wallet Dropi, con su tarjeta y código de retiro.
// ─────────────────────────────────────────────────────────────────────────

const VACIO = {
  fecha:hoy(), plataforma:'', cuenta_publicitaria:'', inversion:'', id_transaccion:'',
  banco_tarjeta:'', estado:'Pagado', ajuste:'', cod_retiro_dropi:'', notas:'', soporte_path:null,
}

export default function RegistroPauta() {
  const [pagos, setPagos]   = useState([])
  const [listas, setListas] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError]   = useState('')

  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [fPlataforma, setFPlataforma] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fMes, setFMes] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    const [p, c] = await Promise.all([
      supabase.from('pauta_pagos').select('*').order('fecha', { ascending:false }).order('created_at', { ascending:false }),
      supabase.from('catalogos').select('lista,valor').eq('activo', true).order('orden'),
    ])
    if (p.error) setError(`No se pudieron cargar los pagos: ${p.error.message}`)
    else setPagos(p.data || [])
    if (c.data) {
      const m = {}; c.data.forEach(r => { (m[r.lista] ||= []).push(r.valor) }); setListas(m)
    }
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return pagos.filter(p => {
      if (fPlataforma && p.plataforma !== fPlataforma) return false
      if (fEstado && p.estado !== fEstado) return false
      if (fMes && String(p.fecha || '').slice(5,7) !== fMes) return false
      if (!q) return true
      return [p.cuenta_publicitaria, p.id_transaccion, p.banco_tarjeta, p.cod_retiro_dropi, p.notas]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [pagos, busqueda, fPlataforma, fEstado, fMes])

  const kpis = useMemo(() => {
    const s = (a) => a.reduce((x,p) => x + Number(p.inversion || 0), 0)
    return {
      total: s(filtrados),
      meta: s(filtrados.filter(p => p.plataforma === 'Meta Ads')),
      tiktok: s(filtrados.filter(p => p.plataforma === 'TikTok Ads')),
      pendientes: s(filtrados.filter(p => p.estado === 'Pendiente')),
      n: filtrados.length,
    }
  }, [filtrados])

  const abrirNuevo = () => { setForm(VACIO); setEditId(null); setArchivo(null); setModal(true) }
  const abrirEditar = (p) => {
    setForm({ ...VACIO, ...p, inversion: p.inversion ?? '', fecha: p.fecha || hoy() })
    setEditId(p.id); setArchivo(null); setModal(true)
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.fecha || !form.plataforma || form.inversion === '') {
      setError('Fecha, plataforma e inversión son obligatorios.'); return
    }
    setGuardando(true); setError('')
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      let soporte_path = form.soporte_path || null
      if (archivo) {
        const limpio = archivo.name.replace(/[^\w.\-]/g,'_')
        const ruta = `${user.id}/pauta/${Date.now()}-${limpio}`
        const { error:eUp } = await supabase.storage.from('soportes').upload(ruta, archivo)
        if (eUp) throw new Error(`No se pudo subir el soporte: ${eUp.message}`)
        soporte_path = ruta
      }
      const fila = {
        user_id: user.id, fecha: form.fecha, plataforma: form.plataforma,
        cuenta_publicitaria: form.cuenta_publicitaria || null,
        inversion: Number(form.inversion) || 0, id_transaccion: form.id_transaccion || null,
        banco_tarjeta: form.banco_tarjeta || null, estado: form.estado || null,
        ajuste: form.ajuste || null, cod_retiro_dropi: form.cod_retiro_dropi || null,
        notas: form.notas || null, soporte_path,
      }
      const r = editId
        ? await supabase.from('pauta_pagos').update(fila).eq('id', editId)
        : await supabase.from('pauta_pagos').insert(fila)
      if (r.error) throw new Error(r.error.message)
      setModal(false); setArchivo(null); await cargar()
    } catch (err) { setError(err.message) }
    setGuardando(false)
  }

  const borrar = async (p) => {
    setConfirmar(null); setError('')
    if (p.soporte_path) await supabase.storage.from('soportes').remove([p.soporte_path])
    const { error:e } = await supabase.from('pauta_pagos').delete().eq('id', p.id)
    if (e) setError(`No se pudo eliminar: ${e.message}`); else await cargar()
  }

  const verSoporte = async (ruta) => {
    const { data, error:e } = await supabase.storage.from('soportes').createSignedUrl(ruta, 60)
    if (e) setError(`No se pudo abrir el soporte: ${e.message}`)
    else window.open(data.signedUrl, '_blank', 'noopener')
  }

  const th = { textAlign:'left', padding:'10px 12px', fontSize:10, fontWeight:700, color:T.dim,
               textTransform:'uppercase', letterSpacing:'0.6px', whiteSpace:'nowrap',
               background:'rgba(255,255,255,0.03)', borderBottom:`1px solid ${T.border}`, position:'sticky', top:0 }
  const td = { padding:'11px 12px', fontSize:13, color:T.text, borderBottom:`1px solid ${T.borderSub}` }

  return (
    <div style={{ padding:'26px 28px', fontFamily:FONT, color:T.text }}>
      <Estilos />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap', marginBottom:22 }}>
        <div>
          <div style={{ fontSize:11.5, color:T.dim, marginBottom:5 }}>Administración <span style={{ opacity:.5 }}>/</span> Registro de Pauta</div>
          <h1 style={{ margin:0, fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>Registro de Pauta</h1>
        </div>
        <Btn onClick={abrirNuevo}>+ Nuevo pago</Btn>
      </div>

      {error && <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.redBg,
                              border:'1px solid rgba(255,77,117,0.25)', color:T.red, fontSize:13 }}>{error}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:20 }}>
        <Kpi etiqueta="Total invertido" valor={fmtCOP(kpis.total)} sub={`${kpis.n} transacciones`} />
        <Kpi etiqueta="Meta Ads" valor={fmtCOP(kpis.meta)} color={T.green} />
        <Kpi etiqueta="TikTok Ads" valor={fmtCOP(kpis.tiktok)} color={T.purple || T.textS} />
        <Kpi etiqueta="Pendientes" valor={fmtCOP(kpis.pendientes)} color={T.yellow} />
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <input className="ui-in" style={{ ...campo, width:230 }} placeholder="Buscar cuenta, ID, retiro…"
               value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select className="ui-in" style={{ ...campo, width:170 }} value={fPlataforma} onChange={e => setFPlataforma(e.target.value)}>
          <option value="">Todas las plataformas</option>
          {(listas.PLATAFORMAS || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="ui-in" style={{ ...campo, width:150 }} value={fEstado} onChange={e => setFEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {(listas.ESTADOS || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="ui-in" style={{ ...campo, width:150 }} value={fMes} onChange={e => setFMes(e.target.value)}>
          <option value="">Todo el año</option>
          {MESES.slice(1).map((m,i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
        </select>
        {(busqueda || fPlataforma || fEstado || fMes) && (
          <Btn v="fantasma" s="sm" onClick={() => { setBusqueda(''); setFPlataforma(''); setFEstado(''); setFMes('') }}>Limpiar filtros</Btn>
        )}
      </div>

      <div className="ui-scroll" style={{ background:T.panel, border:`1px solid ${T.border}`, borderRadius:14, overflow:'auto', maxHeight:'58vh' }}>
        {cargando ? <Cargando /> : filtrados.length === 0 ? (
          <Vacio titulo={pagos.length === 0 ? 'Todavía no hay pagos de pauta' : 'Ningún pago coincide con los filtros'}
                 sub={pagos.length === 0 ? 'Registra el primero o importa pauta_pagos.csv desde Importar datos.' : null}
                 accion={pagos.length === 0 ? <Btn onClick={abrirNuevo}>+ Registrar el primero</Btn> : null} />
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <th style={th}>Fecha</th><th style={th}>Plataforma</th><th style={th}>Cuenta</th>
              <th style={{ ...th, textAlign:'right' }}>Inversión</th><th style={th}>ID transacción</th>
              <th style={th}>Banco</th><th style={th}>Estado</th><th style={th}>Soporte</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id} className="ui-fila">
                  <td style={{ ...td, whiteSpace:'nowrap' }}>{fmtFecha(p.fecha)}</td>
                  <td style={td}>{p.plataforma || '—'}</td>
                  <td style={{ ...td, color:T.textS }}>{p.cuenta_publicitaria || '—'}</td>
                  <td style={{ ...td, textAlign:'right', fontFamily:"'DM Mono',monospace", fontWeight:600, whiteSpace:'nowrap' }}>{fmtCOP(p.inversion)}</td>
                  <td style={{ ...td, color:T.dim, fontSize:11.5, fontFamily:"'DM Mono',monospace" }}>{p.id_transaccion || '—'}</td>
                  <td style={{ ...td, color:T.textS, fontSize:12 }}>{p.banco_tarjeta || '—'}</td>
                  <td style={td}><Etiqueta texto={p.estado} /></td>
                  <td style={td}>{p.soporte_path
                    ? <Btn v="fantasma" s="sm" onClick={() => verSoporte(p.soporte_path)} style={{ color:T.accent }}>Ver</Btn>
                    : <span style={{ color:T.dim, fontSize:12 }}>—</span>}</td>
                  <td style={{ ...td, whiteSpace:'nowrap', textAlign:'right' }}>
                    <Btn v="fantasma" s="sm" onClick={() => abrirEditar(p)}>Editar</Btn>
                    <Btn v="fantasma" s="sm" onClick={() => setConfirmar(p)} style={{ color:T.red }}>Borrar</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo={editId ? 'Editar pago de pauta' : 'Nuevo pago de pauta'}>
        <form onSubmit={guardar}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
            <Campo etiqueta="Fecha" obligatorio>
              <input className="ui-in" style={campo} type="date" value={form.fecha}
                     onChange={e => setForm({ ...form, fecha:e.target.value })} />
            </Campo>
            <Campo etiqueta="Inversión ($COP)" obligatorio>
              <input className="ui-in" style={campo} type="number" min="0" step="1" placeholder="0"
                     value={form.inversion} onChange={e => setForm({ ...form, inversion:e.target.value })} />
            </Campo>
            <Campo etiqueta="Plataforma" obligatorio>
              <Select valor={form.plataforma} onChange={v => setForm({ ...form, plataforma:v })} opciones={listas.PLATAFORMAS || []} />
            </Campo>
            <Campo etiqueta="Cuenta publicitaria">
              <Select valor={form.cuenta_publicitaria} onChange={v => setForm({ ...form, cuenta_publicitaria:v })} opciones={listas.CUENTAS_PUBLICITARIAS || []} />
            </Campo>
            <Campo etiqueta="ID de transacción">
              <input className="ui-in" style={campo} value={form.id_transaccion}
                     onChange={e => setForm({ ...form, id_transaccion:e.target.value })} />
            </Campo>
            <Campo etiqueta="Banco / tarjeta">
              <Select valor={form.banco_tarjeta} onChange={v => setForm({ ...form, banco_tarjeta:v })} opciones={listas.BANCOS || []} />
            </Campo>
            <Campo etiqueta="Estado">
              <Select valor={form.estado} onChange={v => setForm({ ...form, estado:v })} opciones={listas.ESTADOS || []} />
            </Campo>
            <Campo etiqueta="Código retiro Dropi">
              <input className="ui-in" style={campo} placeholder="Ej: 001 Pauta"
                     value={form.cod_retiro_dropi} onChange={e => setForm({ ...form, cod_retiro_dropi:e.target.value })} />
            </Campo>
            <Campo etiqueta="Ajuste">
              <input className="ui-in" style={campo} value={form.ajuste}
                     onChange={e => setForm({ ...form, ajuste:e.target.value })} />
            </Campo>
            <Campo etiqueta="Notas">
              <input className="ui-in" style={campo} value={form.notas}
                     onChange={e => setForm({ ...form, notas:e.target.value })} />
            </Campo>
            <Campo etiqueta="Soporte (foto o PDF)" ancho={2}>
              <input className="ui-in" style={{ ...campo, padding:'8px 12px' }} type="file"
                     accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] || null)} />
              {form.soporte_path && !archivo && (
                <p style={{ margin:'6px 0 0', fontSize:11.5, color:T.dim }}>Ya tiene soporte. Si eliges otro archivo, lo reemplaza.</p>
              )}
            </Campo>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:12,
                        borderTop:`1px solid ${T.borderSub}`, paddingTop:18 }}>
            <Btn v="sec" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Registrar pago'}</Btn>
          </div>
        </form>
      </Modal>

      <Modal abierto={!!confirmar} onCerrar={() => setConfirmar(null)} titulo="Eliminar pago" ancho={430}>
        <p style={{ margin:'0 0 20px', fontSize:14, color:T.textS, lineHeight:1.6 }}>
          Vas a eliminar el pago de <b style={{ color:T.text }}>{confirmar?.plataforma}</b> por{' '}
          <b style={{ color:T.text }}>{fmtCOP(confirmar?.inversion)}</b>. Esta acción no se puede deshacer.
        </p>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <Btn v="sec" onClick={() => setConfirmar(null)}>Cancelar</Btn>
          <Btn v="peligro" onClick={() => borrar(confirmar)}>Sí, eliminar</Btn>
        </div>
      </Modal>
    </div>
  )
}

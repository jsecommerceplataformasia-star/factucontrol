import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../supabase.js'
import {
  T, FONT, Estilos, Btn, Campo, Select, Modal, Kpi, Etiqueta, Cargando, Vacio,
  campo, fmtCOP, fmtFecha, hoy, MESES,
} from '../ui.jsx'

// ─── Registro de Gastos ─────────────────────────────────────────────────────
// Reemplaza la hoja "📋 Registro de Gastos" del Excel: captura, edición,
// borrado y soporte adjunto. Los desplegables salen de la tabla `catalogos`.
// ─────────────────────────────────────────────────────────────────────────

const VACIO = {
  origen:'operativo', fecha:hoy(), producto_servicio:'', categoria:'', tipo_gasto:'',
  valor:'', descripcion:'', banco_tarjeta:'', estado:'Pagado', responsable:'',
  comprobante_dropi:'', fecha_pago:'', soporte_path:null,
}

export default function RegistroGastos() {
  const [gastos, setGastos]     = useState([])
  const [listas, setListas]     = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState('')

  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VACIO)
  const [editId, setEditId]   = useState(null)
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(null)

  const [busqueda, setBusqueda]   = useState('')
  const [fCategoria, setFCategoria] = useState('')
  const [fEstado, setFEstado]     = useState('')
  const [fMes, setFMes]           = useState('')

  // ── Carga ────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setError('')
    const [g, c] = await Promise.all([
      supabase.from('gastos').select('*').order('fecha', { ascending:false }).order('created_at', { ascending:false }),
      supabase.from('catalogos').select('lista,valor').eq('activo', true).order('orden'),
    ])
    if (g.error) setError(`No se pudieron cargar los gastos: ${g.error.message}`)
    else setGastos(g.data || [])
    if (c.data) {
      const m = {}
      c.data.forEach(r => { (m[r.lista] ||= []).push(r.valor) })
      setListas(m)
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Filtrado ─────────────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return gastos.filter(g => {
      if (fCategoria && g.categoria !== fCategoria) return false
      if (fEstado && g.estado !== fEstado) return false
      if (fMes && String(g.fecha || '').slice(5,7) !== fMes) return false
      if (!q) return true
      return [g.producto_servicio, g.descripcion, g.categoria, g.banco_tarjeta, g.responsable, g.comprobante_dropi]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [gastos, busqueda, fCategoria, fEstado, fMes])

  const kpis = useMemo(() => {
    const suma = (arr) => arr.reduce((s,g) => s + Number(g.valor || 0), 0)
    return {
      total: suma(filtrados),
      pagados: suma(filtrados.filter(g => g.estado === 'Pagado')),
      pendientes: suma(filtrados.filter(g => g.estado === 'Pendiente')),
      n: filtrados.length,
    }
  }, [filtrados])

  // ── Guardar ──────────────────────────────────────────────────────────────
  const abrirNuevo = () => { setForm(VACIO); setEditId(null); setArchivo(null); setModal(true) }
  const abrirEditar = (g) => {
    setForm({ ...VACIO, ...g, valor: g.valor ?? '', fecha: g.fecha || hoy(), fecha_pago: g.fecha_pago || '' })
    setEditId(g.id); setArchivo(null); setModal(true)
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.fecha || !form.categoria || !form.tipo_gasto || form.valor === '') {
      setError('Fecha, categoría, tipo de gasto y valor son obligatorios.'); return
    }
    setGuardando(true); setError('')
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      let soporte_path = form.soporte_path || null

      if (archivo) {
        const limpio = archivo.name.replace(/[^\w.\-]/g, '_')
        const ruta = `${user.id}/gastos/${Date.now()}-${limpio}`
        const { error:eUp } = await supabase.storage.from('soportes').upload(ruta, archivo)
        if (eUp) throw new Error(`No se pudo subir el soporte: ${eUp.message}`)
        soporte_path = ruta
      }

      const fila = {
        user_id: user.id,
        origen: form.origen || 'operativo',
        fecha: form.fecha,
        producto_servicio: form.producto_servicio || null,
        categoria: form.categoria,
        tipo_gasto: form.tipo_gasto,
        valor: Number(form.valor) || 0,
        descripcion: form.descripcion || null,
        banco_tarjeta: form.banco_tarjeta || null,
        estado: form.estado || null,
        responsable: form.responsable || null,
        comprobante_dropi: form.comprobante_dropi || null,
        fecha_pago: form.fecha_pago || null,
        soporte_path,
      }

      const r = editId
        ? await supabase.from('gastos').update(fila).eq('id', editId)
        : await supabase.from('gastos').insert(fila)
      if (r.error) throw new Error(r.error.message)

      setModal(false); setArchivo(null); await cargar()
    } catch (err) {
      setError(err.message)
    }
    setGuardando(false)
  }

  const borrar = async (g) => {
    setConfirmar(null); setError('')
    if (g.soporte_path) await supabase.storage.from('soportes').remove([g.soporte_path])
    const { error:e } = await supabase.from('gastos').delete().eq('id', g.id)
    if (e) setError(`No se pudo eliminar: ${e.message}`)
    else await cargar()
  }

  const verSoporte = async (ruta) => {
    const { data, error:e } = await supabase.storage.from('soportes').createSignedUrl(ruta, 60)
    if (e) { setError(`No se pudo abrir el soporte: ${e.message}`); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const th = { textAlign:'left', padding:'10px 12px', fontSize:10, fontWeight:700, color:T.dim,
               textTransform:'uppercase', letterSpacing:'0.6px', whiteSpace:'nowrap',
               background:'rgba(255,255,255,0.03)', borderBottom:`1px solid ${T.border}`, position:'sticky', top:0 }
  const td = { padding:'11px 12px', fontSize:13, color:T.text, borderBottom:`1px solid ${T.borderSub}`, verticalAlign:'middle' }

  return (
    <div style={{ padding:'26px 28px', fontFamily:FONT, color:T.text }}>
      <Estilos />

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap', marginBottom:22 }}>
        <div>
          <div style={{ fontSize:11.5, color:T.dim, marginBottom:5 }}>Administración <span style={{ opacity:.5 }}>/</span> Registro de Gastos</div>
          <h1 style={{ margin:0, fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>Registro de Gastos</h1>
        </div>
        <Btn onClick={abrirNuevo}>+ Nuevo gasto</Btn>
      </div>

      {error && (
        <div style={{ marginBottom:16, padding:'11px 15px', borderRadius:10, background:T.redBg,
                      border:'1px solid rgba(255,77,117,0.25)', color:T.red, fontSize:13 }}>
          {error}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:20 }}>
        <Kpi etiqueta="Total gastos"  valor={fmtCOP(kpis.total)}      sub={`${kpis.n} registros`} />
        <Kpi etiqueta="Pagados"       valor={fmtCOP(kpis.pagados)}    color={T.green} />
        <Kpi etiqueta="Pendientes"    valor={fmtCOP(kpis.pendientes)} color={T.yellow} />
        <Kpi etiqueta="Promedio"      valor={fmtCOP(kpis.n ? kpis.total / kpis.n : 0)} color={T.textS} />
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <input className="ui-in" style={{ ...campo, width:230 }} placeholder="Buscar…"
               value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select className="ui-in" style={{ ...campo, width:190 }} value={fCategoria} onChange={e => setFCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {(listas.CATEGORIAS_GASTO || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="ui-in" style={{ ...campo, width:150 }} value={fEstado} onChange={e => setFEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {(listas.ESTADOS || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="ui-in" style={{ ...campo, width:150 }} value={fMes} onChange={e => setFMes(e.target.value)}>
          <option value="">Todo el año</option>
          {MESES.slice(1).map((m,i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
        </select>
        {(busqueda || fCategoria || fEstado || fMes) && (
          <Btn v="fantasma" s="sm" onClick={() => { setBusqueda(''); setFCategoria(''); setFEstado(''); setFMes('') }}>
            Limpiar filtros
          </Btn>
        )}
      </div>

      <div className="ui-scroll" style={{ background:T.panel, border:`1px solid ${T.border}`,
                                          borderRadius:14, overflow:'auto', maxHeight:'58vh' }}>
        {cargando ? <Cargando /> : filtrados.length === 0 ? (
          <Vacio
            titulo={gastos.length === 0 ? 'Todavía no hay gastos registrados' : 'Ningún gasto coincide con los filtros'}
            sub={gastos.length === 0 ? 'Registra el primero o importa tu histórico desde el Excel.' : null}
            accion={gastos.length === 0 ? <Btn onClick={abrirNuevo}>+ Registrar el primero</Btn> : null}
          />
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Fecha</th><th style={th}>Producto / Servicio</th><th style={th}>Categoría</th>
                <th style={th}>Tipo</th><th style={{ ...th, textAlign:'right' }}>Valor</th>
                <th style={th}>Banco</th><th style={th}>Estado</th><th style={th}>Soporte</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(g => (
                <tr key={g.id} className="ui-fila">
                  <td style={{ ...td, whiteSpace:'nowrap' }}>{fmtFecha(g.fecha)}</td>
                  <td style={td}>
                    {g.producto_servicio || '—'}
                    {g.descripcion && <div style={{ fontSize:11, color:T.dim, marginTop:2 }}>{g.descripcion}</div>}
                  </td>
                  <td style={{ ...td, color:T.textS }}>{g.categoria || '—'}</td>
                  <td style={{ ...td, color:T.textS, fontSize:12 }}>{g.tipo_gasto || '—'}</td>
                  <td style={{ ...td, textAlign:'right', fontFamily:"'DM Mono',monospace", fontWeight:600, whiteSpace:'nowrap' }}>
                    {fmtCOP(g.valor)}
                  </td>
                  <td style={{ ...td, color:T.textS, fontSize:12 }}>{g.banco_tarjeta || '—'}</td>
                  <td style={td}><Etiqueta texto={g.estado} /></td>
                  <td style={td}>
                    {g.soporte_path
                      ? <Btn v="fantasma" s="sm" onClick={() => verSoporte(g.soporte_path)} style={{ color:T.accent }}>Ver</Btn>
                      : <span style={{ color:T.dim, fontSize:12 }}>—</span>}
                  </td>
                  <td style={{ ...td, whiteSpace:'nowrap', textAlign:'right' }}>
                    <Btn v="fantasma" s="sm" onClick={() => abrirEditar(g)}>Editar</Btn>
                    <Btn v="fantasma" s="sm" onClick={() => setConfirmar(g)} style={{ color:T.red }}>Borrar</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Formulario ── */}
      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo={editId ? 'Editar gasto' : 'Nuevo gasto'}>
        <form onSubmit={guardar}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
            <Campo etiqueta="Fecha" obligatorio>
              <input className="ui-in" style={campo} type="date" value={form.fecha}
                     onChange={e => setForm({ ...form, fecha:e.target.value })} />
            </Campo>
            <Campo etiqueta="Valor ($COP)" obligatorio>
              <input className="ui-in" style={campo} type="number" min="0" step="1" placeholder="0"
                     value={form.valor} onChange={e => setForm({ ...form, valor:e.target.value })} />
            </Campo>
            <Campo etiqueta="Producto / Servicio" ancho={2}>
              <input className="ui-in" style={campo} list="lista-productos" placeholder="Elige o escribe uno nuevo"
                     value={form.producto_servicio} onChange={e => setForm({ ...form, producto_servicio:e.target.value })} />
              <datalist id="lista-productos">
                {(listas.PRODUCTOS || []).map(v => <option key={v} value={v} />)}
              </datalist>
            </Campo>
            <Campo etiqueta="Categoría" obligatorio>
              <Select valor={form.categoria} onChange={v => setForm({ ...form, categoria:v })}
                      opciones={listas.CATEGORIAS_GASTO || []} />
            </Campo>
            <Campo etiqueta="Tipo de gasto" obligatorio>
              <Select valor={form.tipo_gasto} onChange={v => setForm({ ...form, tipo_gasto:v })}
                      opciones={listas.TIPOS_GASTO || []} />
            </Campo>
            <Campo etiqueta="Descripción / concepto" ancho={2}>
              <input className="ui-in" style={campo} placeholder="Ej: PAPEL BURBUJA"
                     value={form.descripcion} onChange={e => setForm({ ...form, descripcion:e.target.value })} />
            </Campo>
            <Campo etiqueta="Banco / tarjeta">
              <Select valor={form.banco_tarjeta} onChange={v => setForm({ ...form, banco_tarjeta:v })}
                      opciones={listas.BANCOS || []} />
            </Campo>
            <Campo etiqueta="Estado">
              <Select valor={form.estado} onChange={v => setForm({ ...form, estado:v })}
                      opciones={listas.ESTADOS || []} />
            </Campo>
            <Campo etiqueta="Responsable">
              <input className="ui-in" style={campo} value={form.responsable}
                     onChange={e => setForm({ ...form, responsable:e.target.value })} />
            </Campo>
            <Campo etiqueta="Fecha de pago">
              <input className="ui-in" style={campo} type="date" value={form.fecha_pago || ''}
                     onChange={e => setForm({ ...form, fecha_pago:e.target.value })} />
            </Campo>
            <Campo etiqueta="Comprobante retiro Dropi" ancho={2}>
              <input className="ui-in" style={campo} placeholder="Ej: 0001 Gastos 2026"
                     value={form.comprobante_dropi} onChange={e => setForm({ ...form, comprobante_dropi:e.target.value })} />
            </Campo>
            <Campo etiqueta="Soporte (foto o PDF)" ancho={2}>
              <input className="ui-in" style={{ ...campo, padding:'8px 12px' }} type="file"
                     accept="image/*,application/pdf"
                     onChange={e => setArchivo(e.target.files?.[0] || null)} />
              {form.soporte_path && !archivo && (
                <p style={{ margin:'6px 0 0', fontSize:11.5, color:T.dim }}>
                  Ya tiene un soporte adjunto. Si eliges otro archivo, lo reemplaza.
                </p>
              )}
            </Campo>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:12,
                        borderTop:`1px solid ${T.borderSub}`, paddingTop:18 }}>
            <Btn v="sec" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Registrar gasto'}</Btn>
          </div>
        </form>
      </Modal>

      {/* ── Confirmación de borrado ── */}
      <Modal abierto={!!confirmar} onCerrar={() => setConfirmar(null)} titulo="Eliminar gasto" ancho={430}>
        <p style={{ margin:'0 0 6px', fontSize:14, color:T.textS, lineHeight:1.6 }}>
          Vas a eliminar <b style={{ color:T.text }}>{confirmar?.producto_servicio || 'este gasto'}</b> por{' '}
          <b style={{ color:T.text }}>{fmtCOP(confirmar?.valor)}</b>.
        </p>
        <p style={{ margin:'0 0 20px', fontSize:12.5, color:T.dim }}>
          Esta acción no se puede deshacer{confirmar?.soporte_path ? ' y también borra su soporte adjunto' : ''}.
        </p>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <Btn v="sec" onClick={() => setConfirmar(null)}>Cancelar</Btn>
          <Btn v="peligro" onClick={() => borrar(confirmar)}>Sí, eliminar</Btn>
        </div>
      </Modal>
    </div>
  )
}

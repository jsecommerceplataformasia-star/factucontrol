import { useState, useMemo, useRef, useEffect } from 'react'
import { AuthProvider, useAuth } from './AuthProvider.jsx'
import { modulesForRole, ROLE_LABEL, Icons } from './modules.jsx'

// ─── DoralStore Control · Portal ────────────────────────────────────────────
// Shell de la aplicación: rail de iconos siempre visible a la izquierda +
// menú desplegable por módulo, al estilo MasterShop.
// El módulo Pauta monta la app existente (App.jsx) sin tocar su lógica.
// ─────────────────────────────────────────────────────────────────────────

export const RAIL_W = 56

const T = {
  bg: '#060B14', panel: '#0A1120', panelSolid: '#0D1830',
  border: 'rgba(0,212,255,0.12)', borderSub: 'rgba(255,255,255,0.07)',
  text: '#E8F0FF', textS: '#9AB8D8', dim: '#6080A0',
  accent: '#00D4FF', accentBg: 'rgba(0,212,255,0.10)',
  red: '#FF4D75',
}

const FONT = "'DM Sans', sans-serif"

// ── Estilos globales del shell ─────────────────────────────────────────────
function ShellStyles() {
  return <style>{`
    @keyframes portal-spin{to{transform:rotate(360deg)}}
    @keyframes portal-in{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
    .portal-rail-btn{transition:background .15s,color .15s}
    .portal-item:hover{background:rgba(0,212,255,0.07)}
    .portal-scroll::-webkit-scrollbar{width:4px}
    .portal-scroll::-webkit-scrollbar-thumb{background:rgba(0,212,255,0.2);border-radius:4px}
  `}</style>
}

function Spinner({ label }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', gap:14, alignItems:'center', justifyContent:'center', background:T.bg, fontFamily:FONT }}>
      <ShellStyles />
      <div style={{ width:28, height:28, border:'2px solid rgba(0,212,255,0.15)', borderTopColor:T.accent, borderRadius:'50%', animation:'portal-spin .7s linear infinite' }} />
      {label && <div style={{ color:T.dim, fontSize:13 }}>{label}</div>}
    </div>
  )
}

// ─── Login ─────────────────────────────────────────────────────────────────
function LoginScreen() {
  const { signIn, authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setLocalError(''); setLoading(true)
    try { await signIn(email, password) }
    catch (err) { setLocalError(err.message) }
    setLoading(false)
  }

  const input = {
    width:'100%', padding:'11px 14px', borderRadius:10, border:`1px solid ${T.borderSub}`,
    background:T.panelSolid, color:T.text, fontSize:14, fontFamily:FONT, outline:'none', boxSizing:'border-box',
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:T.bg, padding:20, fontFamily:FONT }}>
      <ShellStyles />
      <form onSubmit={submit} style={{ width:'100%', maxWidth:380, background:T.panel, border:`1px solid ${T.border}`, borderRadius:16, padding:'40px 32px', boxShadow:'0 24px 60px rgba(0,0,0,0.45)' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:44, height:44, borderRadius:13, margin:'0 auto 14px', background:'linear-gradient(135deg,#00D4FF,#0080FF)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px rgba(0,212,255,0.35)' }}>
            <span style={{ color:'#000', fontWeight:900, fontSize:18, fontFamily:"'DM Mono',monospace" }}>D</span>
          </div>
          <div style={{ fontSize:19, fontWeight:800, color:T.text }}>DoralStore Control</div>
          <div style={{ fontSize:13, color:T.dim, marginTop:4 }}>Inicia sesión para continuar</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <input type="email" required autoFocus placeholder="Correo" value={email} onChange={e=>setEmail(e.target.value)} style={input} />
          <input type="password" required placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} style={input} />
        </div>
        {(localError || authError) && <div style={{ marginTop:14, fontSize:13, color:T.red }}>{localError || authError}</div>}
        <button type="submit" disabled={loading} style={{
          marginTop:22, width:'100%', padding:'12px 0', borderRadius:10, border:'none',
          background:T.accent, color:'#00131A', fontWeight:700, fontSize:14,
          cursor:loading?'default':'pointer', opacity:loading?0.7:1, fontFamily:FONT,
        }}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

function SinAcceso({ email, motivo }) {
  const { signOut } = useAuth()
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:T.bg, padding:20, fontFamily:FONT }}>
      <ShellStyles />
      <div style={{ maxWidth:430, textAlign:'center', color:T.text }}>
        <div style={{ fontSize:17, fontWeight:700, marginBottom:10 }}>Sin acceso asignado</div>
        <div style={{ fontSize:13.5, color:T.dim, lineHeight:1.65 }}>
          La cuenta <b style={{ color:T.textS }}>{email}</b> inició sesión correctamente, pero {motivo} Pide a un administrador que te asigne un rol.
        </div>
        <button onClick={signOut} style={{ marginTop:22, padding:'9px 18px', borderRadius:8, border:`1px solid ${T.borderSub}`, background:'transparent', color:T.text, cursor:'pointer', fontSize:13, fontFamily:FONT }}>Cerrar sesión</button>
      </div>
    </div>
  )
}

// ─── Pantalla pendiente de construir ───────────────────────────────────────
function Pendiente({ modulo, item }) {
  const ItemIcon = item.icon
  return (
    <div style={{ padding:'28px 32px', fontFamily:FONT, color:T.text }}>
      <div style={{ fontSize:11.5, color:T.dim, marginBottom:6, letterSpacing:'0.4px' }}>
        {modulo.label} <span style={{ opacity:0.5 }}>/</span> {item.label}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:26 }}>
        <span style={{ color:T.accent, display:'flex' }}><ItemIcon size={24} /></span>
        <h1 style={{ margin:0, fontSize:23, fontWeight:800, letterSpacing:'-0.3px' }}>{item.label}</h1>
      </div>

      <div style={{
        background:'rgba(10,20,45,0.7)', border:`1px solid ${T.border}`, borderRadius:16,
        padding:'26px 28px', maxWidth:640,
      }}>
        <div style={{ display:'inline-block', padding:'4px 11px', borderRadius:20, background:T.accentBg, color:T.accent, fontSize:11, fontWeight:700, letterSpacing:'0.5px', marginBottom:16 }}>
          POR CONSTRUIR
        </div>
        <p style={{ margin:'0 0 20px', fontSize:14.5, lineHeight:1.65, color:T.textS }}>
          {item.descripcion}
        </p>
        <div style={{ borderTop:`1px solid ${T.borderSub}`, paddingTop:16, display:'flex', gap:10, alignItems:'baseline', flexWrap:'wrap' }}>
          <span style={{ fontSize:10.5, fontWeight:700, color:T.dim, letterSpacing:'0.6px' }}>FUENTE DE DATOS</span>
          <span style={{ fontSize:13, color:T.text, fontWeight:600 }}>{item.fuente}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Rail + menú desplegable ───────────────────────────────────────────────
function Rail({ modulos, activeItem, onSelect, perfil, onSignOut }) {
  const [abierto, setAbierto] = useState(null)   // key del módulo con flyout abierto
  const cerrarTimer = useRef(null)

  const abrir = (key) => { clearTimeout(cerrarTimer.current); setAbierto(key) }
  const cerrarConRetraso = () => {
    clearTimeout(cerrarTimer.current)
    cerrarTimer.current = setTimeout(() => setAbierto(null), 160)
  }
  useEffect(() => () => clearTimeout(cerrarTimer.current), [])

  const moduloAbierto = modulos.find(m => m.key === abierto)
  const moduloActivo  = modulos.find(m => m.items.some(i => i.key === activeItem))

  return (
    <div onMouseLeave={cerrarConRetraso}>
      {/* Rail */}
      <nav style={{
        position:'fixed', top:0, left:0, bottom:0, width:RAIL_W, zIndex:900,
        background:'rgba(6,11,20,0.97)', backdropFilter:'blur(20px)',
        borderRight:`1px solid ${T.border}`,
        display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 0',
      }}>
        {/* Logo */}
        <div style={{
          width:34, height:34, borderRadius:10, flexShrink:0, marginBottom:16,
          background:'linear-gradient(135deg,#00D4FF,#0080FF)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 16px rgba(0,212,255,0.35)',
        }}>
          <span style={{ color:'#000', fontWeight:900, fontSize:15, fontFamily:"'DM Mono',monospace" }}>D</span>
        </div>

        {/* Iconos de módulo */}
        <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1 }}>
          {modulos.map(m => {
            const ModIcon = m.icon
            const esActivo = moduloActivo?.key === m.key
            const esAbierto = abierto === m.key
            return (
              <button
                key={m.key}
                className="portal-rail-btn"
                title={m.label}
                onMouseEnter={() => abrir(m.key)}
                onClick={() => setAbierto(a => a === m.key ? null : m.key)}
                style={{
                  width:38, height:38, borderRadius:10, border:'none', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background: esActivo || esAbierto ? T.accentBg : 'transparent',
                  color: esActivo ? T.accent : esAbierto ? T.text : T.dim,
                  position:'relative',
                }}
              >
                <ModIcon size={19} />
                {esActivo && <span style={{ position:'absolute', left:-9, top:11, width:3, height:16, borderRadius:3, background:T.accent }} />}
              </button>
            )
          })}
        </div>

        {/* Usuario */}
        <button
          title={`${perfil?.full_name || ''} — Cerrar sesión`}
          onClick={onSignOut}
          className="portal-rail-btn"
          style={{
            width:38, height:38, borderRadius:10, border:'none', cursor:'pointer',
            background:'transparent', color:T.dim, display:'flex', alignItems:'center', justifyContent:'center',
          }}
        >
          <Icons.salir size={18} />
        </button>
      </nav>

      {/* Flyout */}
      {moduloAbierto && (
        <div
          onMouseEnter={() => abrir(moduloAbierto.key)}
          style={{
            position:'fixed', left:RAIL_W + 8, top:12, zIndex:899, width:270,
            background:'rgba(13,24,48,0.98)', backdropFilter:'blur(24px)',
            border:`1px solid ${T.border}`, borderRadius:16, padding:10,
            boxShadow:'0 24px 60px rgba(0,0,0,0.55)', fontFamily:FONT,
            animation:'portal-in .14s ease-out',
          }}
        >
          {/* Encabezado del módulo */}
          <div style={{
            display:'flex', alignItems:'center', gap:11, padding:'12px 12px 14px',
            borderBottom:`1px solid ${T.borderSub}`, marginBottom:8,
          }}>
            <span style={{ color:T.accent, display:'flex' }}><moduloAbierto.icon size={20} /></span>
            <span style={{ fontSize:15, fontWeight:700, color:T.text }}>{moduloAbierto.label}</span>
          </div>

          {/* Items */}
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {moduloAbierto.items.map(item => {
              const ItemIcon = item.icon
              const activo = item.key === activeItem
              return (
                <button
                  key={item.key}
                  className="portal-item"
                  onClick={() => { onSelect(item.key); setAbierto(null) }}
                  style={{
                    display:'flex', alignItems:'center', gap:11, width:'100%', textAlign:'left',
                    padding:'10px 12px', borderRadius:9, border:'none', cursor:'pointer',
                    background: activo ? T.accentBg : 'transparent',
                    color: activo ? T.accent : T.textS,
                    fontSize:13.5, fontWeight:600, fontFamily:FONT,
                  }}
                >
                  <span style={{ display:'flex', flexShrink:0, opacity: activo ? 1 : 0.75 }}><ItemIcon size={17} /></span>
                  <span style={{ flex:1 }}>{item.label}</span>
                  {!item.render && <span style={{ fontSize:9.5, color:T.dim, letterSpacing:'0.3px' }}>pronto</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shell ─────────────────────────────────────────────────────────────────
function Shell() {
  const { profile, role, signOut } = useAuth()
  const modulos = useMemo(() => modulesForRole(role), [role])
  const primerItem = modulos[0]?.items[0]?.key ?? null
  const [activeItem, setActiveItem] = useState(primerItem)

  const { modulo, item } = useMemo(() => {
    for (const m of modulos) {
      const i = m.items.find(x => x.key === activeItem)
      if (i) return { modulo: m, item: i }
    }
    return { modulo: null, item: null }
  }, [modulos, activeItem])

  const rail = (
    <Rail modulos={modulos} activeItem={activeItem} onSelect={setActiveItem} perfil={profile} onSignOut={signOut} />
  )

  if (!item) {
    return (
      <div style={{ minHeight:'100vh', background:T.bg, fontFamily:FONT }}>
        <ShellStyles />{rail}
        <div style={{ marginLeft:RAIL_W, padding:'40px 32px', color:T.dim }}>
          Tu rol no tiene módulos asignados todavía.
        </div>
      </div>
    )
  }

  // Módulo con layout propio (Pauta): se le pasa el ancho del rail para que
  // corra su barra lateral y su contenido, sin alterar su lógica.
  if (item.fullBleed && item.render) {
    const Comp = item.render
    return <><ShellStyles />{rail}<Comp navOffset={RAIL_W} /></>
  }

  const Comp = item.render
  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:FONT }}>
      <ShellStyles />
      {rail}
      <div className="portal-scroll" style={{ marginLeft:RAIL_W, minHeight:'100vh' }}>
        {Comp ? <Comp /> : <Pendiente modulo={modulo} item={item} />}
      </div>
    </div>
  )
}

function PortalInner() {
  const { loading, session, profileLoading, profile, profileError, role, user } = useAuth()

  if (loading) return <Spinner />
  if (!session) return <LoginScreen />
  if (profileLoading && !profile) return <Spinner label="Cargando tu perfil…" />
  if (profileError) return <SinAcceso email={user?.email} motivo="no se pudo leer su perfil." />
  if (!profile) return <SinAcceso email={user?.email} motivo="no tiene un perfil creado." />
  if (!role || !ROLE_LABEL[role]) return <SinAcceso email={user?.email} motivo="no tiene un rol asignado." />
  return <Shell />
}

export default function Portal() {
  return (
    <AuthProvider>
      <PortalInner />
    </AuthProvider>
  )
}

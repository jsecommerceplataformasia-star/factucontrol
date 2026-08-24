import { useState } from 'react'
import { AuthProvider, useAuth } from './AuthProvider.jsx'
import FactucontrolApp from '../App.jsx'

// ─── Portal Doral ───────────────────────────────────────────────────────────
// Shell de la app: login → carga de perfil/rol → menú de módulos por rol.
// El módulo "Pauta" es Factucontrol (App.jsx) sin modificar — misma sesión
// y mismo cliente Supabase, así que no vuelve a pedir login.
// ─────────────────────────────────────────────────────────────────────────

const T = {
  bg: '#060B14', panel: '#0A1120', border: 'rgba(255,255,255,0.08)',
  text: '#E7ECF5', dim: '#8A93A6', accent: '#00D4FF', accentBg: 'rgba(0,212,255,0.12)',
  red: '#FF4D75',
}

const ROLE_LABEL = { dueno: 'Dueño', admin: 'Administrador', logistica: 'Logística', pauta: 'Pauta' }

// Registro de módulos del Portal. `component: null` = aún no construido.
const MODULES = [
  { key: 'pauta',     label: 'Pauta',          icon: '📊', roles: ['dueno', 'admin', 'pauta'],     component: FactucontrolApp },
  { key: 'logistica', label: 'Logística',      icon: '📦', roles: ['dueno', 'admin', 'logistica'], component: null },
  { key: 'admin',     label: 'Administración', icon: '⚙️', roles: ['dueno', 'admin'],               component: null },
]

function Spinner({ label }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`@keyframes portal-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, border: '2px solid rgba(0,212,255,0.15)', borderTopColor: T.accent, borderRadius: '50%', animation: 'portal-spin .7s linear infinite' }} />
      {label && <div style={{ color: T.dim, fontSize: 13 }}>{label}</div>}
    </div>
  )
}

function LoginScreen() {
  const { signIn, authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setLocalError('')
    setLoading(true)
    try { await signIn(email, password) }
    catch (err) { setLocalError(err.message) }
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10, border: `1px solid ${T.border}`,
    background: '#0D1526', color: T.text, fontSize: 14, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 20, fontFamily: "'DM Sans',sans-serif" }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 16, padding: '40px 32px', boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>DoralStore Control</div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>Inicia sesión para continuar</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="email" required autoFocus placeholder="Correo" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          <input type="password" required placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
        </div>
        {(localError || authError) && (
          <div style={{ marginTop: 14, fontSize: 13, color: T.red }}>{localError || authError}</div>
        )}
        <button type="submit" disabled={loading} style={{
          marginTop: 22, width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
          background: T.accent, color: '#00131A', fontWeight: 700, fontSize: 14, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function NoProfileScreen({ email }) {
  const { signOut } = useAuth()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 20, fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: 'center', color: T.text }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Sin perfil asignado</div>
        <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.6 }}>
          La cuenta <b>{email}</b> inició sesión correctamente, pero no tiene una fila en la tabla <code>profiles</code> (o no se pudo leer por RLS). Pide a un administrador que te asigne un rol.
        </div>
        <button onClick={signOut} style={{ marginTop: 20, padding: '9px 18px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontSize: 13 }}>Cerrar sesión</button>
      </div>
    </div>
  )
}

function ComingSoon({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 320, color: T.dim, fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13 }}>Próximamente</div>
    </div>
  )
}

function Shell() {
  const { user, profile, role, signOut } = useAuth()
  const available = MODULES.filter(m => m.roles.includes(role))
  const [active, setActive] = useState(available[0]?.key ?? null)
  const activeModule = available.find(m => m.key === active)

  // Módulos con componente real se renderizan a pantalla completa (respetan
  // su propio layout, p.ej. Factucontrol/Pauta). Los placeholders van dentro
  // del shell con sidebar.
  if (activeModule?.component) {
    const Comp = activeModule.component
    return (
      <div style={{ position: 'relative', minHeight: '100vh' }}>
        <ModuleSwitcher available={available} active={active} setActive={setActive} user={user} profile={profile} signOut={signOut} floating />
        <Comp />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: T.bg, fontFamily: "'DM Sans',sans-serif" }}>
      <Sidebar available={available} active={active} setActive={setActive} user={user} profile={profile} signOut={signOut} />
      <div style={{ flex: 1, padding: 32 }}>
        {activeModule
          ? <ComingSoon label={activeModule.label} />
          : <ComingSoon label="Sin módulos disponibles para tu rol" />}
      </div>
    </div>
  )
}

function Sidebar({ available, active, setActive, user, profile, signOut }) {
  return (
    <div style={{ width: 240, flexShrink: 0, background: T.panel, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 4 }}>DoralStore Control</div>
      <div style={{ fontSize: 12, color: T.dim, marginBottom: 24 }}>{ROLE_LABEL[profile?.role] || profile?.role}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {available.map(m => (
          <button key={m.key} onClick={() => setActive(m.key)} style={{
            display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '10px 12px', borderRadius: 9,
            border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            background: active === m.key ? T.accentBg : 'transparent', color: active === m.key ? T.accent : T.text,
          }}>
            <span>{m.icon}</span><span>{m.label}</span>
            {!m.component && <span style={{ marginLeft: 'auto', fontSize: 10, color: T.dim }}>pronto</span>}
          </button>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 14 }}>
        <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || user?.email}</div>
        <button onClick={signOut} style={{ marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.red, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Cerrar sesión</button>
      </div>
    </div>
  )
}

// Barra flotante y angosta usada cuando un módulo (p.ej. Pauta/Factucontrol)
// ocupa toda la pantalla con su propio layout, para poder cambiar de módulo
// o cerrar sesión sin invadir su UI.
function ModuleSwitcher({ available, active, setActive, signOut, floating }) {
  if (available.length <= 1) return null
  return (
    <div style={{
      position: floating ? 'fixed' : 'static', top: floating ? 12 : undefined, right: floating ? 12 : undefined, zIndex: 1000,
      display: 'flex', gap: 6, background: 'rgba(10,17,32,0.9)', backdropFilter: 'blur(8px)', border: `1px solid ${T.border}`,
      borderRadius: 10, padding: 6, fontFamily: "'DM Sans',sans-serif",
    }}>
      {available.map(m => (
        <button key={m.key} onClick={() => setActive(m.key)} title={m.label} style={{
          padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          background: active === m.key ? T.accentBg : 'transparent', color: active === m.key ? T.accent : T.dim,
        }}>{m.icon}</button>
      ))}
      <button onClick={signOut} title="Cerrar sesión" style={{ padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, background: 'transparent', color: T.red }}>⏻</button>
    </div>
  )
}

function PortalInner() {
  const { loading, session, profileLoading, profile, profileError, user } = useAuth()

  if (loading) return <Spinner />
  if (!session) return <LoginScreen />
  if (profileLoading && !profile) return <Spinner label="Cargando tu perfil…" />
  if (!profile || profileError) return <NoProfileScreen email={user?.email} />
  return <Shell />
}

export default function Portal() {
  return (
    <AuthProvider>
      <PortalInner />
    </AuthProvider>
  )
}

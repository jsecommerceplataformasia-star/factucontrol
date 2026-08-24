import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.js'

// ─── Portal Doral · AuthProvider ───────────────────────────────────────────
// Maneja sesión de Supabase + perfil (tabla `profiles`: id, full_name, role).
// Roles válidos hoy en la BD: 'dueno' | 'admin' | 'logistica' | 'pauta'
// ─────────────────────────────────────────────────────────────────────────

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)         // resolviendo sesión inicial
  const [profileLoading, setProfileLoading] = useState(false) // trayendo profiles
  const [profileError, setProfileError] = useState(null)
  const [authError, setAuthError] = useState('')

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return }
    setProfileLoading(true)
    setProfileError(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      setProfileError(error.message)
      setProfile(null)
    } else {
      setProfile(data) // null si el usuario no tiene fila en profiles todavía
    }
    setProfileLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      setSession(session)
      setLoading(false)
      if (session?.user?.id) loadProfile(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user?.id) loadProfile(s.user.id)
      else setProfile(null)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setAuthError(error.message); throw error }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,           // true mientras se resuelve la sesión inicial
    profileLoading,    // true mientras se trae la fila de profiles
    profileError,
    authError,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

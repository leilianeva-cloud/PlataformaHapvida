import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, logAudit, logSession } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Buscar perfil do usuário logado
  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    return data
  }

  useEffect(() => {
    // Sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    // Escutar mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          const prof = await fetchProfile(session.user.id)
          if (event === 'SIGNED_IN') {
            logAudit({ action: 'LOGIN', entity: 'user', entityId: session.user.id })
            logSession({ action: 'OPEN_APP', detail: { email: session.user.email } })
          }
        } else {
          setProfile(null)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await logAudit({ action: 'LOGOUT', entity: 'user' })
    await logSession({ action: 'CLOSE_APP' })
    await supabase.auth.signOut()
  }

  async function updateProfile(updates) {
    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) throw error
    await fetchProfile(user.id)
    await logAudit({ action: 'UPDATE_PROFILE', entity: 'user', entityId: user.id, detail: updates })
  }

  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    await updateProfile({ must_change_password: false })
    await logAudit({ action: 'CHANGE_PASSWORD', entity: 'user', entityId: user.id })
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signOut,
      updateProfile, updatePassword,
      isAdmin: profile?.is_admin === true,
      isActive: profile?.is_active !== false,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

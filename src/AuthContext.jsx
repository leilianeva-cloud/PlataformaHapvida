import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, logAudit, logSession } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Buscar perfil do usuário logado.
  // Agora tratamos o campo `error` explicitamente: quando ele vinha
  // ignorado, uma falha de RLS/consulta zerava o perfil em silêncio
  // (foi o que já escondeu o sumiço do menu admin no passado).
  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      console.warn('[fetchProfile]', error.message)
      setProfile(null)
      return { data: null, error }
    }
    setProfile(data)
    return { data, error: null }
  }

  // "Porteiro": decide se um perfil pode permanecer logado.
  // Pendente (aguardando aprovação) ou inativo (desativado) → derruba a sessão.
  // Retorna o motivo do bloqueio, ou null se o acesso está liberado.
  function motivoBloqueio(prof) {
    if (!prof) return null
    if (prof.approval_status === 'pending') return 'PENDING_APPROVAL'
    if (prof.is_active === false)           return 'INACTIVE'
    return null
  }

  useEffect(() => {
    // Sessão inicial (inclui sessão restaurada de dias anteriores).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: prof } = await fetchProfile(session.user.id)
        if (motivoBloqueio(prof)) {
          await supabase.auth.signOut()
          setUser(null)
          setProfile(null)
        } else {
          setUser(session.user)
        }
      }
      setLoading(false)
    })

    // Escutar mudanças de auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const { data: prof } = await fetchProfile(session.user.id)
          // O gate principal fica no signIn (mensagem clara). Aqui só
          // garantimos que o estado não fique com um usuário bloqueado.
          if (motivoBloqueio(prof)) {
            setUser(null)
            setProfile(null)
            return
          }
          setUser(session.user)
          if (event === 'SIGNED_IN') {
            logAudit({ action: 'LOGIN', entity: 'user', entityId: session.user.id })
            logSession({ action: 'OPEN_APP', detail: { email: session.user.email } })
          }
        } else {
          setUser(null)
          setProfile(null)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    // Confere o perfil logo após autenticar. Se estiver bloqueado,
    // desloga e lança um erro com código, pra tela de login explicar.
    const { data: prof } = await fetchProfile(data.user.id)
    const motivo = motivoBloqueio(prof)
    if (motivo) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      const err = new Error(motivo)
      err.code = motivo
      throw err
    }
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

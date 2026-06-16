import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function ChangePasswordModal() {
  const { updatePassword } = useAuth()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return }
    if (password !== confirm)  { setError('As senhas não coincidem.'); return }
    setLoading(true)
    try {
      await updatePassword(password)
    } catch (err) {
      setError('Erro ao atualizar senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#003B82', marginBottom: 8, fontFamily: "'Fraunces', serif" }}>
          Defina sua senha
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
          É necessário criar uma nova senha antes de continuar.
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="password" placeholder="Nova senha (mín. 8 caracteres)" value={password}
            onChange={e => setPassword(e.target.value)} required style={inp} />
          <input type="password" placeholder="Confirme a nova senha" value={confirm}
            onChange={e => setConfirm(e.target.value)} required style={inp} />
          {error && <div style={{ color: '#DC2626', fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={loading} style={btn}>
            {loading ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}

const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }
const card    = { background:'#fff', borderRadius:16, padding:'36px 32px', width:'100%', maxWidth:380, boxShadow:'0 8px 40px rgba(0,0,0,.2)' }
const inp     = { border:'1.5px solid #CBD5E1', borderRadius:8, padding:'10px 12px', fontSize:14, width:'100%' }
const btn     = { background:'#003B82', color:'#fff', border:'none', borderRadius:8, padding:'12px 0', fontSize:15, fontWeight:700, cursor:'pointer', width:'100%', marginTop:4 }

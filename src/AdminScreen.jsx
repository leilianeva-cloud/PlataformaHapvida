import { useState, useEffect } from 'react'
import { supabase, logAudit } from './supabaseClient'
import { useAuth } from './AuthContext'
import { Plus, Trash2, Edit2, RefreshCw, X, Check, Shield, User, ChevronLeft } from 'lucide-react'

// ── Gera senha aleatória ──────────────────────────────────────────
function gerarSenha(len = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Modal: criar/editar usuário ───────────────────────────────────
function UserModal({ user: editUser, onClose, onSave }) {
  const [name, setName]       = useState(editUser?.name || '')
  const [email, setEmail]     = useState(editUser?.email || '')
  const [isAdmin, setIsAdmin] = useState(editUser?.is_admin || false)
  const [senhaGerada, setSenhaGerada] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const isEdit = !!editUser

  async function handleSave() {
    setError('')
    if (!name.trim())  { setError('Nome obrigatório.'); return }
    if (!isEdit && !email.trim()) { setError('Email obrigatório.'); return }
    setLoading(true)
    try {
      if (isEdit) {
        // Atualizar perfil existente
        const { error: e } = await supabase.from('profiles')
          .update({ name, is_admin: isAdmin, updated_at: new Date().toISOString() })
          .eq('id', editUser.id)
        if (e) throw e
        await logAudit({ action: 'UPDATE_USER', entity: 'user', entityId: editUser.id, detail: { name, is_admin: isAdmin } })
      } else {
        // Criar via Supabase Admin API (service_role) — aqui usamos signUp
        const senha = gerarSenha()
        setSenhaGerada(senha)
        const { data, error: e } = await supabase.auth.signUp({ email, password: senha, options: { data: { name } } })
        if (e) throw e
        // Marcar must_change_password e is_admin
        if (data?.user) {
          await supabase.from('profiles').update({
            name, is_admin: isAdmin, must_change_password: true
          }).eq('id', data.user.id)
          await logAudit({ action: 'CREATE_USER', entity: 'user', entityId: data.user.id, detail: { email, name, is_admin: isAdmin } })
        }
        setLoading(false)
        return // manter modal aberto para mostrar senha
      }
      onSave()
      onClose()
    } catch (err) {
      setError(err.message || 'Erro ao salvar.')
    }
    setLoading(false)
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={modalTitle}>{isEdit ? 'Editar usuário' : 'Novo usuário'}</div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        {senhaGerada ? (
          <div>
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:16, marginBottom:16 }}>
              <div style={{ fontWeight:700, color:'#166534', marginBottom:6 }}>✓ Usuário criado com sucesso!</div>
              <div style={{ fontSize:13, color:'#334155', marginBottom:8 }}>Compartilhe as credenciais com o usuário:</div>
              <div style={{ background:'#fff', border:'1px solid #CBD5E1', borderRadius:8, padding:'10px 14px', fontFamily:'monospace', fontSize:14 }}>
                <div><strong>Email:</strong> {email}</div>
                <div><strong>Senha temporária:</strong> {senhaGerada}</div>
              </div>
              <div style={{ fontSize:12, color:'#64748b', marginTop:8 }}>O usuário deverá trocar a senha no primeiro acesso.</div>
            </div>
            <button onClick={() => { onSave(); onClose(); }} style={btnPrimary}>Fechar</button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={lbl}>Nome</label>
              <input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder="Nome completo" />
            </div>
            {!isEdit && (
              <div>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@hapvida.com.br" />
              </div>
            )}
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:14, color:'#334155' }}>
              <input type="checkbox" checked={isAdmin} onChange={e=>setIsAdmin(e.target.checked)} />
              <Shield size={14} color="#7030A0" /> Administrador
            </label>
            {error && <div style={{ color:'#DC2626', fontSize:13 }}>{error}</div>}
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <button onClick={onClose} style={btnSecondary}>Cancelar</button>
              <button onClick={handleSave} disabled={loading} style={btnPrimary}>
                {loading ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar usuário'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal: resetar senha ──────────────────────────────────────────
function ResetPasswordModal({ user: targetUser, onClose, onDone }) {
  const [senhaGerada, setSenhaGerada] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    setLoading(true)
    setError('')
    try {
      // Enviar email de reset via Supabase
      const { error: e } = await supabase.auth.resetPasswordForEmail(targetUser.email, {
        redirectTo: window.location.origin
      })
      if (e) throw e
      await logAudit({ action: 'RESET_PASSWORD', entity: 'user', entityId: targetUser.id, detail: { email: targetUser.email } })
      await supabase.from('profiles').update({ must_change_password: true }).eq('id', targetUser.id)
      setSenhaGerada('email_enviado')
    } catch (err) {
      setError(err.message || 'Erro ao resetar senha.')
    }
    setLoading(false)
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={modalTitle}>Resetar senha</div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>
        {senhaGerada === 'email_enviado' ? (
          <div>
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:16, marginBottom:16 }}>
              <div style={{ fontWeight:700, color:'#166534', marginBottom:6 }}>✓ Email de reset enviado!</div>
              <div style={{ fontSize:13, color:'#334155' }}>O usuário <strong>{targetUser.email}</strong> receberá um email para criar uma nova senha.</div>
            </div>
            <button onClick={() => { onDone(); onClose(); }} style={btnPrimary}>Fechar</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize:14, color:'#334155', marginBottom:20 }}>
              Será enviado um email de redefinição de senha para <strong>{targetUser.email}</strong>.
            </div>
            {error && <div style={{ color:'#DC2626', fontSize:13, marginBottom:12 }}>{error}</div>}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={onClose} style={btnSecondary}>Cancelar</button>
              <button onClick={handleReset} disabled={loading} style={btnPrimary}>
                {loading ? 'Enviando…' : 'Enviar email de reset'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tela principal de admin ───────────────────────────────────────
export default function AdminScreen({ onBack }) {
  const { profile: myProfile } = useAuth()
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [modalUser, setModalUser]   = useState(null)   // null=fechado, false=novo, obj=editar
  const [resetUser, setResetUser]   = useState(null)
  const [search, setSearch]         = useState('')

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('name')
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  async function toggleActive(user) {
    const novo = !user.is_active
    await supabase.from('profiles').update({ is_active: novo }).eq('id', user.id)
    await logAudit({ action: novo ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', entity:'user', entityId:user.id, detail:{ email:user.email } })
    loadUsers()
  }

  async function deleteUser(user) {
    if (!confirm(`Excluir ${user.name}? Esta ação não pode ser desfeita.`)) return
    await supabase.from('profiles').delete().eq('id', user.id)
    await logAudit({ action:'DELETE_USER', entity:'user', entityId:user.id, detail:{ email:user.email } })
    loadUsers()
  }

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ minHeight:'100vh', background:'#F1F5F9' }}>
      {/* Header */}
      <div style={{ background:'#003B82', color:'#fff', padding:'14px 28px', display:'flex', alignItems:'center', gap:14 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:14 }}>
          <ChevronLeft size={18} /> Voltar
        </button>
        <div style={{ width:1, height:20, background:'rgba(255,255,255,.3)' }} />
        <Shield size={18} />
        <span style={{ fontWeight:700, fontSize:16 }}>Gestão de Usuários</span>
      </div>

      <div style={{ maxWidth:900, margin:'32px auto', padding:'0 20px' }}>
        {/* Barra de ações */}
        <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center' }}>
          <input
            placeholder="Buscar por nome ou email…"
            value={search} onChange={e=>setSearch(e.target.value)}
            style={{ flex:1, border:'1.5px solid #CBD5E1', borderRadius:8, padding:'9px 14px', fontSize:14 }}
          />
          <button onClick={() => setModalUser(false)}
            style={{ display:'flex', alignItems:'center', gap:6, background:'#003B82', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontWeight:700, cursor:'pointer', fontSize:14, whiteSpace:'nowrap' }}>
            <Plus size={15} /> Novo usuário
          </button>
        </div>

        {/* Tabela */}
        <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F8FAFC' }}>
                {['Nome','Email','Perfil','Status','Ações'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', borderBottom:'1px solid #E2E8F0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Nenhum usuário encontrado.</td></tr>
              ) : filtered.map((u, i) => (
                <tr key={u.id} style={{ borderBottom:'1px solid #F1F5F9', background: i%2===0?'#fff':'#FAFBFC' }}>
                  <td style={{ padding:'12px 16px', fontSize:14, fontWeight:600, color:'#1e293b' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {u.is_admin ? <Shield size={14} color="#7030A0" /> : <User size={14} color="#2F5597" />}
                      </div>
                      {u.name}
                      {u.id === myProfile?.id && <span style={{ fontSize:10, background:'#EFF6FF', color:'#2F5597', borderRadius:4, padding:'1px 6px', fontWeight:700 }}>você</span>}
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13, color:'#64748b' }}>{u.email}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:12, fontWeight:700, background: u.is_admin?'#F3E8FF':'#EFF6FF', color: u.is_admin?'#7030A0':'#2F5597', borderRadius:6, padding:'3px 10px' }}>
                      {u.is_admin ? 'Admin' : 'Usuário'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:12, fontWeight:700, background: u.is_active?'#F0FDF4':'#FEF2F2', color: u.is_active?'#166534':'#DC2626', borderRadius:6, padding:'3px 10px' }}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button title="Editar" onClick={() => setModalUser(u)} style={actionBtn}><Edit2 size={14} /></button>
                      <button title={u.is_active?'Desativar':'Ativar'} onClick={() => toggleActive(u)} style={{ ...actionBtn, color: u.is_active?'#DC2626':'#166534' }}>
                        {u.is_active ? <X size={14}/> : <Check size={14}/>}
                      </button>
                      <button title="Resetar senha" onClick={() => setResetUser(u)} style={actionBtn}><RefreshCw size={14} /></button>
                      {u.id !== myProfile?.id && (
                        <button title="Excluir" onClick={() => deleteUser(u)} style={{ ...actionBtn, color:'#DC2626' }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop:12, fontSize:12, color:'#94a3b8' }}>
          {filtered.length} usuário{filtered.length!==1?'s':''} · {users.filter(u=>u.is_active).length} ativo{users.filter(u=>u.is_active).length!==1?'s':''}
        </div>
      </div>

      {/* Modais */}
      {modalUser !== null && (
        <UserModal
          user={modalUser || null}
          onClose={() => setModalUser(null)}
          onSave={loadUsers}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={loadUsers}
        />
      )}
    </div>
  )
}

// ── Estilos compartilhados ────────────────────────────────────────
const overlay   = { position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16 }
const modal     = { background:'#fff', borderRadius:16, padding:'32px 28px', width:'100%', maxWidth:460, boxShadow:'0 8px 40px rgba(0,0,0,.18)' }
const modalTitle= { fontSize:18, fontWeight:700, color:'#003B82', fontFamily:"'Fraunces',serif" }
const lbl       = { fontSize:13, fontWeight:600, color:'#334155', display:'block', marginBottom:5 }
const inp       = { border:'1.5px solid #CBD5E1', borderRadius:8, padding:'9px 12px', fontSize:14, width:'100%' }
const btnPrimary= { flex:1, background:'#003B82', color:'#fff', border:'none', borderRadius:8, padding:'10px 0', fontWeight:700, cursor:'pointer', fontSize:14 }
const btnSecondary = { flex:1, background:'#F1F5F9', color:'#334155', border:'1px solid #CBD5E1', borderRadius:8, padding:'10px 0', fontWeight:600, cursor:'pointer', fontSize:14 }
const iconBtn   = { background:'none', border:'none', cursor:'pointer', color:'#64748b', display:'flex', alignItems:'center' }
const actionBtn = { background:'#F1F5F9', border:'1px solid #E2E8F0', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#334155', display:'flex', alignItems:'center' }

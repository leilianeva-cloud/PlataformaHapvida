import { useState, useEffect, useMemo, Component } from 'react'
import { supabase, logAudit } from './supabaseClient'
import {
  ChevronLeft, LayoutGrid, Users, NotebookPen, Plus, Pencil, Trash2,
  Share2, X, Calendar, Tag as TagIcon, Flag, Check, Circle, Inbox,
  CircleDashed, Timer, CheckCircle2, Sparkles, Loader2, Link2,
} from 'lucide-react'

// ── Constantes de domínio ──────────────────────────────────────────
const COLS = [
  { key:'a_fazer', label:'A Fazer', color:'#94A3B8', Icon:CircleDashed },
  { key:'fazendo', label:'Fazendo', color:'#0070C0', Icon:Timer },
  { key:'feito',   label:'Feito',   color:'#00B050', Icon:CheckCircle2 },
]

const PRIOS = {
  alta:  { label:'Alta',  color:'#C00000' },
  media: { label:'Média', color:'#FDB713' },
  baixa: { label:'Baixa', color:'#00B050' },
}

// ── Helpers de data ─────────────────────────────────────────────────
const hojeZero = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
const parseDate = (s) => { if (!s) return null; const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d) }
const diasRestantes = (s) => { const dt = parseDate(s); if (!dt) return null; return Math.round((dt - hojeZero()) / 86400000) }
const fmtDiaMes = (s) => { const dt = parseDate(s); if (!dt) return ''; return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) }
const hojeISO = () => new Date().toISOString().slice(0,10)

// ════════════════════════════════════════════════════════════════════
//  EXPORT com Error Boundary (CAPTURADOR TEMPORÁRIO DE ERRO)
//  → mostra o erro na tela em vez de deixar branco.
//  Depois de descobrirmos a causa, este bloco pode ser removido e o
//  KanbanInner volta a ser o export default.
// ════════════════════════════════════════════════════════════════════
export default function KanbanScreen(props) {
  return (
    <ErrorCatcher>
      <KanbanInner {...props} />
    </ErrorCatcher>
  )
}

class ErrorCatcher extends Component {
  constructor(props) { super(props); this.state = { err: null, info: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { this.setState({ info }); console.error('KanbanScreen erro:', err, info) }
  render() {
    if (this.state.err) {
      const e = this.state.err
      return (
        <div style={{ minHeight:'100vh', background:'#FEF2F2', padding:24, fontFamily:'monospace' }}>
          <div style={{ maxWidth:800, margin:'0 auto', background:'#fff', border:'2px solid #DC2626', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#DC2626', marginBottom:12, fontFamily:'sans-serif' }}>
              ⚠️ Erro capturado na tela Kanban
            </div>
            <div style={{ fontSize:13, color:'#7F1D1D', marginBottom:8 }}>
              <b>Mensagem:</b> {e?.message || String(e)}
            </div>
            {e?.stack && (
              <pre style={{ fontSize:11, color:'#334155', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:12, overflow:'auto', maxHeight:260, whiteSpace:'pre-wrap' }}>
                {e.stack}
              </pre>
            )}
            {this.state.info?.componentStack && (
              <pre style={{ fontSize:11, color:'#64748b', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:12, overflow:'auto', maxHeight:200, whiteSpace:'pre-wrap', marginTop:10 }}>
                {this.state.info.componentStack}
              </pre>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ════════════════════════════════════════════════════════════════════
//  TELA PRINCIPAL (interna)
// ════════════════════════════════════════════════════════════════════
function KanbanInner({ onBack }) {
  const [me, setMe]             = useState(null)   // { id, email, nome }
  const [tasks, setTasks]       = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [aba, setAba]           = useState('meu')  // 'meu' | 'compartilhado' | 'reunioes'

  const [dragId, setDragId]         = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [taskModal, setTaskModal]   = useState(null)  // { task, col }
  const [meetingModal, setMeetingModal] = useState(false)
  const [gerandoId, setGerandoId]   = useState(null)
  const [erroId, setErroId]         = useState(null)
  const [suggestions, setSuggestions] = useState(null)
  const [toast, setToast]           = useState(null)
  const [loadErr, setLoadErr]       = useState(null)  // DEBUG: erro da carga inicial

  const readOnly = aba === 'compartilhado'

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600) }

  // ── Carga inicial ──
  useEffect(() => {
    (async () => {
      try {
        const { data:{ user }, error: uErr } = await supabase.auth.getUser()
        if (uErr) throw new Error('auth.getUser: ' + uErr.message)
        if (!user) { setLoading(false); return }
        let nome = user.email
        const { data: prof, error: pErr } = await supabase.from('profiles').select('name').eq('id', user.id).single()
        if (pErr) throw new Error('profiles.select: ' + pErr.message)
        if (prof?.name) nome = prof.name
        setMe({ id:user.id, email:user.email, nome })
        await Promise.all([carregarTasks(user.id), carregarMeetings(user.id)])
      } catch (e) {
        setLoadErr(e?.message || String(e))
        console.error('Kanban carga inicial:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function carregarTasks(uid) {
    // RLS entrega: minhas tasks + qualquer task com is_shared = true
    const { data, error } = await supabase.from('kanban_tasks')
      .select('*')
      .order('position', { ascending:true })
      .order('created_at', { ascending:true })
    if (error) throw new Error('kanban_tasks.select: ' + error.message)
    setTasks(data || [])
  }

  async function carregarMeetings(uid) {
    const { data, error } = await supabase.from('kanban_meetings')
      .select('*')
      .order('created_at', { ascending:false })
    if (error) throw new Error('kanban_meetings.select: ' + error.message)
    setMeetings(data || [])
  }

  // ── Tasks visíveis por aba ──
  const visiveis = useMemo(() => {
    if (!me) return []
    return aba === 'meu'
      ? tasks.filter(t => t.user_id === me.id)
      : tasks.filter(t => t.is_shared)
  }, [tasks, aba, me])

  const porColuna = (key) => visiveis.filter(t => t.status === key)

  // ── CRUD de task ──
  async function salvarTask(dados) {
    if (dados.id) {
      const { data } = await supabase.from('kanban_tasks').update({
        title:dados.title, description:dados.description, due_date:dados.due_date || null,
        priority:dados.priority, tags:dados.tags, status:dados.status, updated_at:new Date().toISOString(),
      }).eq('id', dados.id).select().single()
      if (data) setTasks(ts => ts.map(t => t.id === data.id ? data : t))
      logAudit({ action:'UPDATE_TASK', entity:'kanban_task', entityId:dados.id, detail:{ title:dados.title } })
    } else {
      const { data } = await supabase.from('kanban_tasks').insert({
        user_id:me.id, user_email:me.email, user_nome:me.nome,
        title:dados.title, description:dados.description, due_date:dados.due_date || null,
        priority:dados.priority, tags:dados.tags, status:dados.status, is_shared:false,
      }).select().single()
      if (data) setTasks(ts => [...ts, data])
      logAudit({ action:'CREATE_TASK', entity:'kanban_task', entityId:data?.id, detail:{ title:dados.title } })
    }
    setTaskModal(null)
  }

  async function excluirTask(id) {
    await supabase.from('kanban_tasks').delete().eq('id', id)
    setTasks(ts => ts.filter(t => t.id !== id))
    logAudit({ action:'DELETE_TASK', entity:'kanban_task', entityId:id })
  }

  async function toggleShare(t) {
    const novo = !t.is_shared
    const { data } = await supabase.from('kanban_tasks')
      .update({ is_shared:novo, updated_at:new Date().toISOString() })
      .eq('id', t.id).select().single()
    if (data) setTasks(ts => ts.map(x => x.id === data.id ? data : x))
    logAudit({ action:novo ? 'SHARE_TASK' : 'UNSHARE_TASK', entity:'kanban_task', entityId:t.id })
  }

  async function moverPara(id, status) {
    const alvo = tasks.find(t => t.id === id)
    if (!alvo || alvo.status === status) return
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t))  // otimista
    const { error } = await supabase.from('kanban_tasks')
      .update({ status, updated_at:new Date().toISOString() }).eq('id', id)
    if (error) { setTasks(ts => ts.map(t => t.id === id ? { ...t, status:alvo.status } : t)); return }
    logAudit({ action:'MOVE_TASK', entity:'kanban_task', entityId:id, detail:{ de:alvo.status, para:status } })
  }

  const onDrop = (colKey) => {
    if (dragId && !readOnly) moverPara(dragId, colKey)
    setDragId(null); setDragOverCol(null)
  }

  // ── Reuniões ──
  async function salvarReuniao(dados) {
    const { data } = await supabase.from('kanban_meetings').insert({
      user_id:me.id, user_email:me.email,
      title:dados.title, meeting_date:dados.date, notes:dados.notes, tasks_geradas:false,
    }).select().single()
    if (data) setMeetings(ms => [data, ...ms])
    logAudit({ action:'CREATE_MEETING_NOTE', entity:'kanban_meeting', entityId:data?.id, detail:{ title:dados.title } })
    setMeetingModal(false)
  }

  async function excluirReuniao(id) {
    await supabase.from('kanban_meetings').delete().eq('id', id)
    setMeetings(ms => ms.filter(m => m.id !== id))
    logAudit({ action:'DELETE_MEETING_NOTE', entity:'kanban_meeting', entityId:id })
  }

  async function gerarTasks(m) {
    setGerandoId(m.id); setErroId(null)
    try {
      // Chama a função serverless da Vercel (a chave da API fica protegida lá)
      const resp = await fetch('/api/gerar-tasks', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ title:m.title, date:m.meeting_date, notes:m.notes }),
      })
      if (!resp.ok) throw new Error('falha')
      const parsed = await resp.json()
      const items = (parsed.tasks || []).map(t => ({
        id:Math.random().toString(36).slice(2,9),
        title:t.title,
        priority:PRIOS[t.priority] ? t.priority : 'media',
        selected:true,
      }))
      setSuggestions({ meetingId:m.id, meetingTitle:m.title, items })
      logAudit({ action:'GENERATE_TASKS_AI', entity:'kanban_meeting', entityId:m.id, detail:{ qtd:items.length } })
    } catch {
      setErroId(m.id)
    } finally {
      setGerandoId(null)
    }
  }

  async function confirmarSugestoes(meetingId, meetingTitle, itens) {
    const linhas = itens.map(it => ({
      user_id:me.id, user_email:me.email, user_nome:me.nome,
      title:it.title, description:'', due_date:null, priority:it.priority,
      tags:[], status:'a_fazer', is_shared:false,
      origin_meeting_id:meetingId, origin_meeting_title:meetingTitle,
    }))
    const { data } = await supabase.from('kanban_tasks').insert(linhas).select()
    if (data) setTasks(ts => [...ts, ...data])
    await supabase.from('kanban_meetings').update({ tasks_geradas:true }).eq('id', meetingId)
    setMeetings(ms => ms.map(m => m.id === meetingId ? { ...m, tasks_geradas:true } : m))
    setSuggestions(null)
    notify(`${itens.length} task${itens.length===1?'':'s'} criada${itens.length===1?'':'s'} a partir da reunião`)
  }

  // ── Render ──
  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, color:'#64748b' }}>
          <Loader2 size={18} className="spin" /> Carregando quadro…
        </div>
      </div>
    )
  }

  // DEBUG: se a carga inicial falhou, mostra o erro na tela (em vez de branco)
  if (loadErr) {
    return (
      <div style={{ minHeight:'100vh', background:'#FEF2F2', padding:24, fontFamily:'sans-serif' }}>
        <div style={{ maxWidth:800, margin:'0 auto', background:'#fff', border:'2px solid #DC2626', borderRadius:12, padding:20 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'#DC2626', marginBottom:12 }}>⚠️ Erro ao carregar dados do Kanban</div>
          <pre style={{ fontSize:13, color:'#7F1D1D', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:12, whiteSpace:'pre-wrap' }}>{loadErr}</pre>
          <button onClick={onBack} style={{ marginTop:16, background:'#003B82', color:'#fff', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontWeight:600 }}>Voltar</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F1F5F9' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>

      {/* Header */}
      <div style={{ background:'linear-gradient(90deg,#001b4d 0%,#003B82 60%,#003d8f 100%)', color:'#fff', padding:'14px 28px', display:'flex', alignItems:'center', gap:14, borderBottom:'3px solid #FF7900' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:14 }}>
          <ChevronLeft size={18} /> Voltar
        </button>
        <div style={{ width:1, height:20, background:'rgba(255,255,255,.3)' }} />
        <LayoutGrid size={18} />
        <div>
          <div style={{ fontWeight:700, fontSize:16, lineHeight:1.1 }}>Tarefas &amp; Reuniões</div>
          <div style={{ fontSize:11, color:'#c7d7ef' }}>Atividades previstas da Governança TI</div>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display:'flex', gap:2, padding:'0 28px', background:'#fff', borderBottom:'1px solid #E2E8F0' }}>
        <TabBtn ativo={aba==='meu'} onClick={()=>setAba('meu')} Icon={LayoutGrid} label="Meu Quadro" />
        <TabBtn ativo={aba==='compartilhado'} onClick={()=>setAba('compartilhado')} Icon={Users} label="Compartilhado" badge={tasks.filter(t=>t.is_shared).length} />
        <TabBtn ativo={aba==='reunioes'} onClick={()=>setAba('reunioes')} Icon={NotebookPen} label="Reuniões" />
      </div>

      {aba==='compartilhado' && (
        <div style={{ padding:'8px 28px', fontSize:12, color:'#64748b', background:'#F8FAFC', borderBottom:'1px solid #E2E8F0', display:'flex', alignItems:'center', gap:8 }}>
          <Users size={13} /> Visão da equipe — somente leitura. Cada card é editado apenas pelo dono.
        </div>
      )}

      {/* Conteúdo */}
      {aba === 'reunioes' ? (
        <MeetingsTab
          meetings={meetings} onNova={()=>setMeetingModal(true)} onExcluir={excluirReuniao}
          onGerar={gerarTasks} gerandoId={gerandoId} erroId={erroId}
        />
      ) : (
        <div style={{ padding:24, display:'flex', gap:16, alignItems:'flex-start', overflowX:'auto' }}>
          {COLS.map(col => {
            const cards = porColuna(col.key)
            const over = dragOverCol === col.key
            return (
              <div key={col.key}
                onDragOver={(e)=>{ if(!readOnly){ e.preventDefault(); setDragOverCol(col.key) } }}
                onDragLeave={()=>setDragOverCol(null)}
                onDrop={()=>onDrop(col.key)}
                style={{ flex:'1 1 0', minWidth:280, background:over?'#E7EEF7':'#fff', border:`1px solid ${over?'#003B82':'#E2E8F0'}`, borderRadius:12, padding:12 }}>
                {/* Cabeçalho coluna */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, padding:'0 4px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <col.Icon size={14} color={col.color} />
                    <span style={{ fontSize:14, fontWeight:700, color:'#334155' }}>{col.label}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'#64748b', background:'#F1F5F9', borderRadius:99, padding:'0 7px' }}>{cards.length}</span>
                  </div>
                  {!readOnly && (
                    <button onClick={()=>setTaskModal({ task:null, col:col.key })} title="Nova task"
                      style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:6, display:'flex' }}>
                      <Plus size={16} color="#003B82" />
                    </button>
                  )}
                </div>
                {/* Cards */}
                <div style={{ display:'flex', flexDirection:'column', gap:8, minHeight:60 }}>
                  {cards.map(t => (
                    <Card key={t.id} t={t} readOnly={readOnly}
                      onDragStart={()=>setDragId(t.id)}
                      onEdit={()=>setTaskModal({ task:t, col:t.status })}
                      onDelete={()=>excluirTask(t.id)}
                      onShare={()=>toggleShare(t)} />
                  ))}
                  {cards.length === 0 && (
                    <div style={{ fontSize:12, color:'#94a3b8', padding:'24px 0', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <Inbox size={18} style={{ opacity:.5 }} />
                      {readOnly ? 'Nada compartilhado aqui' : 'Adicione a primeira task'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modais */}
      {taskModal && <TaskModal task={taskModal.task} colInicial={taskModal.col} onSalvar={salvarTask} onFechar={()=>setTaskModal(null)} />}
      {meetingModal && <MeetingModal onSalvar={salvarReuniao} onFechar={()=>setMeetingModal(false)} />}
      {suggestions && <SuggestionsModal data={suggestions} onConfirmar={confirmarSugestoes} onFechar={()=>setSuggestions(null)} />}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#003B82', color:'#fff', padding:'10px 20px', borderRadius:10, fontSize:13, fontWeight:600, boxShadow:'0 4px 14px rgba(0,0,0,.2)', zIndex:60, display:'flex', alignItems:'center', gap:8 }}>
          <Check size={15} /> {toast}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
//  SUBCOMPONENTES
// ════════════════════════════════════════════════════════════════════
function TabBtn({ ativo, onClick, Icon, label, badge }) {
  return (
    <button onClick={onClick}
      style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 16px', fontSize:14, fontWeight:600, cursor:'pointer', background:ativo?'#fff':'transparent', border:'none', borderBottom:`2px solid ${ativo?'#FF7900':'transparent'}`, color:ativo?'#003B82':'#64748b' }}>
      <Icon size={16} /> {label}
      {badge > 0 && <span style={{ fontSize:10, fontWeight:700, background:'#FF7900', color:'#fff', borderRadius:99, padding:'1px 6px' }}>{badge}</span>}
    </button>
  )
}

function Card({ t, readOnly, onDragStart, onEdit, onDelete, onShare }) {
  const [hover, setHover] = useState(false)
  const prio = PRIOS[t.priority] || PRIOS.media
  const dias = diasRestantes(t.due_date)
  let prazoCor = '#64748b', prazoBg = '#F1F5F9', prazoTxt = fmtDiaMes(t.due_date)
  if (dias !== null) {
    if (dias < 0) { prazoCor = '#C00000'; prazoBg = '#FEE2E2'; prazoTxt = `Atrasado · ${fmtDiaMes(t.due_date)}` }
    else if (dias <= 2) { prazoCor = '#B45309'; prazoBg = '#FEF3C7' }
  }
  return (
    <div draggable={!readOnly} onDragStart={onDragStart}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:9, padding:12, boxShadow:'0 1px 2px rgba(0,0,0,.04)', cursor:readOnly?'default':'grab' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#1e293b', lineHeight:1.35 }}>{t.title}</p>
        {!readOnly && (
          <div style={{ display:'flex', gap:2, opacity:hover?1:0, transition:'opacity .15s' }}>
            <IconBtn title={t.is_shared?'Deixar de compartilhar':'Compartilhar com a equipe'} onClick={onShare}><Share2 size={13} color={t.is_shared?'#FF7900':'#94A3B8'} /></IconBtn>
            <IconBtn title="Editar" onClick={onEdit}><Pencil size={13} color="#64748b" /></IconBtn>
            <IconBtn title="Excluir" onClick={onDelete}><Trash2 size={13} color="#C00000" /></IconBtn>
          </div>
        )}
      </div>

      {t.description && <p style={{ margin:'4px 0 0', fontSize:12, color:'#64748b', lineHeight:1.35 }}>{t.description}</p>}

      {t.tags?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
          {t.tags.map(tag => (
            <span key={tag} style={{ fontSize:10, background:'#EEF2FF', color:'#003B82', borderRadius:4, padding:'1px 6px', display:'flex', alignItems:'center', gap:3 }}>
              <TagIcon size={9} /> {tag}
            </span>
          ))}
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10, flexWrap:'wrap', gap:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:10, fontWeight:600, color:prio.color, display:'flex', alignItems:'center', gap:3 }}><Flag size={10} /> {prio.label}</span>
          {prazoTxt && (
            <span style={{ fontSize:10, fontWeight:600, background:prazoBg, color:prazoCor, borderRadius:4, padding:'1px 6px', display:'flex', alignItems:'center', gap:3 }}>
              <Calendar size={9} /> {prazoTxt}
            </span>
          )}
        </div>
        {readOnly && <span style={{ fontSize:10, color:'#94a3b8', display:'flex', alignItems:'center', gap:3 }}><Circle size={7} fill="#CBD5E1" color="#CBD5E1" /> {t.user_nome || t.user_email}</span>}
        {!readOnly && t.is_shared && <span style={{ fontSize:10, color:'#FF7900', display:'flex', alignItems:'center', gap:3 }}><Share2 size={9} /> Compartilhado</span>}
      </div>

      {t.origin_meeting_title && (
        <div style={{ marginTop:8, paddingTop:8, borderTop:'1px dashed #E2E8F0', fontSize:10, color:'#94a3b8', display:'flex', alignItems:'center', gap:4 }}>
          <Link2 size={9} /> Origem: {t.origin_meeting_title}
        </div>
      )}
    </div>
  )
}

function IconBtn({ children, onClick, title }) {
  return (
    <button title={title} onClick={onClick}
      style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:6, display:'flex' }}
      onMouseEnter={e=>e.currentTarget.style.background='#F1F5F9'}
      onMouseLeave={e=>e.currentTarget.style.background='none'}>
      {children}
    </button>
  )
}

// ── Aba Reuniões ──
function MeetingsTab({ meetings, onNova, onExcluir, onGerar, gerandoId, erroId }) {
  return (
    <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <p style={{ margin:0, fontSize:13, color:'#64748b' }}>Registre a ata e, quando quiser, gere sugestões de tasks a partir do texto.</p>
        <button onClick={onNova}
          style={{ background:'#003B82', color:'#fff', border:'none', borderRadius:9, padding:'9px 14px', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          <Plus size={15} /> Nova anotação
        </button>
      </div>

      {meetings.length === 0 && (
        <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, padding:'56px 0', textAlign:'center', color:'#94a3b8', fontSize:14, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
          <NotebookPen size={22} style={{ opacity:.4 }} />
          Nenhuma reunião registrada ainda. Comece pela primeira ata.
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {meetings.map(m => (
          <div key={m.id} style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, padding:16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
              <div>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#1e293b' }}>{m.title}</p>
                <p style={{ margin:'2px 0 0', fontSize:12, color:'#94a3b8', display:'flex', alignItems:'center', gap:4 }}>
                  <Calendar size={11} /> {fmtDiaMes(m.meeting_date) || m.meeting_date}
                </p>
              </div>
              <IconBtn title="Excluir" onClick={()=>onExcluir(m.id)}><Trash2 size={14} color="#C00000" /></IconBtn>
            </div>
            <p style={{ margin:'8px 0 0', fontSize:13, color:'#475569', whiteSpace:'pre-wrap', lineHeight:1.4 }}>{m.notes}</p>
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              {m.tasks_geradas
                ? <span style={{ fontSize:12, color:'#94a3b8', display:'flex', alignItems:'center', gap:4 }}><Check size={12} color="#00B050" /> Tasks já geradas dessa reunião</span>
                : <span />}
              <button onClick={()=>onGerar(m)} disabled={gerandoId===m.id}
                style={{ background:'#EEF2FF', color:'#003B82', border:'none', borderRadius:8, padding:'7px 12px', fontSize:12, fontWeight:700, cursor:gerandoId===m.id?'default':'pointer', opacity:gerandoId===m.id?.6:1, display:'flex', alignItems:'center', gap:6 }}>
                {gerandoId===m.id
                  ? <><Loader2 size={13} className="spin" /> Analisando…</>
                  : <><Sparkles size={13} /> Gerar tasks</>}
              </button>
            </div>
            {erroId===m.id && <p style={{ margin:'8px 0 0', fontSize:12, color:'#C00000' }}>Não foi possível gerar as sugestões agora. Tente novamente.</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modal nova reunião ──
function MeetingModal({ onSalvar, onFechar }) {
  const [title, setTitle] = useState('')
  const [date, setDate]   = useState(hojeISO())
  const [notes, setNotes] = useState('')
  const podeSalvar = title.trim() && notes.trim()
  return (
    <Overlay onFechar={onFechar}>
      <ModalHead icon={<NotebookPen size={17} color="#003B82" />} title="Nova anotação de reunião" onFechar={onFechar} />
      <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
        <Campo label="Título da reunião"><Input value={title} onChange={setTitle} placeholder="Ex.: RAS — 06/07" autoFocus /></Campo>
        <Campo label="Data"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inputStyle} /></Campo>
        <Campo label="Anotações (texto livre)">
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={7} placeholder="Cole ou escreva aqui o que foi discutido e decidido na reunião…" style={{ ...inputStyle, resize:'none' }} />
        </Campo>
      </div>
      <ModalFoot onFechar={onFechar} podeSalvar={podeSalvar} label="Salvar anotação"
        onSalvar={()=>onSalvar({ title:title.trim(), date, notes:notes.trim() })} />
    </Overlay>
  )
}

// ── Modal sugestões IA ──
function SuggestionsModal({ data, onConfirmar, onFechar }) {
  const [items, setItems] = useState(data.items)
  const toggle = (id) => setItems(its => its.map(i => i.id===id ? { ...i, selected:!i.selected } : i))
  const editar = (id, title) => setItems(its => its.map(i => i.id===id ? { ...i, title } : i))
  const selecionadas = items.filter(i => i.selected)
  return (
    <Overlay onFechar={onFechar}>
      <ModalHead icon={<Sparkles size={17} color="#FF7900" />} title="Tasks sugeridas" onFechar={onFechar} />
      <div style={{ padding:'16px 20px' }}>
        <p style={{ margin:'0 0 12px', fontSize:12, color:'#64748b', display:'flex', alignItems:'center', gap:4 }}>
          <Link2 size={11} /> Origem: {data.meetingTitle}
        </p>
        {items.length === 0 && <p style={{ fontSize:14, color:'#94a3b8', textAlign:'center', padding:'24px 0' }}>Nenhuma ação clara foi identificada no texto.</p>}
        <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:320, overflowY:'auto' }}>
          {items.map(it => (
            <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, border:'1px solid #E2E8F0', borderRadius:8, padding:'8px 12px' }}>
              <input type="checkbox" checked={it.selected} onChange={()=>toggle(it.id)} style={{ accentColor:'#FF7900' }} />
              <input value={it.title} onChange={e=>editar(it.id, e.target.value)} style={{ flex:1, fontSize:13, border:'none', outline:'none', background:'transparent', color:'#1e293b' }} />
              <span style={{ fontSize:10, fontWeight:600, color:PRIOS[it.priority].color, display:'flex', alignItems:'center', gap:3 }}><Flag size={9} /> {PRIOS[it.priority].label}</span>
            </div>
          ))}
        </div>
      </div>
      <ModalFoot onFechar={onFechar} podeSalvar={selecionadas.length>0}
        label={`Criar ${selecionadas.length||''} task${selecionadas.length===1?'':'s'}`}
        onSalvar={()=>onConfirmar(data.meetingId, data.meetingTitle, selecionadas)} />
    </Overlay>
  )
}

// ── Modal criar/editar task ──
function TaskModal({ task, colInicial, onSalvar, onFechar }) {
  const [title, setTitle]       = useState(task?.title || '')
  const [description, setDesc]  = useState(task?.description || '')
  const [dueDate, setDueDate]   = useState(task?.due_date || '')
  const [priority, setPriority] = useState(task?.priority || 'media')
  const [tagsStr, setTagsStr]   = useState((task?.tags || []).join(', '))
  const status = task?.status || colInicial || 'a_fazer'
  const podeSalvar = title.trim().length > 0
  return (
    <Overlay onFechar={onFechar}>
      <ModalHead icon={<LayoutGrid size={17} color="#003B82" />} title={task ? 'Editar task' : 'Nova task'} onFechar={onFechar} />
      <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
        <Campo label="Título"><Input value={title} onChange={setTitle} placeholder="O que precisa ser feito?" autoFocus /></Campo>
        <Campo label="Descrição">
          <textarea value={description} onChange={e=>setDesc(e.target.value)} rows={2} placeholder="Detalhes (opcional)" style={{ ...inputStyle, resize:'none' }} />
        </Campo>
        <div style={{ display:'flex', gap:12 }}>
          <Campo label="Prazo"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={inputStyle} /></Campo>
          <Campo label="Prioridade">
            <select value={priority} onChange={e=>setPriority(e.target.value)} style={{ ...inputStyle, background:'#fff' }}>
              {Object.entries(PRIOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Campo>
        </div>
        <Campo label="Tags (separe por vírgula)"><Input value={tagsStr} onChange={setTagsStr} placeholder="RAS, Status, Deploy" /></Campo>
      </div>
      <ModalFoot onFechar={onFechar} podeSalvar={podeSalvar} label={task ? 'Salvar alterações' : 'Criar task'}
        onSalvar={()=>onSalvar({ id:task?.id, title:title.trim(), description:description.trim(), due_date:dueDate, priority, tags:tagsStr.split(',').map(s=>s.trim()).filter(Boolean), status })} />
    </Overlay>
  )
}

// ── Primitivos de modal ──
const inputStyle = { width:'100%', border:'1px solid #CBD5E1', borderRadius:8, padding:'8px 12px', fontSize:13, outline:'none', boxSizing:'border-box' }

function Overlay({ children, onFechar }) {
  return (
    <div onClick={onFechar} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:50 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:520, boxShadow:'0 10px 40px rgba(0,0,0,.2)' }}>
        {children}
      </div>
    </div>
  )
}
function ModalHead({ icon, title, onFechar }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid #F1F5F9' }}>
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#1e293b', display:'flex', alignItems:'center', gap:8 }}>{icon} {title}</h3>
      <IconBtn title="Fechar" onClick={onFechar}><X size={18} color="#64748b" /></IconBtn>
    </div>
  )
}
function ModalFoot({ onFechar, onSalvar, podeSalvar, label }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'16px 20px', borderTop:'1px solid #F1F5F9' }}>
      <button onClick={onFechar} style={{ background:'none', border:'none', color:'#64748b', fontSize:13, fontWeight:600, padding:'8px 16px', borderRadius:8, cursor:'pointer' }}>Cancelar</button>
      <button onClick={()=>podeSalvar && onSalvar()} disabled={!podeSalvar}
        style={{ background:'#FF7900', color:'#fff', border:'none', fontSize:13, fontWeight:700, padding:'8px 16px', borderRadius:8, cursor:podeSalvar?'pointer':'default', opacity:podeSalvar?1:.4, display:'flex', alignItems:'center', gap:6 }}>
        <Check size={15} /> {label}
      </button>
    </div>
  )
}
function Campo({ label, children }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:4, flex:1 }}>
      <span style={{ fontSize:12, fontWeight:600, color:'#64748b' }}>{label}</span>
      {children}
    </label>
  )
}
function Input({ value, onChange, placeholder, autoFocus }) {
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} style={inputStyle} />
}

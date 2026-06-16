import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { ChevronLeft, Filter, RefreshCw } from 'lucide-react'

const ACTIONS_PT = {
  LOGIN: 'Login', LOGOUT: 'Logout',
  OPEN_APP: 'Abriu o app', CLOSE_APP: 'Fechou o app',
  UPDATE_PROJECT: 'Atualizou projeto', SAVE_PROJECT: 'Salvou projeto',
  DELETE_PROJECT: 'Excluiu projeto', IMPORT_PORTFOLIO: 'Importou portfólio',
  GENERATE_PPTX: 'Gerou PPTX',
  CREATE_USER: 'Criou usuário', UPDATE_USER: 'Editou usuário',
  DELETE_USER: 'Excluiu usuário', ACTIVATE_USER: 'Ativou usuário',
  DEACTIVATE_USER: 'Desativou usuário', RESET_PASSWORD: 'Resetou senha',
  CHANGE_PASSWORD: 'Trocou senha', UPDATE_PROFILE: 'Atualizou perfil',
}

function badge(action) {
  const groups = {
    danger:  ['DELETE_PROJECT','DELETE_USER','DEACTIVATE_USER'],
    success: ['LOGIN','ACTIVATE_USER','GENERATE_PPTX'],
    warning: ['RESET_PASSWORD','CHANGE_PASSWORD','LOGOUT'],
    info:    ['OPEN_APP','IMPORT_PORTFOLIO','UPDATE_PROJECT','SAVE_PROJECT'],
  }
  for (const [type, acts] of Object.entries(groups)) {
    if (acts.includes(action)) return type
  }
  return 'neutral'
}

const BADGE_COLORS = {
  danger:  { bg:'#FEF2F2', color:'#DC2626' },
  success: { bg:'#F0FDF4', color:'#166534' },
  warning: { bg:'#FEF9C3', color:'#92400E' },
  info:    { bg:'#EFF6FF', color:'#1D4ED8' },
  neutral: { bg:'#F1F5F9', color:'#475569' },
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

export default function AuditScreen({ onBack }) {
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('audit')   // 'audit' | 'session'
  const [search, setSearch]     = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [page, setPage]         = useState(0)
  const PER_PAGE = 50

  async function loadLogs() {
    setLoading(true)
    const table = tab === 'audit' ? 'audit_log' : 'session_log'
    let q = supabase.from(table).select('*', { count:'exact' })
      .order('created_at', { ascending: false })
      .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)
    if (filterAction) q = q.eq('action', filterAction)
    if (search)       q = q.ilike('user_email', `%${search}%`)
    const { data } = await q
    setLogs(data || [])
    setLoading(false)
  }

  useEffect(() => { setPage(0) }, [tab, search, filterAction])
  useEffect(() => { loadLogs() }, [tab, page, search, filterAction])

  const allActions = Object.keys(ACTIONS_PT)

  return (
    <div style={{ minHeight:'100vh', background:'#F1F5F9' }}>
      {/* Header */}
      <div style={{ background:'#003B82', color:'#fff', padding:'14px 28px', display:'flex', alignItems:'center', gap:14 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:14 }}>
          <ChevronLeft size={18} /> Voltar
        </button>
        <div style={{ width:1, height:20, background:'rgba(255,255,255,.3)' }} />
        <Filter size={18} />
        <span style={{ fontWeight:700, fontSize:16 }}>Auditoria</span>
      </div>

      <div style={{ maxWidth:1100, margin:'28px auto', padding:'0 20px' }}>
        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, background:'#fff', borderRadius:10, padding:4, width:'fit-content', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
          {[['audit','Alterações (Auditoria)'],['session','Atividade de Sessão']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding:'7px 18px', borderRadius:7, border:'none', cursor:'pointer', fontWeight:600, fontSize:13,
                background: tab===k ? '#003B82' : 'transparent', color: tab===k ? '#fff' : '#64748b' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <input placeholder="Filtrar por email…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ border:'1.5px solid #CBD5E1', borderRadius:8, padding:'8px 14px', fontSize:13, minWidth:220 }} />
          <select value={filterAction} onChange={e=>setFilterAction(e.target.value)}
            style={{ border:'1.5px solid #CBD5E1', borderRadius:8, padding:'8px 14px', fontSize:13, color: filterAction?'#1e293b':'#94a3b8' }}>
            <option value="">Todas as ações</option>
            {allActions.map(a => <option key={a} value={a}>{ACTIONS_PT[a] || a}</option>)}
          </select>
          <button onClick={loadLogs} style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', border:'1.5px solid #CBD5E1', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:13, color:'#334155' }}>
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>

        {/* Tabela */}
        <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F8FAFC' }}>
                {['Data/Hora','Usuário','Ação', tab==='audit'?'Entidade':'', tab==='audit'?'Detalhes':''].filter(Boolean).map(h => (
                  <th key={h} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', borderBottom:'1px solid #E2E8F0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Carregando…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Nenhum registro encontrado.</td></tr>
              ) : logs.map((log, i) => {
                const bType = badge(log.action)
                const bColor = BADGE_COLORS[bType]
                return (
                  <tr key={log.id} style={{ borderBottom:'1px solid #F1F5F9', background:i%2===0?'#fff':'#FAFBFC' }}>
                    <td style={{ padding:'10px 16px', fontSize:12, color:'#64748b', whiteSpace:'nowrap' }}>{fmtDate(log.created_at)}</td>
                    <td style={{ padding:'10px 16px', fontSize:13, color:'#1e293b' }}>{log.user_email || '—'}</td>
                    <td style={{ padding:'10px 16px' }}>
                      <span style={{ fontSize:12, fontWeight:700, borderRadius:6, padding:'3px 10px', background:bColor.bg, color:bColor.color }}>
                        {ACTIONS_PT[log.action] || log.action}
                      </span>
                    </td>
                    {tab === 'audit' && <>
                      <td style={{ padding:'10px 16px', fontSize:12, color:'#64748b' }}>
                        {log.entity && <span>{log.entity}{log.entity_id ? ` #${log.entity_id.slice(0,8)}` : ''}</span>}
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:11, color:'#94a3b8', maxWidth:280 }}>
                        {log.detail ? (
                          <details>
                            <summary style={{ cursor:'pointer', color:'#2F5597', fontSize:12 }}>Ver detalhes</summary>
                            <pre style={{ marginTop:6, background:'#F8FAFC', borderRadius:6, padding:8, fontSize:11, overflow:'auto', maxHeight:120 }}>
                              {JSON.stringify(log.detail, null, 2)}
                            </pre>
                          </details>
                        ) : '—'}
                      </td>
                    </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:16 }}>
          <button disabled={page===0} onClick={() => setPage(p=>p-1)}
            style={{ background:'#fff', border:'1px solid #CBD5E1', borderRadius:7, padding:'7px 16px', cursor:page===0?'not-allowed':'pointer', color:page===0?'#94a3b8':'#334155', fontSize:13 }}>
            ← Anterior
          </button>
          <span style={{ display:'flex', alignItems:'center', fontSize:13, color:'#64748b' }}>Página {page+1}</span>
          <button disabled={logs.length < PER_PAGE} onClick={() => setPage(p=>p+1)}
            style={{ background:'#fff', border:'1px solid #CBD5E1', borderRadius:7, padding:'7px 16px', cursor:logs.length<PER_PAGE?'not-allowed':'pointer', color:logs.length<PER_PAGE?'#94a3b8':'#334155', fontSize:13 }}>
            Próxima →
          </button>
        </div>
      </div>
    </div>
  )
}

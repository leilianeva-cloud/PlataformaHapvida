import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { ArrowLeft, Upload, Search, Send, FolderOpen, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuth } from './AuthContext'
import { loadSharedPortfolio, saveSharedPortfolio } from './supabaseClient'
import { COL, isValid, rKey, rowKey } from './portfolioUtils'

// Dias após os quais a idade da importação vira alerta visível a todos.
const DIAS_ALERTA = 10

function diasDesde(ddmmyyyy) {
  if (!ddmmyyyy) return null
  const [d, m, y] = ddmmyyyy.split('/').map(Number)
  if (!d || !m || !y) return null
  const imp = new Date(y, m - 1, d)
  return Math.floor((Date.now() - imp.getTime()) / 86400000)
}

export default function PortfolioScreen({ onVoltar, onEnviarParaStatus }) {
  const { profile, isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [importedAt, setImportedAt] = useState('')
  const [importedBy, setImportedBy] = useState('')
  const [loading, setLoading] = useState(true)
  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef(null)

  // filtros
  const [fSm, setFSm] = useState('')
  const [fTri, setFTri] = useState('')
  const [fComp, setFComp] = useState('')
  const [busca, setBusca] = useState('')

  // seleção (por chave estável)
  const [sel, setSel] = useState(new Set())

  async function carregar() {
    setLoading(true)
    const data = await loadSharedPortfolio()
    if (data) {
      setRows(data.rows || [])
      setImportedAt(data.importedAt || '')
      setImportedBy(data.importedByEmail || '')
    }
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  const validRows = useMemo(() => rows.filter(isValid), [rows])

  const smOpts = useMemo(() => [...new Set(validRows.map(r => String(r[COL.SM] || '').trim()).filter(Boolean))].sort(), [validRows])
  const triOpts = useMemo(() => [...new Set(validRows.map(r => String(r[COL.TRIMESTRE] || '').trim()).filter(Boolean))].sort(), [validRows])
  const compOpts = useMemo(() => [...new Set(validRows.map(r => String(r[COL.COMPROMISSO] || '').trim()).filter(Boolean))].sort(), [validRows])

  const filtered = useMemo(() => validRows.filter(r => {
    if (fSm && String(r[COL.SM] || '').trim() !== fSm) return false
    if (fTri && String(r[COL.TRIMESTRE] || '').trim() !== fTri) return false
    if (fComp && String(r[COL.COMPROMISSO] || '').trim() !== fComp) return false
    if (busca) {
      const q = busca.trim().toLowerCase()
      const nome = String(r[COL.NOME] || '').toLowerCase()
      const lecom = String(r[COL.ID] ?? '').toLowerCase()
      if (!nome.includes(q) && !lecom.includes(q)) return false
    }
    return true
  }), [validRows, fSm, fTri, fComp, busca])

  // Duas contagens: LINHAS (fiel à priorização) e PROJETOS distintos (por Lecom/chave).
  const totalLinhas = validRows.length
  const totalProjetos = useMemo(() => new Set(validRows.map(rKey)).size, [validRows])

  const toggle = (k) => setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true); setErro('')
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true })
        const sheet = wb.Sheets['Portfólio'] || wb.Sheets[wb.SheetNames[0]]
        const parsed = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        const dataRows = parsed.slice(2) // header na linha 2
        // Validação de cabeçalho: se a Col A não for a de identificação, a estrutura mudou.
        const header = (parsed[1] || []).map(c => String(c || '').toLowerCase())
        if (header.length && !header[COL.ID]?.includes('identifica') && !header[COL.ID]?.includes('lecom')) {
          if (!window.confirm('A coluna A não parece ser "IDENTIFICAÇÃO/Lecom". A estrutura da planilha pode ter mudado. Importar mesmo assim?')) {
            setImportando(false); if (fileRef.current) fileRef.current.value = ''; return
          }
        }
        const res = await saveSharedPortfolio(dataRows)
        if (!res.ok) {
          setErro(res.error?.toLowerCase().includes('row-level') || res.error?.toLowerCase().includes('policy')
            ? 'Só administradores podem importar o portfólio compartilhado.'
            : `Erro ao importar: ${res.error}`)
        } else {
          await carregar()
          setSel(new Set())
        }
      } catch (err) {
        setErro(`Erro ao ler o arquivo: ${err.message}`)
      }
      setImportando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsArrayBuffer(file)
  }

  const enviar = () => {
    if (!sel.size) return
    // Envia as LINHAS (arrays crus do Excel) correspondentes às chaves selecionadas.
    // O Status espera linhas — rKey/makeProjetoFromRow indexam por número de coluna.
    const linhas = validRows.filter(r => sel.has(rowKey(r)))
    onEnviarParaStatus(linhas)
  }

  const dias = diasDesde(importedAt)
  const desatualizado = dias != null && dias >= DIAS_ALERTA

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: "'Inter',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Cabeçalho */}
      <div style={{ background: 'linear-gradient(135deg,#001F4E,#003B85)', color: '#fff', padding: '22px 40px', display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.25)', color: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}>
          <ArrowLeft size={15} /> Início
        </button>
        <FolderOpen size={22} />
        <div style={{ fontSize: 20, fontWeight: 800 }}>Portfólio <span style={{ color: '#FF7900' }}>Governança TI</span></div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 30px 80px' }}>
        {/* Faixa de status do portfólio */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
          {/* Card importação (só admin) */}
          {isAdmin && (
            <div style={{ flex: '1 1 320px', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                <Upload size={17} color="#003B85" /> Importar Portfólio
              </div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 16 }}>Compartilhado com todo o time. Só administradores importam.</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} id="port-file" />
              <label htmlFor="port-file" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: importando ? '#94A3B8' : '#003B85', color: '#fff', borderRadius: 10, padding: '11px 18px', cursor: importando ? 'default' : 'pointer', fontWeight: 700, fontSize: 13.5 }}>
                {importando ? <><RefreshCw size={15} className="spin" /> Importando…</> : <><Upload size={15} /> {rows.length ? 'Trocar arquivo' : 'Selecionar arquivo'}</>}
              </label>
              {erro && <div style={{ marginTop: 12, color: '#B91C1C', fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'flex-start' }}><AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />{erro}</div>}
            </div>
          )}

          {/* Card portfólio ativo */}
          <div style={{ flex: '2 1 480px', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, color: '#94A3B8', marginBottom: 2 }}>PORTFÓLIO ATIVO</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 16 }}>
              {totalLinhas} linhas · {totalProjetos} projetos
            </div>
            {[
              ['Disponíveis para report', `${totalLinhas} linhas`],
              ['Projetos distintos (por Lecom)', `${totalProjetos} projetos`],
              ['Importado em', importedAt || '—'],
              ['Importado por', importedBy || '—'],
            ].map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: '#F8FAFC', borderRadius: 8, marginBottom: 6, fontSize: 13.5 }}>
                <span style={{ color: '#475569' }}>{k}</span>
                <span style={{ fontWeight: 700, color: '#003B85' }}>{v}</span>
              </div>
            ))}
            {desatualizado && (
              <div style={{ marginTop: 8, background: '#FEF3C7', color: '#92400E', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={14} /> Importado há {dias} dias — pode estar desatualizado.
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: '#64748B', padding: 60 }}>Carregando portfólio…</div>
        ) : !rows.length ? (
          <div style={{ textAlign: 'center', color: '#64748B', padding: 60, background: '#fff', borderRadius: 16 }}>
            Nenhum portfólio importado ainda.{isAdmin ? ' Use "Selecionar arquivo" acima.' : ' Aguarde um administrador importar.'}
          </div>
        ) : (
          <>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: '#94A3B8' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou Lecom…"
                  style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 9, border: '1px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit' }} />
              </div>
              <select value={fSm} onChange={e => setFSm(e.target.value)} style={selStyle}><option value="">SM/PMO (todos)</option>{smOpts.map(o => <option key={o} value={o}>{o}</option>)}</select>
              <select value={fTri} onChange={e => setFTri(e.target.value)} style={selStyle}><option value="">Trimestre (todos)</option>{triOpts.map(o => <option key={o} value={o}>{o}</option>)}</select>
              <select value={fComp} onChange={e => setFComp(e.target.value)} style={selStyle}><option value="">Compromisso (todos)</option>{compOpts.map(o => <option key={o} value={o}>{o}</option>)}</select>
            </div>

            {/* Barra de ação */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: '#475569' }}>{filtered.length} de {totalLinhas} linhas · {sel.size} selecionado{sel.size !== 1 ? 's' : ''}</div>
              <button onClick={enviar} disabled={!sel.size}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: sel.size ? '#FF7900' : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: sel.size ? 'pointer' : 'default', fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit' }}>
                <Send size={15} /> Enviar para Status ({sel.size})
              </button>
            </div>

            {/* Lista */}
            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                {filtered.map((r, i) => {
                  const k = rowKey(r)
                  const checked = sel.has(k)
                  return (
                    <div key={i} onClick={() => toggle(k)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: checked ? '#EEF4FF' : '#fff' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(k)} onClick={e => e.stopPropagation()} />
                      <span style={{ fontWeight: 600, color: '#1E293B', flex: 1, fontSize: 13 }}>{String(r[COL.NOME] || '').trim()}</span>
                      <span style={{ fontSize: 11.5, color: '#64748B', whiteSpace: 'nowrap', minWidth: 70 }}>{String(r[COL.ID] || '—')}</span>
                      <span style={{ fontSize: 11.5, color: '#64748B', whiteSpace: 'nowrap', minWidth: 50 }}>{String(r[COL.TRIMESTRE] || '')}</span>
                      <span style={{ fontSize: 11.5, color: '#64748B', whiteSpace: 'nowrap', minWidth: 90, textAlign: 'right' }}>{String(r[COL.COMPROMISSO] || '')}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const selStyle = { padding: '9px 12px', borderRadius: 9, border: '1px solid #E2E8F0', fontSize: 13, fontFamily: "'Inter',sans-serif", background: '#fff', color: '#334155' }

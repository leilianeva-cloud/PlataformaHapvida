import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from 'xlsx';
import { Plus, Trash2, ChevronDown, ChevronUp, ChevronRight, Save, FileDown, ChevronLeft, Upload, FolderOpen, Search, Edit2, Download, Package, ClipboardList, Zap, LogOut, User, Shield, Filter } from "lucide-react";
import { useAuth } from './AuthContext';
import { supabase, logAudit, logSession } from './supabaseClient';
import LoginScreen from './LoginScreen';
import ChangePasswordModal from './ChangePasswordModal';
import HomeScreen from './HomeScreen';
import ReportRasScreen from './ReportRasScreen';
import KanbanScreen from './KanbanScreen';
import AdminScreen from './AdminScreen';
import AuditScreen from './AuditScreen';

const FASES = {
  Planejamento:   "#7030A0",
  Desenvolvimento:"#0070C0",
  "Homologação":  "#ED7D31",
  Entrega:        "#00B050",
  "Op. Assistida":"#00B050",
};
const ORDEM_FASES = Object.keys(FASES);
const FASE_CUSTOM = '__manual__';
const FASE_CUSTOM_COR = '#64748B';
const A_DEFINIR_COR = '#D9D9D9';

// helper: resolve cor de uma fase (incluindo custom)
function faseCor(f) {
  if (!f) return '#999';
  if (f.fase === FASE_CUSTOM) return FASE_CUSTOM_COR;
  return FASES[f.fase] || '#999';
}
// helper: rótulo legível da fase
function faseLabel(f) {
  if (!f) return '';
  if (f.fase === FASE_CUSTOM) return f.faseCustom || 'Manual';
  return f.fase || '';
}

// ── Helpers de pacote ──
function calcPctRaia(r) {
  const fases = (r.fases || []).filter(f => !f.aDefinir);
  if (!fases.length) return 0;
  return fases.reduce((s, f) => s + (Number(f.pct) || 0), 0) / fases.length;
}

function calcPacoteInfo(pac, pacRaias) {
  const allInicio = pacRaias.flatMap(r => r.fases.filter(f => f.inicio && !f.aDefinir).map(f => f.inicio)).filter(Boolean).sort();
  const allFim    = pacRaias.flatMap(r => r.fases.filter(f => !f.aDefinir).map(f => f.fimRepactuado || f.fim)).filter(Boolean).sort();
  const minInicio = allInicio[0] || '';
  const maxFim    = allFim[allFim.length - 1] || '';
  const pcts      = pacRaias.map(calcPctRaia);
  const pctMedia  = pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : 0;
  
  const statuses  = pacRaias.map(r => r.statusDemanda || 'A iniciar');
  const status    = statuses.includes('Atrasado') ? 'Atrasado'
                  : statuses.includes('Em Andamento') ? 'Em Andamento'
                  : statuses.includes('Aguardando Publicação') ? 'Aguardando Publicação'
                  : statuses.includes('Op. Assistida') ? 'Op. Assistida'
                  : statuses.includes('Monitoramento e Controle') ? 'Monitoramento e Controle'
                  : statuses.length && statuses.every(s => s === 'Concluído') ? 'Concluído'
                  : 'A iniciar';
  
  return { minInicio, maxFim, pctMedia, status };
}

function statusCor(s) {
  return s === 'Concluído' ? '#00B050' : s === 'Monitoramento e Controle' ? '#0891B2' : s === 'Op. Assistida' ? '#14B8A6' : s === 'Aguardando Publicação' ? '#F59E0B' : s === 'Em Andamento' ? '#0070C0' : s === 'Atrasado' ? '#C00000' : '#94A3B8';
}

const STATUS_GERAL = {
  Bom:            "#69AE9A",
  "Com Riscos":   "#FDB713",
  "Com Problemas":"#FF0000",
};
const CINZA_DESPRI = "#D9D9D9";

// lightening helper p/ o "envelope" (parte clara = tempo ainda não decorrido)
function tint(hex, amount = 0.78) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amount);
  g = Math.round(g + (255 - g) * amount);
  b = Math.round(b + (255 - b) * amount);
  return `rgb(${r},${g},${b})`;
}

const MESES = ["JAN","FEV","MAR","ABRIL","MAIO","JUNHO","JUL","AGO","SET","OUT","NOV","DEZ"];
const ddmm = (d) => { if (!d) return ""; const x = new Date(d + "T12:00:00"); if (isNaN(x)) return ""; return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}`; };

// ---------- Timeline (grade de datas) ----------
// Trimestre vigente => 3 meses, cada um em 2 quinzenas (15 / fim).
// Trimestres futuros => 1 célula larga cada.
function buildTimeline(ano, mesInicio /*1-based*/, nFuturos, nPassados = 0) {
  const cells = [];
  const trimVigente = Math.floor((mesInicio - 1) / 3) + 1;
  const currentAbs = ano * 4 + (trimVigente - 1); // índice absoluto do trimestre vigente
  // trimestres passados (1 célula cada, do mais antigo ao mais recente)
  for (let q = nPassados; q >= 1; q--) {
    const abs = currentAbs - q;
    const yQ = Math.floor(abs / 4);
    const qIdx = ((abs % 4) + 4) % 4;
    const mStart = qIdx * 3;
    cells.push({
      label: `${qIdx + 1}T`, mesLabel: "", peso: 0.55, futuro: true,
      start: new Date(yQ, mStart, 1), end: new Date(yQ, mStart + 3, 0, 23, 59),
    });
  }
  // 3 meses do trimestre vigente, 2 quinzenas cada
  for (let i = 0; i < 3; i++) {
    const m = mesInicio - 1 + i; // 0-based
    const y = ano + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    const ultimoDia = new Date(y, mm + 1, 0).getDate();
    cells.push({
      label: "15", mesLabel: MESES[mm], peso: 1,
      start: new Date(y, mm, 1), end: new Date(y, mm, 15, 23, 59),
    });
    cells.push({
      label: String(ultimoDia), mesLabel: MESES[mm], peso: 1,
      start: new Date(y, mm, 16), end: new Date(y, mm, ultimoDia, 23, 59),
    });
  }
  // trimestres futuros (1 célula cada)
  for (let q = 1; q <= nFuturos; q++) {
    const abs = currentAbs + q;
    const yQ = Math.floor(abs / 4);
    const qIdx = ((abs % 4) + 4) % 4;
    const mStart = qIdx * 3;
    cells.push({
      label: `${qIdx + 1}T`, mesLabel: "", peso: 0.55, futuro: true,
      start: new Date(yQ, mStart, 1), end: new Date(yQ, mStart + 3, 0, 23, 59),
    });
  }
  // frações cumulativas 0..1
  const total = cells.reduce((s, c) => s + c.peso, 0);
  let acc = 0;
  cells.forEach((c) => {
    c.f0 = acc / total;
    acc += c.peso;
    c.f1 = acc / total;
  });
  return { cells, trimVigente, ano };
}

// mapeia uma data -> fração 0..1 ao longo da timeline
function dateToFrac(date, cells) {
  if (!date) return null;
  const d = new Date(date + "T12:00:00");
  if (isNaN(d)) return null;
  if (d <= cells[0].start) return 0;
  const last = cells[cells.length - 1];
  if (d >= last.end) return 1;
  for (const c of cells) {
    if (d >= c.start && d <= c.end) {
      const span = c.end - c.start || 1;
      const fr = (d - c.start) / span;
      return c.f0 + fr * (c.f1 - c.f0);
    }
  }
  return null;
}

// ---------- Componente principal ----------
const COL = { ID:0, NOME:2, DESC:3, AREA_EXEC:7, LIDER_EXEC:8, DIR_EXEC:9, SM:12,
  AREA_CLI:14, LIDER_CLI:15, DIR_CLI:16, STATUS:20, DT_INICIO:21,
  TRIMESTRE:57, COMPROMISSO:58, DESPRI:59 };

function fmtDateISO(val) {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function makeProjetoFromRow(row) {
  const hoje = new Date();
  return {
    nome: String(row[COL.NOME]||'').trim(),
    smPmo: String(row[COL.SM]||'').trim(),
    resumoLecom: String(row[COL.ID]||''),
    resumoDesc: String(row[COL.DESC]||'').trim().slice(0,300),
    areaCliente: String(row[COL.AREA_CLI]||'').trim(),
    dirCliente: String(row[COL.DIR_CLI]||'').trim(),
    lidCliente: String(row[COL.LIDER_CLI]||'').trim(),
    areaExec: String(row[COL.AREA_EXEC]||'').trim(),
    dirExec: String(row[COL.DIR_EXEC]||'').trim(),
    lidExec: String(row[COL.LIDER_EXEC]||'').trim(),
    iniciadoEm: fmtDateISO(row[COL.DT_INICIO]),
    statusGeral: 'Bom',
    atualizadoPor: '',
    atualizadoEm: `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`,
    pontosAtencao: '',
  };
}

const defaultProjeto = () => {
  const hoje = new Date();
  return { nome:'', smPmo:'', resumoLecom:'', resumoDesc:'', areaCliente:'', dirCliente:'',
    lidCliente:'', areaExec:'', dirExec:'', lidExec:'', statusGeral:'Bom',
    atualizadoPor:'', iniciadoEm:'',
    atualizadoEm:`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`,
    pontosAtencao:'' };
};

// =====================================================================
//  TELA 1 — ImportScreen (dashboard principal)
// =====================================================================
function ImportScreen({ portfolioRows, onImport, existingProjects, manualProjects, setManualProjects, deleteProject, onStart, onContinue, onGenerate, importedAt, onVoltar }) {
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(null); // 'selecionar' | 'manual' | 'gerar' | 'atualizar'
  const [filters, setFilters] = useState({ sm:'', trimestre:'', compromisso:'', tipo:'todos' }); // tipo: 'todos'|'importados'|'manuais'
  const [selected, setSelected] = useState(new Set());
  // projetos manuais (fora do portfólio)
  // const [manualProjects, setManualProjects] = useState([]);
  const [manualForm, setManualForm] = useState({ nome:'', smPmo:'', resumoLecom:'', areaCliente:'', areaExec:'' });
  
  // seleção para Gerar Report
  const [gerarSelected, setGerarSelected] = useState(new Set());
  // Filtros de texto por sessão (busca em tempo real por nome/título)
  const [filtroAtualizar, setFiltroAtualizar] = useState('');
  const [filtroGerar, setFiltroGerar] = useState('');
  const [filtroManual, setFiltroManual] = useState('');
  const [manualSelected, setManualSelected] = useState(new Set());
  const toggleManual = (id) => setManualSelected(s=>{ const ns=new Set(s); ns.has(id)?ns.delete(id):ns.add(id); return ns; });
  // Handler unificado de exclusão permanente com confirmação
  const handleDelete = (id, nome) => {
    if (!window.confirm(`Excluir permanentemente o projeto "${nome}"?\n\nEsta ação NÃO pode ser desfeita.`)) return;
    deleteProject(id);
    // Limpa qualquer seleção pendente desse id
    setSelected(s => { const ns = new Set(s); ns.delete(id); return ns; });
    setAtualizarSelected(s => { const ns = new Set(s); ns.delete(id); return ns; });
    setGerarSelected(s => { const ns = new Set(s); ns.delete(id); return ns; });
  };
  
  // seleção para Atualizar Report
  const [atualizarSelected, setAtualizarSelected] = useState(new Set());

  const handleFile = (e) => { const f = e.target.files?.[0]; if (!f) return; processFile(f); };
  const processFile = (f) => {
    setLoading(true);
    const rd = new FileReader();
    rd.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type:'array', cellDates:true });
        const ws = wb.Sheets['Portfólio'] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1 });
        onImport(rows.slice(2));
      } catch(e) { alert('Erro ao ler o arquivo: ' + e.message); }
      setLoading(false);
    };
    rd.readAsArrayBuffer(f);
  };
  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) processFile(f);
  };

  const isValid = (r) => {
    if (!r[COL.NOME]) return false;
    const st = String(r[COL.STATUS]||'').toLowerCase();
    if (st.includes('cancelado') || st.includes('suspenso')) return false;
    if (r[COL.DESPRI] && String(r[COL.DESPRI]).trim() !== '') return false;
    return true;
  };
  const validRows  = useMemo(() => portfolioRows.filter(isValid), [portfolioRows]);
  const smOpts     = useMemo(() => [...new Set(validRows.map(r=>String(r[COL.SM]||'').trim()).filter(Boolean))].sort(), [validRows]);
  const trOpts     = useMemo(() => [...new Set(validRows.map(r=>String(r[COL.TRIMESTRE]||'').trim()).filter(Boolean))].sort(), [validRows]);
  const coOpts     = useMemo(() => [...new Set(validRows.map(r=>String(r[COL.COMPROMISSO]||'').trim()).filter(Boolean))].sort(), [validRows]);
  const filtered   = useMemo(() => validRows.filter(r => {
    if (filters.sm && String(r[COL.SM]||'').trim() !== filters.sm) return false;
    if (filters.trimestre && String(r[COL.TRIMESTRE]||'').trim() !== filters.trimestre) return false;
    if (filters.compromisso && String(r[COL.COMPROMISSO]||'').trim() !== filters.compromisso) return false;
    return true;
  }), [validRows, filters]);
  const rKey      = (r, i) => `${r[COL.ID]||''}:${i}`;
  const manualKey = (m) => `manual:${m.id}`;

  // lista combinada: portfólio filtrado + projetos manuais, com filtro de tipo
  const allSelectable = useMemo(() => {
    const portfolio = filtered.map((r,i) => ({ type:'portfolio', key:rKey(r,i), nome:String(r[COL.NOME]||'').trim(), id:r[COL.ID]||'', trimestre:String(r[COL.TRIMESTRE]||''), compromisso:String(r[COL.COMPROMISSO]||''), row:r }));
    const manuais   = manualProjects.map(m => ({ type:'manual', key:manualKey(m), nome:m.nome, id:m.id, trimestre:'—', compromisso:'Manual', manual:m }));
    if (filters.tipo === 'importados') return portfolio;
    if (filters.tipo === 'manuais')    return manuais;
    return [...portfolio, ...manuais];
  }, [filtered, manualProjects, filters.tipo]);

  const toggleAll = () => { if (selected.size===allSelectable.length) setSelected(new Set()); else setSelected(new Set(allSelectable.map(x=>x.key))); };
  const toggle    = (k) => setSelected(s=>{ const ns=new Set(s); ns.has(k)?ns.delete(k):ns.add(k); return ns; });

  // helpers para Atualizar Report
  const toggleAtualizar    = (id) => setAtualizarSelected(s=>{ const ns=new Set(s); ns.has(id)?ns.delete(id):ns.add(id); return ns; });
  const toggleAtualizarAll = () => { if (atualizarSelected.size===existingProjects.length) setAtualizarSelected(new Set()); else setAtualizarSelected(new Set(existingProjects.map(p=>p.id))); };
  const handleAtualizarDoPainel = () => {
    if (!atualizarSelected.size) return;
    onContinue([...atualizarSelected]);
  };

  // salvar projeto manual
  const saveManual = () => {
    if (!manualForm.nome.trim()) return;
    setManualProjects(ms => [...ms, { ...manualForm, id:`m-${Date.now()}` }]);
    setManualForm({ nome:'', smPmo:'', resumoLecom:'', areaCliente:'', areaExec:'' });
  };
  const removeManual = (id) => setManualProjects(ms => ms.filter(m=>m.id!==id));

  // "Selecionar para atualizar": salva projetos sem navegar
  const handleSelecionarParaAtualizar = () => {
    const selItems = allSelectable.filter(x=>selected.has(x.key));
    if (!selItems.length) return;
    const existing = Object.fromEntries(existingProjects.map(p=>[p.id,p]));
    const novos = selItems.map(x => {
      if (x.type === 'manual') {
        const id = x.key;
        return { id, nFuturos:existing[id]?.nFuturos??1, nPassados:existing[id]?.nPassados??0,
          projeto:{ ...defaultProjeto(), nome:x.manual.nome, smPmo:x.manual.smPmo||'', resumoLecom:x.manual.resumoLecom||'', areaCliente:x.manual.areaCliente||'', areaExec:x.manual.areaExec||'' },
          raias: existing[id]?.raias||[] };
      }
      const id = rKey(x.row, filtered.indexOf(x.row));
      return { id, nFuturos:existing[id]?.nFuturos??1, nPassados:existing[id]?.nPassados??0,
        projeto:makeProjetoFromRow(x.row), raias:existing[id]?.raias||[] };
    });
    const novosIds = new Set(novos.map(p=>p.id));
    const mantidos = existingProjects.filter(p=>!novosIds.has(p.id));
    onStart([...mantidos, ...novos], false); // false = não navegar
  };

  // Ações do card Manual
  const toggleManualAll = () => {
    const visiveis = manualProjects.filter(m => !filtroManual || (m.nome||'').toLowerCase().includes(filtroManual.toLowerCase()));
    if (manualSelected.size === visiveis.length) setManualSelected(new Set());
    else setManualSelected(new Set(visiveis.map(m => m.id)));
  };
  const handleManualAtualizarAgora = () => {
    const selecionados = manualProjects.filter(m => manualSelected.has(m.id));
    if (!selecionados.length) return;
    // Converte manuais em formato de projeto e mescla com os existentes
    const novos = selecionados.map(m => ({
      id: m.id,
      projeto: defaultProjeto({
        nome: m.nome, smPmo: m.smPmo, areaCliente: m.areaCliente,
        areaExec: m.areaExec, resumoLecom: m.resumoLecom,
      }),
      raias: [], nFuturos: 1, nPassados: 0, usaPacotes: false, pacotes: [],
    }));
    const novosIds = new Set(novos.map(p=>p.id));
    const mantidos = existingProjects.filter(p=>!novosIds.has(p.id));
    const merged = [...mantidos, ...novos];
    onStart(merged, true, novos.map(p=>p.id));
  };

  // "Atualizar agora": salva e navega para tela 2 mostrando apenas os selecionados
  const handleAtualizarAgora = () => {


    
    const selItems = allSelectable.filter(x=>selected.has(x.key));
    if (!selItems.length) return;
    const existing = Object.fromEntries(existingProjects.map(p=>[p.id,p]));
    const novos = selItems.map(x => {
      if (x.type === 'manual') {
        const id = x.key;
        return { id, nFuturos:existing[id]?.nFuturos??1, nPassados:existing[id]?.nPassados??0,
          projeto:{ ...defaultProjeto(), nome:x.manual.nome, smPmo:x.manual.smPmo||'', resumoLecom:x.manual.resumoLecom||'', areaCliente:x.manual.areaCliente||'', areaExec:x.manual.areaExec||'' },
          raias: existing[id]?.raias||[] };
      }
      const id = rKey(x.row, filtered.indexOf(x.row));
      return { id, nFuturos:existing[id]?.nFuturos??1, nPassados:existing[id]?.nPassados??0,
        projeto:makeProjetoFromRow(x.row), raias:existing[id]?.raias||[] };
    });
    const novosIds = new Set(novos.map(p=>p.id));
    const mantidos = existingProjects.filter(p=>!novosIds.has(p.id));
    const merged = [...mantidos, ...novos];
    // Uma única chamada: salva merged, ativa novos ids e navega para o primeiro selecionado.
    // Evita race condition entre setProjects (assíncrono) e findIndex sobre state antigo.
    onStart(merged, true, novos.map(p=>p.id));
  };

  // seleção para Gerar Report
  const toggleGerar = (id) => setGerarSelected(s=>{ const ns=new Set(s); ns.has(id)?ns.delete(id):ns.add(id); return ns; });
  const toggleGerarAll = () => { if (gerarSelected.size===existingProjects.length) setGerarSelected(new Set()); else setGerarSelected(new Set(existingProjects.map(p=>p.id))); };
  const handleGerar = () => {
    const toGen = existingProjects.filter(p=>gerarSelected.has(p.id));
    if (!toGen.length) return;
    onGenerate(toGen);
    setExpanded(null);
  };

  const hasPortfolio = portfolioRows.length > 0;
  const hasProjects  = existingProjects.length > 0;

  // ---- ícone Excel mini ----
  const ExcelIcon = ({size=28, op=1}) => (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <rect width="30" height="30" rx="5" fill={`rgba(29,111,66,${op})`}/>
      <text x="15" y="21" textAnchor="middle" fill="#fff" fontFamily="Arial" fontWeight="bold" fontSize="15">X</text>
    </svg>
  );

  return (
    <div style={{ fontFamily:"'Inter',sans-serif", background:"#F1F5F9", minHeight:"100vh", color:"#0f172a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        input,select{font-family:'Inter',sans-serif;}
        .inp{width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff;outline:none;}
        .inp:focus{border-color:#2F5597;box-shadow:0 0 0 3px rgba(47,85,151,.12);}
        .btn{display:inline-flex;align-items:center;gap:6px;border:none;border-radius:9px;padding:8px 13px;font-size:13px;font-weight:600;cursor:pointer;}
        .lbl{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;}
        .acard{transition:transform .14s,box-shadow .14s;}
        .acard:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.11)!important;}

        .hv-header{width:100%;height:80px;background:linear-gradient(90deg,#001b4d 0%,#003d8f 100%);display:flex;align-items:center;justify-content:space-between;padding:0 48px;}
        .hv-header-left,.hv-header-right{display:flex;align-items:center;gap:20px;}
        .hv-logo{height:42px;}
        .hv-divider{height:42px;width:1px;background:rgba(255,255,255,.35);}
        .hv-product{font-size:20px;font-weight:700;color:white;}
        .hv-product span{color:#ff7900;}
        .hv-status{height:40px;display:flex;align-items:center;gap:9px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.05);color:white;font-weight:700;font-size:13px;}
        .hv-status-dot{width:9px;height:9px;background:#22c55e;border-radius:50%;}
        .hv-title-area{padding:28px 0 20px;background:#f5f7fb;max-width:1008px;margin:0 auto;}
        .hv-title-box{background:linear-gradient(90deg,#001b4d 0%,#003d8f 100%);border-radius:16px;padding:0 36px;height:105px;display:flex;align-items:center;gap:36px;color:white;box-shadow:0 12px 30px rgba(0,0,0,.12);}
        .hv-back-btn{height:48px;padding:0 24px;border-radius:10px;border:1px solid rgba(255,255,255,.5);background:transparent;color:white;font-size:14px;font-weight:700;cursor:pointer;transition:.2s;white-space:nowrap;font-family:'Inter',sans-serif;}
        .hv-back-btn:hover{background:rgba(255,255,255,.12);}
        .hv-title-box h1{font-size:26px;font-weight:800;margin-bottom:6px;}
        .hv-title-box p{font-size:14px;opacity:.82;}
        @media(max-width:900px){
          .hv-header{padding:0 20px;height:auto;min-height:64px;flex-wrap:wrap;gap:10px;padding-top:12px;padding-bottom:12px;}
          .hv-product{font-size:15px;}
          .hv-status{display:none;}
          .hv-title-area{padding:16px 16px 12px;}
          .hv-title-box{height:auto;padding:24px;flex-direction:column;align-items:flex-start;gap:16px;}
          .hv-title-box h1{font-size:20px;}
        }
      `}</style>

      {/* ── PRIMEIRA BARRA ── */}
      <header className="hv-header">
        <div className="hv-header-left">
          <img src="/logo-hapvida.png" className="hv-logo" alt="Hapvida"
            onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
          <span style={{ display:'none', color:'white', fontWeight:800, fontSize:18 }}>Hapvida</span>
          <div className="hv-divider" />
          <div className="hv-product">Plataforma | <span>Governança TI</span></div>
        </div>
        <div className="hv-header-right">
          {hasProjects && (
            <div className="hv-status">
              <span className="hv-status-dot" />
              {existingProjects.length} projeto{existingProjects.length!==1?'s':''} salvos
            </div>
          )}
          <UserBar />
        </div>
      </header>

      {/* ── SEGUNDA BARRA ── */}
      <section className="hv-title-area">
        <div className="hv-title-box">
          {onVoltar && (
            <button className="hv-back-btn" onClick={onVoltar}>← Voltar ao início</button>
          )}
          <div>
            <h1>Status Semanal · Filtros e Importações</h1>
            <p>Otimização do fluxo de atualização do Status Report</p>
          </div>
        </div>
      </section>

      <div style={{ padding:"22px 28px", maxWidth:1060, margin:"0 auto" }}>

        {/* ── Row: Box 1 + Box 2 lado a lado ── */}
        <div style={{ display:"flex", gap:12, marginBottom:12, alignItems:"stretch" }}>

          {/* Box 1: Importar Portfólio */}
          <div style={{ flex:"0 0 420px", background:"#fff", borderRadius:14, padding:"20px 24px", boxShadow:"0 1px 4px rgba(0,0,0,.08)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, borderBottom:"1px solid #E2E8F0", paddingBottom:13, marginBottom:16 }}>
            <Upload size={16} color="#2F5597" />
            <h2 style={{ fontFamily:"'Inter',sans-serif", fontSize:15, fontWeight:700, color:"#1E293B", margin:0 }}>Importar Portfólio</h2>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display:"none" }} />
          {!hasPortfolio ? (
            <div onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)} onDrop={onDrop}
              style={{ border:`2px dashed ${dragging?"#2F5597":"#CBD5E1"}`, borderRadius:12,
                background:dragging?"#EFF6FF":"#F8FAFC", padding:"34px 20px",
                display:"flex", flexDirection:"column", alignItems:"center", gap:7,
                cursor:"pointer", transition:"all .18s" }}>
              <div style={{ width:50, height:50, borderRadius:"50%", background:"#fff", boxShadow:"0 2px 8px rgba(0,0,0,.10)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:2 }}>
                <ExcelIcon size={27} />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:"#1E293B" }}>{loading?"Carregando…":"Arraste seu arquivo aqui"}</div>
              <div style={{ fontSize:12, color:"#64748B", textAlign:"center" }}>ou clique para selecionar um arquivo Excel (.xlsx, .xls)</div>
              <button className="btn" style={{ marginTop:3, background:"#2F5597", color:"#fff", fontSize:13, padding:"8px 20px", pointerEvents:"none" }}>
                <Upload size={14} />Selecionar Arquivo
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", alignItems:"center", gap:12, background:"#F0FDF4", border:"1px solid #86EFAC", borderRadius:10, padding:"11px 16px" }}>
              <div style={{ width:36, height:36, borderRadius:8, background:"#16A34A", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <ExcelIcon size={20} op={0.3} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:"#15803D" }}>✓ Portfólio carregado</div>
                <div style={{ fontSize:11.5, color:"#16A34A", marginTop:1 }}>{portfolioRows.length} linhas importadas</div>
              </div>
              <button onClick={e=>{e.stopPropagation();fileRef.current?.click();}} className="btn"
                style={{ background:"#fff", color:"#15803D", border:"1px solid #86EFAC", fontSize:12, padding:"5px 12px" }}>
                Trocar arquivo
              </button>
            </div>
          )}
          </div>

          {/* Box 2: Portfólio Ativo */}
          <div style={{ flex:1, background:hasPortfolio?"#fff":"#F8FAFC", borderRadius:14, padding:"20px 24px",
            border:hasPortfolio?"1px solid #E2E8F0":"1px dashed #CBD5E1",
            boxShadow:hasPortfolio?"0 1px 4px rgba(0,0,0,.07)":"none",
            display:"flex", flexDirection:"column", justifyContent:"center", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:hasPortfolio?"#EFF6FF":"#F1F5F9", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {hasPortfolio ? <ClipboardList size={20} color="#2F5597"/> : <FolderOpen size={20} color="#94A3B8"/>}
            </div>
            <div>
              <div style={{ fontSize:10.5, fontWeight:600, color:"#94A3B8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:1 }}>Portfólio Ativo</div>
              <div style={{ fontSize:14, fontWeight:700, color:hasPortfolio?"#1E293B":"#94A3B8" }}>
                {hasPortfolio?`${validRows.length} projeto${validRows.length!==1?'s':''} prontos para seleção`:"Nenhum portfólio importado"}
              </div>
            </div>
          </div>
          {hasPortfolio && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[
                { label:"Disponíveis para report", value:validRows.length, unit:"projetos", color:"#2F5597" },
                ...(importedAt?[{ label:"Importado em", value:importedAt, unit:"", color:"#64748B" }]:[]),
                ...(hasProjects?[{ label:"No report atual", value:existingProjects.length, unit:"projetos", color:"#F47B20" }]:[]),
              ].map((s,i)=>(
                <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"#F8FAFC", borderRadius:8, border:"1px solid #F1F5F9" }}>
                  <span style={{ fontSize:12, color:"#64748B" }}>{s.label}</span>
                  <span style={{ fontSize:14, fontWeight:800, color:s.color }}>{s.value}{s.unit&&<span style={{ fontSize:11, fontWeight:500, color:"#94A3B8", marginLeft:4 }}>{s.unit}</span>}</span>
                </div>
              ))}
            </div>
          )}
          </div>

        </div>{/* fim row */}

        {/* ── Box 3: Ações ── */}
        <div style={{ background:"#fff", borderRadius:14, padding:"20px 24px", boxShadow:"0 1px 4px rgba(0,0,0,.08)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, borderBottom:"1px solid #E2E8F0", paddingBottom:13, marginBottom:18 }}>
            <Zap size={15} color="#F47B20"/>
            <h2 style={{ fontFamily:"'Inter',sans-serif", fontSize:15, fontWeight:700, color:"#1E293B", margin:0 }}>Ações</h2>
          </div>

          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>

            {/* Selecionar Projetos */}
            {[
              { key:'selecionar', icon:'🔍', cor:'#2F5597', bg:'#EFF6FF',
                titulo:'Selecionar Projetos',
                desc:'Filtre por SM, trimestre ou compromisso e escolha os projetos para o report',
                badge: selected.size>0 ? `${selected.size} selecionado${selected.size!==1?'s':''}` : (hasPortfolio||manualProjects.length>0?`${allSelectable.length} disponíveis`:null),
                badgeCor: selected.size>0?'#EFF6FF':'#F1F5F9', textCor: selected.size>0?'#2F5597':'#64748B',
                disabled: !hasPortfolio && manualProjects.length===0,
                onClick: ()=>setExpanded(e=>e==='selecionar'?null:'selecionar'),
                active: expanded==='selecionar' },
              { key:'manual', icon:'➕', cor:'#7030A0', bg:'#F5F0FF',
                titulo:'Incluir Projeto Manual',
                desc:'Adicione projetos que não estão no portfólio importado — 100% manual',
                badge: manualProjects.length>0?`${manualProjects.length} adicionado${manualProjects.length!==1?'s':''}`:null,
                badgeCor:'#F5F0FF', textCor:'#7030A0',
                disabled: false,
                onClick: ()=>setExpanded(e=>e==='manual'?null:'manual'),
                active: expanded==='manual' },
              { key:'atualizar', icon:'✏️', cor:'#F47B20', bg:'#FFF7ED',
                titulo:'Atualizar Report',
                desc:'Edite marcos, cronogramas e pontos de atenção de cada projeto selecionado',
                badge: hasProjects?`${existingProjects.length} projeto${existingProjects.length!==1?'s':''}`:null,
                badgeCor:'#FFF7ED', textCor:'#F47B20',
                disabled: !hasProjects,
                onClick: hasProjects?()=>{ setAtualizarSelected(new Set(existingProjects.map(p=>p.id))); setExpanded(e=>e==='atualizar'?null:'atualizar'); }:undefined,
                active: expanded==='atualizar' },
              { key:'gerar', icon:'📥', cor:'#16A34A', bg:'#F0FDF4',
                titulo:'Gerar Report',
                desc:'Selecione e baixe o PPTX dos projetos salvos em slides separados',
                badge: hasProjects?`${existingProjects.length} slide${existingProjects.length!==1?'s':''}`:null,
                badgeCor:'#F0FDF4', textCor:'#16A34A',
                disabled: !hasProjects,
                onClick: hasProjects?()=>{ setGerarSelected(new Set(existingProjects.map(p=>p.id))); setExpanded(e=>e==='gerar'?null:'gerar'); }:undefined,
                active: expanded==='gerar' },
            ].map(a=>(
              <div key={a.key} className="acard" onClick={a.disabled?undefined:a.onClick}
                style={{ flex:1, minWidth:190, background:'#fff', borderRadius:12, padding:'18px 18px 16px',
                  border:`2px solid ${a.active?a.cor:'#E2E8F0'}`,
                  boxShadow:a.active?`0 0 0 3px ${a.cor}22`:'0 1px 2px rgba(0,0,0,.06)',
                  cursor:a.disabled?'not-allowed':'pointer', opacity:a.disabled?.42:1,
                  display:'flex', flexDirection:'column', gap:9 }}>
                <div style={{ width:42, height:42, borderRadius:11, background:a.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {a.key==='selecionar'?<Search size={20} color={a.cor}/>:a.key==='manual'?<Plus size={20} color={a.cor}/>:a.key==='atualizar'?<Edit2 size={20} color={a.cor}/>:a.key==='gerar'?<Download size={20} color={a.cor}/>:<span style={{fontSize:20}}>{a.icon}</span>}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:13.5, color:'#1E293B', marginBottom:3 }}>{a.titulo}</div>
                  <div style={{ fontSize:12, color:'#64748B', lineHeight:1.45 }}>{a.desc}</div>
                </div>
                {a.badge && (
                  <div style={{ marginTop:'auto', display:'inline-flex', alignItems:'center', background:a.badgeCor, borderRadius:20, padding:'3px 10px', fontSize:11.5, fontWeight:700, color:a.textCor, alignSelf:'flex-start' }}>
                    {a.badge}
                  </div>
                )}
                
              </div>
            ))}
          </div>

          {/* Painel: Selecionar Projetos */}
          {expanded==='selecionar' && (hasPortfolio || manualProjects.length>0) && (
            <div style={{ marginTop:18, borderTop:'1px solid #E2E8F0', paddingTop:18 }}>
              <div style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:700, color:"#1E293B", marginBottom:11 }}>Filtros</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:8 }}>
                {/* filtro tipo */}
                <div style={{ minWidth:140 }}>
                  <div className="lbl">Tipo</div>
                  <select className="inp" value={filters.tipo} onChange={e=>setFilters(f=>({...f,tipo:e.target.value}))}>
                    <option value="todos">Todos</option>
                    <option value="importados">Importados</option>
                    <option value="manuais">Manuais</option>
                  </select>
                </div>
                {/* filtros de portfólio só aparecem quando relevante */}
                {filters.tipo !== 'manuais' && hasPortfolio && [['SM/PMO','sm',smOpts],['Trimestre','trimestre',trOpts],['Compromisso','compromisso',coOpts]].map(([lbl,key,opts])=>(
                  <div key={key} style={{ flex:1, minWidth:140 }}>
                    <div className="lbl">{lbl}</div>
                    <select className="inp" value={filters[key]} onChange={e=>{setFilters(f=>({...f,[key]:e.target.value}));setSelected(new Set());}}>
                      <option value="">Todos</option>
                      {opts.map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:12 }}>
                {allSelectable.length} projeto{allSelectable.length!==1?'s':''} disponíveis
                {(filters.sm||filters.trimestre||filters.compromisso)&&filters.tipo!=='manuais'?' (com filtros aplicados)':''}
              </div>
              {allSelectable.length > 0 && (
                <>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:700, color:"#1E293B" }}>Projetos disponíveis</div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <button className="btn" onClick={toggleAll} style={{ background:"#F1F5F9", color:"#334155", fontSize:12 }}>
                        {selected.size===allSelectable.length?"Desmarcar todos":"Selecionar todos"}
                      </button>
                      <button className="btn" onClick={handleSelecionarParaAtualizar} disabled={selected.size===0}
                        style={{ background:"#2F5597", color:"#fff", border:"none", opacity:selected.size===0?.45:1, fontSize:12 }}>
                        ✔ Selecionar para atualizar ({selected.size})
                      </button>
                      <button className="btn" onClick={handleAtualizarAgora} disabled={selected.size===0}
                        style={{ background:"#F47B20", color:"#fff", opacity:selected.size===0?.45:1, fontSize:12 }}>
                        <ChevronRight size={13} />Atualizar agora ({selected.size})
                      </button>
                    </div>
                  </div>
                  <div style={{ maxHeight:340, overflowY:"auto" }}>
                    {allSelectable.map(x=>{
                      const isSaved=existingProjects.some(p=>p.id===x.key);
                      return(
                        <div key={x.key} onClick={()=>toggle(x.key)} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 11px", borderRadius:8, marginBottom:4, cursor:"pointer",
                          background:selected.has(x.key)?"#EEF4FF":"#FAFBFC", border:`1px solid ${selected.has(x.key)?"#2F5597":"#E2E8F0"}`, transition:"all .12s" }}>
                          <input type="checkbox" checked={selected.has(x.key)} onChange={()=>toggle(x.key)} onClick={e=>e.stopPropagation()} />
                          <span style={{ fontWeight:600, color:"#1E293B", flex:1, fontSize:12.5 }}>{x.nome}</span>
                          <span style={{ fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>{x.id||'—'}</span>
                          <span style={{ fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>{x.trimestre}</span>
                          <span style={{ fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>{x.compromisso}</span>
                          {x.type==='manual'&&<span style={{ fontSize:10, background:"#F5F0FF", color:"#7030A0", borderRadius:6, padding:"2px 6px", fontWeight:700 }}>MANUAL</span>}
                          {isSaved&&<span style={{ fontSize:10, background:"#d1fae5", color:"#065f46", borderRadius:6, padding:"2px 6px", fontWeight:700 }}>SALVO</span>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Painel: Incluir Projeto Manual */}
          {expanded==='manual' && (
            <div style={{ marginTop:18, borderTop:'1px solid #E2E8F0', paddingTop:18 }}>
              <div style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:700, color:"#1E293B", marginBottom:14 }}>Novo projeto manual</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
                <div style={{ gridColumn:"1 / -1" }}>
                  <div className="lbl">Nome do projeto *</div>
                  <input className="inp" placeholder="Nome do projeto" value={manualForm.nome} onChange={e=>setManualForm(f=>({...f,nome:e.target.value}))} />
                </div>
                <div><div className="lbl">SM/PMO</div><input className="inp" placeholder="Responsável" value={manualForm.smPmo} onChange={e=>setManualForm(f=>({...f,smPmo:e.target.value}))} /></div>
                <div><div className="lbl">Lecom</div><input className="inp" placeholder="ID Lecom" value={manualForm.resumoLecom} onChange={e=>setManualForm(f=>({...f,resumoLecom:e.target.value}))} /></div>
                <div><div className="lbl">Área Cliente</div><input className="inp" placeholder="Área" value={manualForm.areaCliente} onChange={e=>setManualForm(f=>({...f,areaCliente:e.target.value}))} /></div>
                <div style={{ gridColumn:"1 / span 2" }}><div className="lbl">Área Executora</div><input className="inp" placeholder="Área executora" value={manualForm.areaExec} onChange={e=>setManualForm(f=>({...f,areaExec:e.target.value}))} /></div>
              </div>
              <button className="btn" onClick={saveManual} disabled={!manualForm.nome.trim()}
                style={{ background:"#7030A0", color:"#fff", opacity:manualForm.nome.trim()?1:.5 }}>
                ➕ Salvar projeto
              </button>

              
              {manualProjects.length > 0 && (
                <div style={{ marginTop:20, borderTop:'1px solid #E2E8F0', paddingTop:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, gap:12, flexWrap:"wrap" }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#64748B" }}>
                      Projetos manuais adicionados ({manualSelected.size} de {manualProjects.length})
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <input type="text" placeholder="🔍 Filtrar por nome..." value={filtroManual} onChange={e=>setFiltroManual(e.target.value)}
                        style={{ padding:"6px 10px", borderRadius:6, border:"1px solid #CBD5E1", fontSize:12, width:180 }} />
                      <button className="btn" onClick={toggleManualAll} style={{ background:"#F1F5F9", color:"#334155", fontSize:12 }}>
                        {manualSelected.size===manualProjects.filter(m=>!filtroManual||(m.nome||'').toLowerCase().includes(filtroManual.toLowerCase())).length && manualSelected.size>0 ? "Desmarcar todos" : "Selecionar todos"}
                      </button>
                      <button className="btn" onClick={handleManualAtualizarAgora} disabled={manualSelected.size===0}
                        style={{ background:"#7030A0", color:"#fff", opacity:manualSelected.size===0?.45:1, fontSize:12 }}>
                        ✏️ Atualizar agora ({manualSelected.size})
                      </button>
                    </div>
                  </div>
                  <div style={{ maxHeight:320, overflowY:"auto" }}>
                    {manualProjects
                      .filter(m => !filtroManual || (m.nome||'').toLowerCase().includes(filtroManual.toLowerCase()))
                      .map(m=>(
                      <div key={m.id} onClick={()=>toggleManual(m.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 11px", borderRadius:8, marginBottom:4, cursor:"pointer",
                        background:manualSelected.has(m.id)?"#EDE0FA":"#F5F0FF", border:`1px solid ${manualSelected.has(m.id)?"#7030A0":"#D8B4FE"}`, transition:"all .12s" }}>
                        <input type="checkbox" checked={manualSelected.has(m.id)} onChange={()=>toggleManual(m.id)} onClick={e=>e.stopPropagation()} />
                        <span style={{ fontWeight:600, color:"#1E293B", flex:1, fontSize:12.5 }}>{m.nome}</span>
                        {m.smPmo&&<span style={{ fontSize:11, color:"#7030A0", whiteSpace:"nowrap" }}>{m.smPmo}</span>}
                        {m.resumoLecom&&<span style={{ fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>{m.resumoLecom}</span>}
                        <button onClick={e=>{ e.stopPropagation(); if (window.confirm(`Remover "${m.nome}" da lista de manuais?\n\n(Se já foi levado ao relatório, o relatório mantém.)`)) { removeManual(m.id); setManualSelected(s=>{ const ns=new Set(s); ns.delete(m.id); return ns; }); } }}
                          title="Remover da lista de manuais"
                          style={{ background:"none", border:"none", cursor:"pointer", color:"#EF4444", display:"flex", padding:2 }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              
            </div>
          )}

          {/* Painel: Atualizar Report — seleção de projetos */}
          {expanded==='atualizar' && hasProjects && (
            <div style={{ marginTop:18, borderTop:'1px solid #E2E8F0', paddingTop:18 }}>

              
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, gap:12, flexWrap:"wrap" }}>
                <div style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:700, color:"#1E293B" }}>
                  Selecione os projetos para editar ({atualizarSelected.size} de {existingProjects.length})
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <input type="text" placeholder="🔍 Filtrar por nome..." value={filtroAtualizar} onChange={e=>setFiltroAtualizar(e.target.value)}
                    style={{ padding:"6px 10px", borderRadius:6, border:"1px solid #CBD5E1", fontSize:12, width:180 }} />
                  <button className="btn" onClick={toggleAtualizarAll} style={{ background:"#F1F5F9", color:"#334155", fontSize:12 }}>
                    {atualizarSelected.size===existingProjects.length?"Desmarcar todos":"Selecionar todos"}
                  </button>
                  <button className="btn" onClick={handleAtualizarDoPainel} disabled={atualizarSelected.size===0}
                    style={{ background:"#F47B20", color:"#fff", opacity:atualizarSelected.size===0?.45:1, fontSize:12 }}>
                    ✏️ Atualizar agora ({atualizarSelected.size})
                  </button>
                </div>
              </div>
              <div style={{ maxHeight:320, overflowY:"auto" }}>
                {existingProjects
                  .filter(p => !filtroAtualizar || (p.projeto?.nome||'').toLowerCase().includes(filtroAtualizar.toLowerCase()))
                  .map(p=>(
                  <div key={p.id} onClick={()=>toggleAtualizar(p.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 11px", borderRadius:8, marginBottom:4, cursor:"pointer",
                    background:atualizarSelected.has(p.id)?"#FFF7ED":"#FAFBFC", border:`1px solid ${atualizarSelected.has(p.id)?"#F47B20":"#E2E8F0"}`, transition:"all .12s" }}>
                    <input type="checkbox" checked={atualizarSelected.has(p.id)} onChange={()=>toggleAtualizar(p.id)} onClick={e=>e.stopPropagation()} />
                    <span style={{ fontWeight:600, color:"#1E293B", flex:1, fontSize:12.5 }}>{p.projeto?.nome||'(sem nome)'}</span>
                    {p.projeto?.smPmo&&<span style={{ fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>{p.projeto.smPmo}</span>}
                    <span style={{ fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>{p.raias?.length||0} raia{p.raias?.length!==1?'s':''}</span>
                    {p.id?.startsWith('manual:')&&<span style={{ fontSize:10, background:"#F5F0FF", color:"#7030A0", borderRadius:6, padding:"2px 6px", fontWeight:700 }}>MANUAL</span>}
                    <button onClick={e=>{ e.stopPropagation(); handleDelete(p.id, p.projeto?.nome||'projeto'); }}
                      title="Excluir permanentemente"
                      style={{ background:"none", border:"none", cursor:"pointer", color:"#EF4444", display:"flex", padding:2 }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

      
            </div>
          )}

          {/* Painel: Gerar Report — seleção de projetos */}
          {expanded==='gerar' && hasProjects && (
            <div style={{ marginTop:18, borderTop:'1px solid #E2E8F0', paddingTop:18 }}>
              
              
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, gap:12, flexWrap:"wrap" }}>
                <div style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:700, color:"#1E293B" }}>
                  Selecione os projetos para gerar ({gerarSelected.size} de {existingProjects.length})
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <input type="text" placeholder="🔍 Filtrar por nome..." value={filtroGerar} onChange={e=>setFiltroGerar(e.target.value)}
                    style={{ padding:"6px 10px", borderRadius:6, border:"1px solid #CBD5E1", fontSize:12, width:180 }} />
                  <button className="btn" onClick={toggleGerarAll} style={{ background:"#F1F5F9", color:"#334155", fontSize:12 }}>
                    {gerarSelected.size===existingProjects.length?"Desmarcar todos":"Selecionar todos"}
                  </button>
                  <button className="btn" onClick={handleGerar} disabled={gerarSelected.size===0}
                    style={{ background:"#16A34A", color:"#fff", opacity:gerarSelected.size===0?.45:1, fontSize:12 }}>
                    📥 Gerar PPTX ({gerarSelected.size} slide{gerarSelected.size!==1?'s':''})
                  </button>
                </div>
              </div>
              <div style={{ maxHeight:320, overflowY:"auto" }}>
                {existingProjects
                  .filter(p => !filtroGerar || (p.projeto?.nome||'').toLowerCase().includes(filtroGerar.toLowerCase()))
                  .map(p=>(
                  <div key={p.id} onClick={()=>toggleGerar(p.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 11px", borderRadius:8, marginBottom:4, cursor:"pointer",
                    background:gerarSelected.has(p.id)?"#F0FDF4":"#FAFBFC", border:`1px solid ${gerarSelected.has(p.id)?"#16A34A":"#E2E8F0"}`, transition:"all .12s" }}>
                    <input type="checkbox" checked={gerarSelected.has(p.id)} onChange={()=>toggleGerar(p.id)} onClick={e=>e.stopPropagation()} />
                    <span style={{ fontWeight:600, color:"#1E293B", flex:1, fontSize:12.5 }}>{p.projeto?.nome||'(sem nome)'}</span>
                    {p.projeto?.smPmo&&<span style={{ fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>{p.projeto.smPmo}</span>}
                    <span style={{ fontSize:11, color:"#64748b", whiteSpace:"nowrap" }}>{p.raias?.length||0} raia{p.raias?.length!==1?'s':''}</span>
                    <button onClick={e=>{ e.stopPropagation(); handleDelete(p.id, p.projeto?.nome||'projeto'); }}
                      title="Excluir permanentemente"
                      style={{ background:"none", border:"none", cursor:"pointer", color:"#EF4444", display:"flex", padding:2 }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

                
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// =====================================================================
//  TELA 2 — ReportScreen (paginação multi-projeto)
// =====================================================================
function ReportScreen({ projects, setProjects, currentIdx, setCurrentIdx, activeProjectIds, setActiveProjectIds, saved, gerando, setGerando, onBack, onVoltar, salvarManual }) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mesInicio = Math.floor(hoje.getMonth() / 3) * 3 + 1;
  const trimVigente = Math.floor(hoje.getMonth() / 3) + 1;
  const qLabel = (offset) => {
    const abs = ano * 4 + (trimVigente - 1) + offset;
    const y = Math.floor(abs / 4), qi = ((abs % 4) + 4) % 4;
    return `${qi + 1}T/${y}`;
  };

  // projetos visíveis na tela 2 (filtrados se vier de "Atualizar agora" com seleção)
  const visibleProjects = useMemo(() =>
    activeProjectIds ? projects.filter(p => activeProjectIds.has(p.id)) : projects,
  [projects, activeProjectIds]);

  // currentIdx aponta dentro de visibleProjects; para editar, mapeia para índice real em projects
  const realIdx = useMemo(() => {
    const vp = visibleProjects[currentIdx];
    if (!vp) return 0;
    return projects.findIndex(p => p.id === vp.id);
  }, [visibleProjects, currentIdx, projects]);

  const [aberta, setAberta] = useState({});
  useEffect(() => setAberta({}), [currentIdx]);

  const proj = projects[realIdx];
  const projeto = proj?.projeto || defaultProjeto();
  const raias = proj?.raias || [];
  const nFuturos = proj?.nFuturos ?? 1;
  const nPassados = proj?.nPassados ?? 0;
  const setNFuturos = (v) => setProjects(ps => ps.map((p,i) => i===realIdx ? {...p, nFuturos: typeof v==='function'?v(p.nFuturos??1):v} : p));
  const setNPassados = (v) => setProjects(ps => ps.map((p,i) => i===realIdx ? {...p, nPassados: typeof v==='function'?v(p.nPassados??0):v} : p));

  const setProjeto = (p) => setProjects(ps => ps.map((x, i) => i === realIdx ? { ...x, projeto: p } : x));
  const setRaias = (updater) => setProjects(ps => ps.map((x, i) => i === realIdx ? { ...x, raias: typeof updater === 'function' ? updater(x.raias) : updater } : x));
  const usaPacotes = proj?.usaPacotes ?? false;
  const pacotes    = proj?.pacotes ?? [];
  const setPacotes = (upd) => setProjects(ps => ps.map((p,i) => i===realIdx ? {...p, pacotes: typeof upd==='function'?upd(p.pacotes??[]):upd} : p));

  const togglePacotes = () => {
    if (usaPacotes) {
      setProjects(ps => ps.map((p,i) => i===realIdx ? {...p, usaPacotes:false} : p));
    } else {
      const pid = `pac-${Date.now()}`;
      setProjects(ps => ps.map((p,i) => i===realIdx ? {...p, usaPacotes:true, pacotes:[{id:pid, nome:'Pacote 1', raiaIds:raias.map(r=>r.id)}]} : p));
    }
  };
  const addPacote = () => {
    const pid = `pac-${Date.now()}`;
    setPacotes(ps => [...ps, {id:pid, nome:`Pacote ${ps.length+1}`, raiaIds:[]}]);
  };
  const delPacote = (pid) => setPacotes(ps => ps.filter(p => p.id !== pid));
  const renomearPacote = (pid, nome) => setPacotes(ps => ps.map(p => p.id===pid ? {...p,nome} : p));

  const upd = (id, patch) => setRaias(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const updFase = (id, fi, patch) => setRaias(rs => rs.map(r => r.id === id ? { ...r, fases: r.fases.map((f, i) => i === fi ? { ...f, ...patch } : f) } : r));
  const addRaia = () => {
    const id = Date.now();
    //setRaias(rs => [...rs, { id, lecom: '', nome: 'NOVA DEMANDA', despriorizado: false, faseAtivaIdx: 0, fases: [{ fase: ORDEM_FASES[0], inicio: '', fim: '', pct: 0 }] }]);
    setRaias(rs => [...rs, { id, lecom: '', nome: 'NOVA DEMANDA', despriorizado: false, fases: [{ fase: ORDEM_FASES[0], inicio: '', fim: '', pct: 0 }] }]);
    setAberta(a => ({ ...a, [id]: true }));
  };
  const addRaiaToPacote = (pid) => {
    const id = Date.now();
    //setRaias(rs => [...rs, { id, lecom:'', nome:'NOVA DEMANDA', despriorizado:false, faseAtivaIdx:0, fases:[{fase:ORDEM_FASES[0],inicio:'',fim:'',pct:0}] }]);
    setRaias(rs => [...rs, { id, lecom:'', nome:'NOVA DEMANDA', despriorizado:false, fases:[{fase:ORDEM_FASES[0],inicio:'',fim:'',pct:0}] }]);
    setPacotes(ps => ps.map(p => p.id===pid ? {...p, raiaIds:[...p.raiaIds, id]} : p));
    setAberta(a => ({ ...a, [id]: true }));
  };
  const delRaia = (id) => {
    setRaias(rs => rs.filter(r => r.id !== id));
    setPacotes(ps => ps.map(p => ({...p, raiaIds: p.raiaIds.filter(rid => rid !== id)})));
  };
  const addFase = (id) => setRaias(rs => rs.map(r => r.id === id ? { ...r, fases: [...r.fases, { fase: ORDEM_FASES[Math.min(r.fases.length, ORDEM_FASES.length - 1)], inicio: '', fim: '', pct: 0 }] } : r));
  const delFase = (id, fi) => setRaias(rs => rs.map(r => r.id === id ? { ...r, fases: r.fases.filter((_, i) => i !== fi) } : r));
  const moveFase = (id, fi, direcao) => setRaias(rs => rs.map(r => {
    if (r.id !== id) return r;
    const novoIdx = fi + direcao;
    if (novoIdx < 0 || novoIdx >= r.fases.length) return r;
    const novasFases = [...r.fases];
    [novasFases[fi], novasFases[novoIdx]] = [novasFases[novoIdx], novasFases[fi]];
    return { ...r, fases: novasFases };
  }));

  const timeline = useMemo(() => buildTimeline(ano, mesInicio, nFuturos, nPassados), [ano, mesInicio, nFuturos, nPassados]);
  const hojeFrac = dateToFrac(projeto.atualizadoEm, timeline.cells);

  const meses = [];
  timeline.cells.forEach((c) => {
    const last = meses[meses.length - 1];
    const key = c.futuro ? c.label : c.mesLabel;
    if (last && last.key === key && !c.futuro) last.span += 1;
    else meses.push({ key, label: c.futuro ? "" : c.mesLabel, span: 1, futuro: c.futuro });
  });

  const gerarPptx = async () => {
    setGerando(true);
    try {
      await new Promise(r => setTimeout(r, 20));
      baixarPptx(visibleProjects);
    } catch (e) { console.error(e); alert("Erro ao gerar o PPTX: " + e.message); }
    setGerando(false);
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#F1F5F9", minHeight: "100vh", color: "#0f172a" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        input,select,textarea{font-family:'Inter',sans-serif;}
        .inp{width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff;outline:none;}
        .inp:focus{border-color:#2F5597;box-shadow:0 0 0 3px rgba(47,85,151,.12);}
        .btn{display:inline-flex;align-items:center;gap:6px;border:none;border-radius:9px;padding:8px 13px;font-size:13px;font-weight:600;cursor:pointer;}
        .lbl{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;}

        .hm-main-header{height:80px;width:100%;background:linear-gradient(90deg,#001b4d,#003d8f);display:flex;align-items:center;justify-content:space-between;padding:0 48px;}
        .hm-left,.hm-right{display:flex;align-items:center;gap:18px;}
        .hm-logo{height:44px;}
        .hm-divider-h{height:44px;width:1px;background:rgba(255,255,255,.35);}
        .hm-brand{font-size:20px;font-weight:700;color:white;}
        .hm-brand span{color:#ff7900;}
        .hm-autosave{display:flex;align-items:center;gap:8px;color:white;font-weight:600;font-size:13px;}
        .hm-dot{width:9px;height:9px;border-radius:50%;}
        .hm-hbtn{height:44px;padding:0 20px;border-radius:10px;border:1px solid rgba(255,255,255,.4);display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;}
        .hm-save{background:white;color:#003d8f;border:none;}
        .hm-ppt{background:#ff7900;color:white;border:none;}

        .hm-title-section{padding:24px 0 0;background:#f5f7fb;max-width:1310px;margin:0 auto;}
        .hm-title-card{background:linear-gradient(90deg,#001b4d,#003d8f);border-radius:16px;padding:0 40px;height:105px;display:flex;align-items:center;justify-content:space-between;color:white;box-shadow:0 12px 30px rgba(0,0,0,.12);}
        .hm-title-card h1{font-size:26px;font-weight:800;}
        .hm-navigation{display:flex;gap:14px;}
        .hm-nav-btn{height:50px;padding:0 26px;border-radius:10px;border:1px solid rgba(255,255,255,.5);background:transparent;color:white;font-size:14px;font-weight:700;cursor:pointer;transition:.2s;font-family:'Inter',sans-serif;white-space:nowrap;}
        .hm-nav-btn:hover{background:rgba(255,255,255,.12);}

        .hm-pagination-wrapper{padding:18px 0 4px;display:flex;justify-content:flex-end;align-items:center;gap:10px;background:#F1F5F9;max-width:1310px;margin:0 auto;}
        .hm-arrow-btn{background:none;border:none;font-size:26px;color:#001b4d;cursor:pointer;line-height:1;padding:0 4px;}
        .hm-arrow-btn:disabled{opacity:.3;cursor:not-allowed;}
        .hm-page-btn{width:42px;height:42px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#315a9a;color:white;font-weight:800;font-size:14px;border:none;cursor:pointer;transition:.2s;}
        .hm-page-btn.active{background:#001b4d;}
        .hm-page-btn:hover:not(.active){background:#003d8f;}

        @media(max-width:900px){
          .hm-main-header{padding:0 20px;height:auto;min-height:64px;flex-wrap:wrap;gap:10px;padding-top:12px;padding-bottom:12px;}
          .hm-brand{font-size:15px;}
          .hm-autosave{display:none;}
          .hm-title-section{padding:16px 16px 0;}
          .hm-title-card{height:auto;padding:24px;flex-direction:column;align-items:flex-start;gap:16px;}
          .hm-title-card h1{font-size:20px;}
          .hm-pagination-wrapper{padding:12px 16px 4px;}
        }
      `}</style>

      {/* ── BARRA 1: header principal ── */}
      <header className="hm-main-header">
        <div className="hm-left">
          <img src="/logo-hapvida.png" className="hm-logo" alt="Hapvida"
            onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
          <span style={{ display:'none', color:'white', fontWeight:800, fontSize:18 }}>Hapvida</span>
          <div className="hm-divider-h" />
          <div className="hm-brand">Plataforma | <span>Governança TI</span></div>
        </div>
        <div className="hm-right">
          <div className="hm-autosave">
            <span className="hm-dot" style={{ background: saved ? '#22c55e' : 'rgba(255,255,255,.4)' }} />
            {saved ? 'Salvo ✓' : 'auto-save ativo'}
          </div>
          <button className="hm-hbtn hm-save" onClick={salvarManual}><Save size={15} />Salvar</button>
          <button className="hm-hbtn hm-ppt" onClick={gerarPptx} disabled={gerando} style={{ opacity: gerando ? .65 : 1 }}>
            <FileDown size={15} />{gerando ? 'Gerando…' : `Gerar PPTX (${visibleProjects.length} slide${visibleProjects.length>1?'s':''})`}
          </button>
          <UserBar />
        </div>
      </header>

      {/* ── BARRA 2: título + navegação ── */}
      <section className="hm-title-section">
        <div className="hm-title-card">
          <h1>Status Semanal · Marcos e Cronogramas</h1>
          <div className="hm-navigation">
            {onVoltar && <button className="hm-nav-btn" onClick={onVoltar}>← Voltar ao início</button>}
            <button className="hm-nav-btn" onClick={onBack}>Filtros e Importações →</button>
          </div>
        </div>
      </section>

      {/* ── PAGINAÇÃO ── */}
      {visibleProjects.length > 0 && (
        <div className="hm-pagination-wrapper">
          {activeProjectIds && (
            <span style={{ fontSize:12, color:'#64748b', marginRight:'auto' }}>
              <ClipboardList size={12} style={{marginRight:4, verticalAlign:'middle'}}/>
              {visibleProjects.length} selecionado{visibleProjects.length!==1?'s':''} &nbsp;·&nbsp;
              <button onClick={() => setActiveProjectIds(null)} style={{ background:'none', border:'none', color:'#2F5597', cursor:'pointer', fontSize:12, textDecoration:'underline', padding:0 }}>
                ver todos ({projects.length})
              </button>
            </span>
          )}
          <span style={{ fontSize:13, color:'#64748b', marginRight:6, fontWeight:600 }}>
            {projeto.nome || `Projeto ${currentIdx+1}`}
          </span>
          <button className="hm-arrow-btn" disabled={currentIdx===0}
            onClick={() => setCurrentIdx(i => Math.max(0,i-1))}>‹</button>
          {visibleProjects.map((_,i) => (
            <button key={i} className={`hm-page-btn${i===currentIdx?' active':''}`}
              onClick={() => setCurrentIdx(i)}>{i+1}</button>
          ))}
          <button className="hm-arrow-btn" disabled={currentIdx===visibleProjects.length-1}
            onClick={() => setCurrentIdx(i => Math.min(visibleProjects.length-1,i+1))}>›</button>
        </div>
      )}

      <div style={{ padding: "20px 26px", maxWidth: 1360, margin: "0 auto" }}>

        {/* ---------- CABEÇALHO DO PROJETO ---------- */}
        <Section title="Cabeçalho do projeto">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <Field label="Nome do projeto"><input className="inp" value={projeto.nome} onChange={(e) => setProjeto({ ...projeto, nome: e.target.value })} /></Field>
            <Field label="SM/PMO"><input className="inp" value={projeto.smPmo||''} onChange={(e) => setProjeto({ ...projeto, smPmo: e.target.value })} /></Field>
            <Field label="Status geral">
              <select className="inp" value={projeto.statusGeral} onChange={(e) => setProjeto({ ...projeto, statusGeral: e.target.value })}>
                {Object.keys(STATUS_GERAL).map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Atualizado por"><input className="inp" value={projeto.atualizadoPor} onChange={(e) => setProjeto({ ...projeto, atualizadoPor: e.target.value })} /></Field>
            <Field label="Iniciado em"><input type="date" className="inp" value={projeto.iniciadoEm} onChange={(e) => setProjeto({ ...projeto, iniciadoEm: e.target.value })} /></Field>
            <Field label="Atualizado em"><input type="date" className="inp" value={projeto.atualizadoEm} onChange={(e) => setProjeto({ ...projeto, atualizadoEm: e.target.value })} /></Field>
            <Field label="Lecom"><input className="inp" value={projeto.resumoLecom} onChange={(e) => setProjeto({ ...projeto, resumoLecom: e.target.value })} /></Field>
            <Field label="Descrição (resumo)"><input className="inp" value={projeto.resumoDesc} onChange={(e) => setProjeto({ ...projeto, resumoDesc: e.target.value })} /></Field>
            <Field label="Área Cliente"><input className="inp" value={projeto.areaCliente} onChange={(e) => setProjeto({ ...projeto, areaCliente: e.target.value })} /></Field>
            <Field label="Diretor (cliente)"><input className="inp" value={projeto.dirCliente} onChange={(e) => setProjeto({ ...projeto, dirCliente: e.target.value })} /></Field>
            <Field label="Líder (cliente)"><input className="inp" value={projeto.lidCliente} onChange={(e) => setProjeto({ ...projeto, lidCliente: e.target.value })} /></Field>
            <div />
            <Field label="Área Executora"><input className="inp" value={projeto.areaExec} onChange={(e) => setProjeto({ ...projeto, areaExec: e.target.value })} /></Field>
            <Field label="Diretor (executor)"><input className="inp" value={projeto.dirExec} onChange={(e) => setProjeto({ ...projeto, dirExec: e.target.value })} /></Field>
            <Field label="Líder (executor)"><input className="inp" value={projeto.lidExec} onChange={(e) => setProjeto({ ...projeto, lidExec: e.target.value })} /></Field>
          </div>
        </Section>

        {/* ---------- PREVIEW ---------- */}
        <GanttPreview projeto={projeto} raias={raias} timeline={timeline} hojeFrac={hojeFrac} usaPacotes={usaPacotes} pacotes={pacotes} />

        {/* ---------- TIMELINE CONFIG ---------- */}
        <Section title="Linha do tempo">
          <p style={{ fontSize: 12.5, color: "#475569", margin: "0 0 12px" }}>
            O trimestre vigente é definido automaticamente pelo calendário. Escolha quantos trimestres anteriores e futuros incluir.
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <div className="lbl" style={{ marginBottom: 4 }}>Trimestre vigente (automático)</div>
              <div style={{ padding: "7px 12px", background: "#2F5597", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, display: "inline-block" }}>{qLabel(0)}</div>
            </div>
            
            <Field label="Trimestres anteriores">
              <select className="inp" style={{ width: 180 }} value={nPassados} onChange={(e) => setNPassados(+e.target.value)}>
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Nenhum" : `${qLabel(-n)} em diante`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Trimestres futuros">
              <select className="inp" style={{ width: 180 }} value={nFuturos} onChange={(e) => setNFuturos(+e.target.value)}>
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Nenhum" : `Até ${qLabel(n)}`}
                  </option>
                ))}
              </select>
            </Field>
            
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: "#334155" }}>
            <span style={{ fontWeight: 600 }}>Aparecerão: </span>
            {(() => {
              const v = [];
              for (let i = nPassados; i >= 1; i--) v.push(qLabel(-i));
              v.push(qLabel(0) + " (vigente)");
              for (let i = 1; i <= nFuturos; i++) v.push(qLabel(i));
              return v.join("  ·  ");
            })()}
          </div>
        </Section>

        {/* ---------- PONTOS DE ATENÇÃO (logo após a Linha do tempo) ---------- */}
        <Section title="Pontos de atenção">
          <textarea className="inp" rows={3} value={projeto.pontosAtencao} onChange={(e) => setProjeto({ ...projeto, pontosAtencao: e.target.value })} placeholder="Riscos, bloqueios, decisões pendentes…" />
        </Section>

        {/* ---------- RAIAS ---------- */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginTop: 16, boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#003B82", margin: 0 }}>Demandas / Marcos ({raias.length})</h2>
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn" onClick={togglePacotes}
                style={{ background: usaPacotes ? "#7030A0" : "#F1F5F9", color: usaPacotes ? "#fff" : "#334155", border: usaPacotes ? "none" : "1px solid #CBD5E1" }}>
                {usaPacotes ? <><Package size={14}/> Remover pacotes</> : <><Package size={14}/> Quebrar em pacotes</>}
              </button>
              {!usaPacotes && <button className="btn" onClick={addRaia} style={{ background: "#003B82", color: "#fff" }}><Plus size={15} />Adicionar demanda</button>}
              {usaPacotes  && <button className="btn" onClick={addPacote} style={{ background: "#003B82", color: "#fff" }}><Plus size={15} />Adicionar pacote</button>}
            </div>
          </div>

          {/* ── Modo flat (sem pacotes) ── */}
          {!usaPacotes && raias.map((r) => (
            <RaiaCard key={r.id} r={r} aberta={!!aberta[r.id]}
              toggle={() => setAberta((a) => ({ ...a, [r.id]: !a[r.id] }))}
              upd={upd} updFase={updFase} addFase={addFase} delFase={delFase} moveFase={moveFase} delRaia={delRaia} />
          ))}

          {/* ── Modo pacotes ── */}
          {usaPacotes && pacotes.map((pac, pi) => {
            const pacRaias = pac.raiaIds.map(id => raias.find(r => r.id === id)).filter(Boolean);
            const info = calcPacoteInfo(pac, pacRaias);
            const sCor = statusCor(info.status);
            return (
              <div key={pac.id} style={{ marginBottom: 16, border: "1.5px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
                {/* cabeçalho do pacote */}
                <div style={{ background: "#F8FAFF", borderBottom: "1.5px solid #E2E8F0", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Package size={18} color="#2F5597"/>
                  <input className="inp" style={{ flex:1, fontWeight:700, fontSize:14, background:"transparent", border:"none", boxShadow:"none", padding:"2px 4px" }}
                    value={pac.nome} onChange={e => renomearPacote(pac.id, e.target.value)} />
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexShrink:0 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:sCor }}>{info.status}</span>
                    <span style={{ fontSize:12, color:"#64748B" }}>{info.pctMedia}% concluído</span>
                    <span style={{ fontSize:11, color:"#94A3B8" }}>{pacRaias.length} demanda{pacRaias.length!==1?'s':''}</span>
                    <button className="btn" onClick={() => addRaiaToPacote(pac.id)} style={{ background:"#003B82", color:"#fff", fontSize:12, padding:"5px 10px" }}><Plus size={13}/>Demanda</button>
                    <button onClick={() => delPacote(pac.id)} title="Remover pacote" style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", fontSize:16 }}>✕</button>
                  </div>
                </div>
                {/* demandas do pacote */}
                <div style={{ padding:"8px 8px 4px" }}>
                  {pacRaias.length === 0 && (
                    <div style={{ textAlign:"center", padding:"18px 0", fontSize:13, color:"#94A3B8" }}>Nenhuma demanda neste pacote</div>
                  )}
                  {pacRaias.map(r => (
                    <RaiaCard key={r.id} r={r} aberta={!!aberta[r.id]}
                      toggle={() => setAberta(a => ({...a, [r.id]: !a[r.id]}))}
                      upd={upd} updFase={updFase} addFase={addFase} delFase={delFase} moveFase={moveFase} delRaia={delRaia} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
//  APP (roteador de telas)
// =====================================================================
export default function App() {
  const { user, profile, loading, signOut, isActive } = useAuth();

  // ── Aguardar carregamento da sessão ──
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F1F5F9' }}>
      <div style={{ color:'#003B82', fontSize:16, fontWeight:600 }}>Carregando…</div>
    </div>
  );

  // ── Não logado → tela de login ──
  if (!user) return <LoginScreen />;

  // ── Conta desativada ──
  if (profile && !isActive) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F1F5F9' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'40px 32px', maxWidth:380, textAlign:'center', boxShadow:'0 4px 24px rgba(0,0,0,.1)' }}>
        <div style={{ fontSize:18, fontWeight:700, color:'#DC2626', marginBottom:12 }}>Acesso suspenso</div>
        <div style={{ color:'#64748b', fontSize:14, marginBottom:24 }}>Sua conta está desativada. Entre em contato com o administrador.</div>
        <button onClick={signOut} style={{ background:'#003B82', color:'#fff', border:'none', borderRadius:8, padding:'10px 24px', cursor:'pointer', fontWeight:600 }}>Sair</button>
      </div>
    </div>
  );

  // ── Troca de senha obrigatória ──
  if (profile?.must_change_password) return <ChangePasswordModal />;

  return <AppGateway />;
}

// ── Tela Home (entre login e app) ────────────────────────────────────
function AppGateway() {
  const [destino, setDestino] = useState(() => sessionStorage.getItem('hap_destino') || null)

  function navegarPara(dest) {
    sessionStorage.setItem('hap_destino', dest)
    setDestino(dest)
  }
  function voltarHome() {
    sessionStorage.removeItem('hap_destino')
    sessionStorage.removeItem('hap_screen')
    setDestino(null)
  }

  if (!destino) return (
    <HomeScreen
      onAcessarPortfolio={() => navegarPara('portfolio')}
      onAcessarStatus={() => navegarPara('status')}
      onAcessarRas={() => navegarPara('ras')}
      onAcessarKanban={() => navegarPara('kanban')}
    />
  )
  

  if (destino === 'ras') return <ReportRasScreen onVoltar={voltarHome} />
  if (destino === 'kanban') return <KanbanScreen onBack={voltarHome} />
  return <AppContent initialScreen={destino} onVoltar={voltarHome} />
}

// ── Barra de usuário (header) ────────────────────────────────────────
function UserBar() {
  const { profile, signOut, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  // appScreen é controlado pelo AppContent — usamos evento customizado
  function goTo(screen) {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('hapvida:nav', { detail: screen }));
  }
  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:7, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'5px 12px', cursor:'pointer', color:'#fff', fontSize:13, fontWeight:600 }}>
        <User size={14} />
        {profile?.name || profile?.email || 'Usuário'}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', background:'#fff', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.15)', padding:8, minWidth:200, zIndex:100 }}>
          <div style={{ padding:'6px 12px', fontSize:12, color:'#94a3b8', borderBottom:'1px solid #f1f5f9', marginBottom:4 }}>{profile?.email}</div>
          {isAdmin && <>
            <button onClick={() => goTo('admin')}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', background:'none', border:'none', padding:'8px 12px', cursor:'pointer', color:'#334155', fontSize:13, borderRadius:6 }}>
              <Shield size={14} color="#7030A0" /> Gestão de Usuários
            </button>
            <button onClick={() => goTo('audit')}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', background:'none', border:'none', padding:'8px 12px', cursor:'pointer', color:'#334155', fontSize:13, borderRadius:6 }}>
              <Filter size={14} color="#2F5597" /> Auditoria
            </button>
            <div style={{ borderTop:'1px solid #f1f5f9', margin:'4px 0' }} />
          </>}
          <button onClick={() => { setOpen(false); signOut(); }}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', background:'none', border:'none', padding:'8px 12px', cursor:'pointer', color:'#DC2626', fontSize:13, borderRadius:6 }}>
            <LogOut size={14} /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

// ── App principal (conteúdo real) ────────────────────────────────────
function AppContent({ initialScreen, onVoltar }) {
  const { user, profile, isAdmin } = useAuth()
  // const [screen, setScreen] = useState(initialScreen === 'status' ? 'report' : 'import')
  const [screen, setScreen] = useState(() => sessionStorage.getItem('hap_screen') || 'import')

  // persistir screen ao mudar
  function navegarScreen(s) {
    sessionStorage.setItem('hap_screen', s)
    setScreen(s)
  }
  const [portfolioRows, setPortfolioRows] = useState([])
  const [importedAt, setImportedAt] = useState('')
  
  const [projects, setProjects] = useState([])
  const [manualProjects, setManualProjects] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)

  // Exclusão permanente: remove do state + Supabase + manualProjects (se aplicável).
  // Usado pelas lixeiras nos cards Manual, Atualizar Report e Gerar Report.
  const deleteProject = async (projectId) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('report_projects')
        .delete()
        .match({ project_id: projectId, user_id: user.id });
      if (error) {
        console.error('[DELETE] Erro Supabase:', error);
        alert(`❌ Erro ao excluir: ${error.message}`);
        return;
      }
      setProjects(prev => prev.filter(p => p.id !== projectId));
      // Nota: NÃO removemos de manualProjects aqui — a exclusão nas sessões
      // Atualizar/Gerar remove só do relatório. A remoção do card manual
      // é tratada separadamente pelo removeManual (deleta da lista de manuais).
      logAudit('DELETE_PROJECT', 'project', projectId, { via: 'ImportScreen' });
    } catch (e) {
      console.error('[DELETE] Erro geral:', e);
      alert(`❌ Erro ao excluir: ${e.message}`);
    }
  };
  
  const [activeProjectIds, setActiveProjectIds] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [appScreen, setAppScreen] = useState('main') // 'main' | 'admin' | 'audit'

  // ── Entrega 3: carregar dados do Supabase ──────────────────────
  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        console.log('[LOAD] Carregando projetos para user:', user.id)
        const { data, error } = await supabase
          .from('report_projects')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
        console.log('[LOAD] Projetos encontrados:', data?.length, 'erro:', error)
        if (error) alert(`Erro ao carregar projetos: ${error.message}`)
        if (data?.length) {
          const ps = data.map(row => ({
            id:        row.project_id,
            nFuturos:  row.n_futuros  ?? 1,
            nPassados: row.n_passados ?? 0,
            usaPacotes: !!row.usa_pacotes,
            projeto:   row.projeto_json   ? JSON.parse(row.projeto_json)  : {},
            raias:     row.raias_json     ? JSON.parse(row.raias_json)    : [],
            pacotes:   row.pacotes_json   ? JSON.parse(row.pacotes_json)  : [],
          }))
          setProjects(ps)
          // tela já controlada pelo sessionStorage — não redirecionar aqui
        }
        const { data: port, error: portErr } = await supabase
          .from('user_portfolio')
          .select('*')
          .eq('user_id', user.id)
          .single()
        console.log('[LOAD] Portfólio:', port?.rows_json?.length, 'erro:', portErr?.message)
        if (port?.rows_json) {
          setPortfolioRows(JSON.parse(port.rows_json))
          setImportedAt(port.imported_at || '')
        }
        // Carrega lista de projetos manuais persistidos
        const { data: mp, error: mpErr } = await supabase
          .from('user_manual_projects')
          .select('data')
          .eq('user_id', user.id)
          .single();
        if (mpErr && mpErr.code !== 'PGRST116') console.warn('[LOAD] Manual projects:', mpErr.message);
        if (mp?.data) setManualProjects(mp.data);
      } catch(e) {
        console.error('[LOAD] Erro geral:', e)
        alert(`Erro ao carregar dados: ${e.message}`)
      }
      setLoaded(true)
    })()
  }, [user])

  // ── Entrega 3: salvar projetos no Supabase ─────────────────────
  async function saveToSupabase(ps) {
    if (!user) { console.warn('[SAVE] Sem usuário logado'); return }
    if (!ps || ps.length === 0) { console.warn('[SAVE] Lista de projetos vazia'); return }
    console.log('[SAVE] Salvando', ps.length, 'projetos para user:', user.id)
    try {
      const upserts = ps.map(p => ({
        project_id:    String(p.id),
        user_id:       user.id,
        n_futuros:     Number(p.nFuturos  ?? 1),
        n_passados:    Number(p.nPassados ?? 0),
        usa_pacotes:   !!p.usaPacotes,
        projeto_json:  JSON.stringify(p.projeto  || {}),
        raias_json:    JSON.stringify(p.raias    || []),
        pacotes_json:  JSON.stringify(p.pacotes  || []),
        updated_at:    new Date().toISOString(),
      }))
      console.log('[SAVE] Upserts:', upserts.map(u => ({ id: u.project_id, nome: JSON.parse(u.projeto_json)?.nome })))
      const { data, error } = await supabase
        .from('report_projects')
        .upsert(upserts, { onConflict: 'project_id,user_id' })
        .select()
      if (error) {
        console.error('[SAVE] Erro Supabase:', error)
        alert(`❌ Erro ao salvar:\n${error.message}\n\nCódigo: ${error.code}`)
        return
      }
      console.log('[SAVE] Salvos com sucesso:', data?.length, 'registros')
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      console.error('[SAVE] Erro geral:', e)
      alert(`❌ Erro ao salvar: ${e.message}`)
    }
  }

  // Auto-save com debounce
  const saveTimer = useRef(null)
  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveToSupabase(projects), 800)
    return () => clearTimeout(saveTimer.current)
  }, [projects, loaded])

  // Auto-save de manualProjects com debounce próprio
  const saveManualTimer = useRef(null)
  useEffect(() => {
    if (!loaded || !user) return
    clearTimeout(saveManualTimer.current)
    saveManualTimer.current = setTimeout(async () => {
      try {
        await supabase.from('user_manual_projects').upsert({
          user_id:    user.id,
          data:       manualProjects,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      } catch (e) {
        console.error('[SAVE] Manual projects:', e);
      }
    }, 800)
    return () => clearTimeout(saveManualTimer.current)
  }, [manualProjects, loaded, user])

  const salvarManual = () => saveToSupabase(projects)

  // Salvar portfólio quando importado
  async function handlePortfolioImport(rows) {
    setPortfolioRows(rows)
    const now = new Date()
    const importedAtStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`
    setImportedAt(importedAtStr)
    // Salvar no Supabase
    try {
      await supabase.from('user_portfolio').upsert({
        user_id:     user.id,
        rows_json:   JSON.stringify(rows),
        imported_at: importedAtStr,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'user_id' })
      await logSession({ action:'IMPORT_PORTFOLIO', detail:{ total_rows: rows.length } })
    } catch (e) { console.error('Erro ao salvar portfólio:', e) }
  }

  // Escutar navegação do UserBar
  useEffect(() => {
    const handler = (e) => setAppScreen(e.detail)
    window.addEventListener('hapvida:nav', handler)
    return () => window.removeEventListener('hapvida:nav', handler)
  }, [])

  if (appScreen === 'admin')  return <AdminScreen onBack={() => setAppScreen('main')} />
  if (appScreen === 'audit')  return <AuditScreen onBack={() => setAppScreen('main')} />

  if (screen === 'import') {
    return <ImportScreen
      portfolioRows={portfolioRows}
      onImport={handlePortfolioImport}
      importedAt={importedAt}
      existingProjects={projects}
      manualProjects={manualProjects}
      setManualProjects={setManualProjects}
      deleteProject={deleteProject}
      onStart={(merged, navegar=true, activateIds=null) => {
        const existMap = Object.fromEntries(projects.map(p=>[p.id, p]));
        const finalProjects = merged.map(p => ({
          nFuturos: existMap[p.id]?.nFuturos ?? p.nFuturos ?? 1,
          nPassados: existMap[p.id]?.nPassados ?? p.nPassados ?? 0,
          ...p,
          raias: existMap[p.id]?.raias ?? p.raias ?? [],
        }));
        setProjects(finalProjects);
        if (activateIds && activateIds.length) {
          // Ativa filtro e posiciona no primeiro dos filtrados (sempre índice 0 no array visível).
          setActiveProjectIds(new Set(activateIds));
          setCurrentIdx(0);
          navegarScreen('report');
        } else {
          setCurrentIdx(0);
          if (navegar) navegarScreen('report');
        }
      }}
      onContinue={(ids) => {
        if (ids && ids.length) {
          setActiveProjectIds(new Set(ids));
          // currentIdx é sobre visibleProjects (array já filtrado).
          // Ao ativar filtro, o primeiro dos ativos está sempre no índice 0.
          setCurrentIdx(0);
        } else {
          setActiveProjectIds(null);
          setCurrentIdx(0);
        }
        navegarScreen('report');
      }}
      onGenerate={(toGen) => {
        const list = toGen || projects;
        if (!list.length) return;
        try { baixarPptx(list); } catch(e) { alert('Erro ao gerar PPTX: ' + e.message); }
      }}
      onVoltar={onVoltar}
    />;
  }

  return <ReportScreen
    projects={projects} setProjects={setProjects}
    currentIdx={currentIdx} setCurrentIdx={setCurrentIdx}
    activeProjectIds={activeProjectIds} setActiveProjectIds={setActiveProjectIds}
    saved={saved} gerando={gerando} setGerando={setGerando}
    onBack={() => { setActiveProjectIds(null); navegarScreen('import'); }}
    onVoltar={onVoltar}
    salvarManual={salvarManual}
  />;
}

function GanttPreview({ projeto, raias, timeline, hojeFrac, usaPacotes, pacotes }) {
  const { cells } = timeline;
  const ROTULO_W = 415; // Lecom+Marcos/Demanda+Status+Dt Início
  const ROW_H = 32;

  const totalPeso = cells.reduce((s, c) => s + c.peso, 0);
  // template de grid para as colunas de tempo (garante alinhamento perfeito)
  const cellsGrid = cells.map(c => `${c.peso / totalPeso}fr`).join(' ');
  // template para a linha dos meses (grupos)
  const mesGrupos = [];
  cells.forEach((c) => {
    const last = mesGrupos[mesGrupos.length - 1];
    const key = c.futuro ? c.label : c.mesLabel;
    if (last && last.key === key && !c.futuro) { last.span++; last.peso += c.peso; }
    else mesGrupos.push({ key, label: c.futuro ? "" : c.mesLabel, span: 1, peso: c.peso, futuro: c.futuro });
  });
  const mesGrid = mesGrupos.map(m => `${m.peso / totalPeso}fr`).join(' ');

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,.08)", marginTop: 16, marginBottom: 8 }}>
      {/* título + status + legenda */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 20, color: "#003B82", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 22, background: "#F47B20", borderRadius: 3, display: "inline-block" }} />
          {projeto.nome}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
            {Object.entries(FASES).map(([k, v]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 9, height: 9, background: v, borderRadius: 2, display: "inline-block" }} />{k}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: STATUS_GERAL[projeto.statusGeral], display: "inline-block", border: "2px solid #D9D9D9", boxShadow: "0 0 0 1px #e2e8f0" }} />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: STATUS_GERAL[projeto.statusGeral] }}>{projeto.statusGeral}</span>
          </div>
        </div>
      </div>

      {/* grade */}
      <div style={{ position: "relative", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        {/* cabeçalho de colunas */}
        <div style={{ display: "flex", color: "#fff", fontSize: 11, fontWeight: 700 }}>
          <div style={{ width: ROTULO_W, flexShrink: 0, display: "flex", background: "#2F5597", color: "#fff", borderRight: "1px solid #D9D9D9" }}>
            <div style={{ width: 66, flexShrink: 0, padding: "8px 6px", borderRight: "1px solid #D9D9D9" }}>Lecom</div>
            <div style={{ flex: 1, minWidth: 0, padding: "8px 6px", borderRight: "1px solid #D9D9D9" }}>Marcos/Demanda</div>
            <div style={{ width: 96, flexShrink: 0, padding: "8px 6px", borderRight: "1px solid #D9D9D9" }}>Status</div>
            <div style={{ width: 75, flexShrink: 0, padding: "8px 6px" }}>Dt Início</div>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {/* linha dos meses — CSS grid para alinhamento perfeito */}
            <div style={{ display: "grid", gridTemplateColumns: mesGrid }}>
              {mesGrupos.map((m, i) => (
                <div key={i} style={{ background: m.futuro ? "#2F5597" : "#595959", textAlign: "center", padding: "5px 2px", borderRight: "1px solid #D9D9D9" }}>
                  {m.label || m.key}
                </div>
              ))}
            </div>
            {/* linha dos dias */}
            <div style={{ display: "grid", gridTemplateColumns: cellsGrid, fontWeight: 600 }}>
              {cells.map((c, i) => (
                <div key={i} style={{ background: c.futuro ? "#2F5597" : "#BFBFBF", textAlign: "center", padding: "3px 2px", borderRight: "1px solid #D9D9D9", fontSize: 10 }}>
                  {c.futuro ? "" : c.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* linhas */}
        <div style={{ position: "relative" }}>
          {/* grid vertical de fundo */}
          <div style={{ position: "absolute", left: ROTULO_W, right: 0, top: 0, bottom: 0, display: "flex", pointerEvents: "none" }}>
            {cells.map((c, i) => (
              <div key={i} style={{ flexGrow: c.peso, borderRight: "1px solid #D9D9D9", background: "transparent" }} />
            ))}
          </div>
          {/* linha do hoje */}
          {hojeFrac != null && (
            <div style={{ position: "absolute", top: -2, bottom: 0, left: `calc(${ROTULO_W}px + (100% - ${ROTULO_W}px) * ${hojeFrac})`, width: 0, borderLeft: "2px dashed #ED7D31", zIndex: 5 }}>
              <span style={{ position: "absolute", top: -9, left: -5, width: 9, height: 9, background: "#ED7D31", transform: "rotate(45deg)" }} />
            </div>
          )}

          {/* Função auxiliar para renderizar uma linha de demanda */}
          {(() => {
            const RaiaRow = (r) => {
              const dtInicio = ddmm(r.fases[0]?.inicio || "");
              // altura dinâmica: cresce com o número de lanes
              const { numLanes } = r.despriorizado ? { numLanes: 1 } : assignLanes(r.fases);
              const LANE_H = 12, LANE_GAP = 2, LANE_PAD = 8;
              const rh = numLanes <= 1 ? ROW_H : Math.max(ROW_H, numLanes * LANE_H + (numLanes - 1) * LANE_GAP + LANE_PAD);
              return (
                <div key={r.id} style={{ display: "flex", borderBottom: "1px solid #D9D9D9", minHeight: rh, alignItems: "stretch", background: "#F2F2F2" }}>
                  <div style={{ width: ROTULO_W, flexShrink: 0, display: "flex", fontSize: 11.5, alignItems: "center" }}>
                    <div style={{ width: 66, flexShrink: 0, padding: "4px 6px", color: "#404040", whiteSpace: "nowrap", borderRight: "1px solid #D9D9D9", alignSelf: "stretch", display: "flex", alignItems: "center" }}>{r.lecom}</div>
                    <div style={{ flex: 1, minWidth: 0, padding: "4px 6px", fontWeight: 600, color: "#1F2A44", lineHeight: 1.15, wordBreak: "break-word", borderRight: "1px solid #D9D9D9" }}>{r.nome}</div>
                    <div style={{ width: 96, flexShrink: 0, padding: "4px 5px", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap", borderRight: "1px solid #D9D9D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {(() => {
                        if (r.despriorizado) return <span style={{ color: "#7F7F7F" }}>Despriorizado</span>;
                        const s = r.statusDemanda || 'A iniciar';
                        return <span style={{ color: statusCor(s) }}>{s}</span>;
                      })()}
                    </div>
                    <div style={{ width: 75, flexShrink: 0, padding: "4px 5px", fontSize: 10, color: "#404040", display: "flex", alignItems: "center", justifyContent: "center" }}>{dtInicio}</div>
                  </div>
                  <div style={{ flex: 1, position: "relative", minHeight: rh, background: "#fff" }}>
                    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: cellsGrid, pointerEvents: "none" }}>
                      {cells.map((c, i) => <div key={i} style={{ borderRight: "1px solid #D9D9D9", background: c.futuro ? "#f8fafc" : "transparent" }} />)}
                    </div>
                    <BarRow r={r} cells={cells} atualizadoEm={projeto.atualizadoEm} rowH={rh} />
                  </div>
                </div>
              );
            };

            if (!usaPacotes) return raias.map(r => RaiaRow(r));

            // Modo pacotes: linha de pacote + demandas
            return pacotes.map(pac => {
              const pacRaias = pac.raiaIds.map(id => raias.find(r => r.id === id)).filter(Boolean);
              const info = calcPacoteInfo(pac, pacRaias);
              const sCor = statusCor(info.status);
              const f0pac = dateToFrac(info.minInicio, cells);
              const f1pac = dateToFrac(info.maxFim, cells);
              const frac = Math.max(0, Math.min(1, info.pctMedia / 100));
              return (
                <React.Fragment key={pac.id}>
                  {/* Linha do pacote */}
                  <div style={{ display: "flex", borderBottom: "2px solid #C7D7F0", minHeight: ROW_H + 4, alignItems: "stretch", background: "#EEF4FF" }}>
                    <div style={{ width: ROTULO_W, flexShrink: 0, display: "flex", fontSize: 11.5, alignItems: "center", borderLeft: `4px solid ${sCor}` }}>
                      <div style={{ width: 66, flexShrink: 0, padding: "4px 6px", color: "#2F5597", fontWeight: 700, borderRight: "1px solid #D9D9D9", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={16} color="#2F5597"/></div>
                      <div style={{ flex: 1, minWidth: 0, padding: "4px 6px", fontWeight: 700, color: "#1E3A6E", borderRight: "1px solid #D9D9D9", fontSize: 12 }}>{pac.nome}</div>
                      <div style={{ width: 96, flexShrink: 0, padding: "4px 5px", fontSize: 9, fontWeight: 700, borderRight: "1px solid #D9D9D9", display: "flex", alignItems: "center", justifyContent: "center", color: sCor }}>{info.status}</div>
                      <div style={{ width: 75, flexShrink: 0, padding: "4px 5px", fontSize: 10, color: "#2F5597", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{ddmm(info.minInicio)}</div>
                    </div>
                    <div style={{ flex: 1, position: "relative", minHeight: ROW_H + 4, background: "#F0F6FF" }}>
                      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: cellsGrid, pointerEvents: "none" }}>
                        {cells.map((c, i) => <div key={i} style={{ borderRight: "1px solid #C7D7F0", background: c.futuro ? "#f0f4ff" : "transparent" }} />)}
                      </div>
                      {f0pac != null && f1pac != null && (
                        <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: `${f0pac*100}%`, width: `${Math.max((f1pac-f0pac)*100,2)}%`, height: 18, borderRadius: 9, overflow: "hidden", background: tint(sCor.replace('#','')) ? tint(sCor) : "#C7D7F0" }}>
                          <div style={{ position:"absolute", left:0, top:0, bottom:0, width:`${frac*100}%`, background: sCor, borderRadius:9 }} />
                          <span style={{ position:"absolute", left:5, top:"50%", transform:"translateY(-50%)", fontSize:8.5, fontWeight:700, color: frac>0.15?"#fff":"#1e293b", zIndex:2, whiteSpace:"nowrap" }}>{info.pctMedia}%</span>
                          <span style={{ position:"absolute", right:4, top:"50%", transform:"translateY(-50%)", fontSize:8, fontWeight:700, color: frac>0.9?"#fff":"#1e293b", zIndex:2, whiteSpace:"nowrap" }}>{ddmm(info.maxFim)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Demandas do pacote */}
                  {pacRaias.map(r => RaiaRow(r))}
                </React.Fragment>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}

// ---- helper: atribuição de lanes para fases sobrepostas ----
function assignLanes(fases) {
  if (!fases.length) return { assignments: [], numLanes: 1 };
  // Regra: uma fase por lane, sempre, na ordem em que aparecem no array.
  // A ordem é controlada pelo usuário via botões ⬆⬇ no card de edição.
  return {
    assignments: fases.map((_, i) => i),
    numLanes: Math.max(fases.length, 1),
  };
}

// desenha as barras de uma raia
function BarRow({ r, cells, atualizadoEm, rowH = 32 }) {
  if (r.despriorizado) {
    const ini = dateToFrac(r.fases.reduce((a, f) => (f.inicio && (!a || f.inicio < a) ? f.inicio : a), null), cells) ?? 0;
    const fim = dateToFrac(r.fases.reduce((a, f) => (f.fim && f.fim > a ? f.fim : a), ""), cells) ?? 1;
    return (
      <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: `${ini * 100}%`, width: `${Math.max((fim - ini) * 100, 4)}%`, height: 14, background: CINZA_DESPRI, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#64748b", fontWeight: 600 }}>
        Despriorizado
      </div>
    );
  }

  const { assignments, numLanes } = assignLanes(r.fases);
  const GAP = numLanes > 1 ? 2 : 0;
  const laneH = numLanes > 1 ? Math.max(8, Math.floor((rowH - 4 - GAP * (numLanes - 1)) / numLanes)) : 14;
  const totalH = numLanes * laneH + (numLanes - 1) * GAP;
  const topBase = Math.max(0, (rowH - totalH) / 2);

  return (
    <>
      {r.fases.map((f, i) => {
        const cor = faseCor(f);
        const lane = assignments[i];
        const top = topBase + lane * (laneH + GAP);

        // ── A DEFINIR ──
        if (f.aDefinir) {
          // encontrar as células do mês vigente na timeline
          const hoje = new Date();
          const mesAtual = hoje.getMonth(); // 0-indexed
          const anoAtual = hoje.getFullYear();
          const celsMes = cells.filter(c => !c.futuro && c.start instanceof Date &&
            c.start.getMonth() === mesAtual && c.start.getFullYear() === anoAtual);
          // se não achar o mês atual, usar as últimas células vigentes
          const celsRef = celsMes.length > 0 ? celsMes : cells.filter(c => !c.futuro).slice(-2);
          const left  = celsRef.length > 0 ? celsRef[0].f0  : 0.72;
          const right = celsRef.length > 0 ? celsRef[celsRef.length-1].f1 : 1.0;
          const w = Math.max(right - left, 0.18) * 100;
          return (
            <div key={i} style={{ position: "absolute", left: `${left * 100}%`, top: `${top}px`, width: `${w}%`, minWidth: 72, height: `${laneH}px`, background: A_DEFINIR_COR, borderRadius: laneH / 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#64748b", fontWeight: 600, zIndex: lane + 1 }}>
              {faseLabel(f) ? `${faseLabel(f)} · A definir` : "A definir"}
            </div>
          );
        }

        const fimEfetivo = f.fimRepactuado || f.fim;
        const f0 = dateToFrac(f.inicio, cells);
        const f1 = dateToFrac(fimEfetivo, cells);
        if (f0 == null || f1 == null || f1 < f0) return null;

        const frac = Math.max(0, Math.min(1, (Number(f.pct) || 0) / 100));
        const naturalW = (f1 - f0) * 100;
        // limitar ao mês atual — se não cabe à frente, cresce para trás
        const currCell = cells.find(c => f0 >= c.f0 && f0 < c.f1) || cells[cells.length - 1];
        const mesLabel = currCell?.mesLabel;
        const lastCellOfMes = mesLabel
          ? [...cells].reverse().find(c => c.mesLabel === mesLabel && !c.futuro)
          : currCell;
        const firstCellOfMes = mesLabel
          ? cells.find(c => c.mesLabel === mesLabel && !c.futuro)
          : currCell;
        const monthEnd   = lastCellOfMes?.f1 ?? 1;
        const monthStart = firstCellOfMes?.f0 ?? 0;
        const MIN_W = 8; // % mínimo para caber o texto
        const spaceAhead = (monthEnd - f0) * 100;

        // fim está no mesmo mês que início?
        const f1Cell = cells.find(c => f1 >= c.f0 && f1 < c.f1) || cells[cells.length-1];
        const sameMonth = !!(mesLabel && mesLabel === f1Cell?.mesLabel && !f1Cell?.futuro);

        // isNarrow: barra que cabe dentro do mês atual mas não tem espaço à frente para o texto
        // Se fim estiver em outro mês/trimestre, renderiza normalmente (não ajusta)
        const isNarrow = sameMonth && spaceAhead < MIN_W;
        // displayW:
        //   - isNarrow (mesmo mês, sem espaço à frente) → cresce para trás, limitado ao mês
        //   - barra curta com fim em mês/tri diferente → pode crescer para frente livremente
        //   - normal → usa naturalW
        // const displayW = isNarrow
          // ? Math.max(naturalW, Math.min(MIN_W, (monthEnd - monthStart) * 100))
         // : !sameMonth && naturalW < MIN_W ? Math.max(naturalW, MIN_W)
         //  : naturalW;

      // Fase inteira em tri comprimido → ocupa coluna inteira.
        // Fase que INICIA em tri comprimido (e transborda) → âncora no INÍCIO da coluna.
        // Fase que TERMINA em tri comprimido (começou no vigente) → âncora no FIM da coluna.
        // Consistência visual: textos e barras respeitam os limites das colunas comprimidas.
        const iniciaEmComprimido = !!currCell?.futuro;
        const terminaEmComprimido = !!f1Cell?.futuro;
        const emTrimestreComprimido = iniciaEmComprimido && terminaEmComprimido && currCell === f1Cell;

        let displayW, displayLeft;
        if (emTrimestreComprimido) {
          displayLeft = currCell.f0 * 100;
          displayW = (currCell.f1 - currCell.f0) * 100;
        } else if (iniciaEmComprimido || terminaEmComprimido) {
          const leftFrac = iniciaEmComprimido ? currCell.f0 : f0;
          const rightFrac = terminaEmComprimido ? f1Cell.f1 : f1;
          displayLeft = leftFrac * 100;
          displayW = (rightFrac - leftFrac) * 100;
        } else if (isNarrow) {
          
          displayW = Math.max(naturalW, Math.min(MIN_W, (monthEnd - monthStart) * 100));
          displayLeft = (spaceAhead < displayW ? Math.max(monthStart, monthEnd - displayW / 100) : f0) * 100;
        } else if (!sameMonth && naturalW < MIN_W) {
          displayW = Math.max(naturalW, MIN_W);
          displayLeft = f0 * 100;
        } else {
          displayW = naturalW;
          displayLeft = f0 * 100;
        }
        const f1orig = f.fimRepactuado ? dateToFrac(f.fim, cells) : null;
        const origPct = f1orig != null ? Math.max(0, Math.min(1, (f1orig - f0) / (f1 - f0 || 1))) : null;

        return (
          <div key={i} style={{ position: "absolute", left: `${displayLeft}%`, top: `${top}px`, width: `${displayW}%`, height: `${laneH}px`, borderRadius: laneH / 2, overflow: "visible", zIndex: lane + 1 }}>
            {/* envelope claro com extensão repactuada */}
            <div style={{ position: "absolute", inset: 0, background: tint(cor), borderRadius: laneH / 2, overflow: "hidden" }}>
              {origPct != null && (
                <div style={{ position: "absolute", left: `${origPct * 100}%`, top: 0, bottom: 0, right: 0, background: `repeating-linear-gradient(45deg,${tint(cor)},${tint(cor)} 3px,${tint(cor,0.55)} 3px,${tint(cor,0.55)} 6px)`, borderLeft: "2px solid #F47B20" }} />
              )}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: cor, borderRadius: laneH / 2 }} />
            </div>
            {!isNarrow && (
              <span style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", zIndex: 2, fontSize: 8.5, fontWeight: 700, color: frac > 0.12 ? "#fff" : "#1e293b", whiteSpace: "nowrap" }}>
                {f.pct || 0}%
              </span>
            )}
           {/* <span style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", zIndex: 2, fontSize: 8, fontWeight: 700, color: frac >= 0.9 ? "#fff" : "#1e293b", whiteSpace: "nowrap" }}>
              {isNarrow ? `${f.pct||0}% ` : ""}
              {f.fimRepactuado ? ddmm(f.fim) + " → " + ddmm(f.fimRepactuado) : ddmm(fimEfetivo)}
            </span> */}

            {(() => {
              const textoDatas = f.fimRepactuado ? ddmm(f.fim) + " → " + ddmm(f.fimRepactuado) : ddmm(fimEfetivo);
              const textoCompleto = isNarrow ? `${f.pct||0}% ${textoDatas}` : textoDatas;
              // Estimativa: ~4.5px por caractere em fonte 8px bold
              const larguraTextoPx = textoCompleto.length * 4.5;
              const larguraBarraAprox = (displayW / 100) * 900; // aproximação da largura do Gantt em px
              // Em trimestre comprimido: força texto DENTRO da barra (regra: nunca vazar)
              const textoCabeDentro = emTrimestreComprimido || (larguraTextoPx < larguraBarraAprox - 8);

              if (textoCabeDentro) {
                return (
                  <span style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", zIndex: 2, fontSize: emTrimestreComprimido ? 7 : 8, fontWeight: 700, color: frac >= 0.9 ? "#fff" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip", maxWidth: "100%" }}>
                    {textoCompleto}
                  </span>
                );
              }
              return (
                <span style={{ position: "absolute", left: "100%", marginLeft: 4, top: "50%", transform: "translateY(-50%)", zIndex: 3, fontSize: 8, fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap" }}>
                  {textoCompleto}
                </span>
              );
            })()}
            
          </div>
        );
      })}
    </>
  );
}

// ---------- Card de raia (editor) ----------
function RaiaCard({ r, aberta, toggle, upd, updFase, addFase, delFase, moveFase, delRaia }) {
  return (
    <div style={{ background: "#FAFBFC", borderRadius: 10, marginBottom: 10, border: r.despriorizado ? "1px solid #E2E8F0" : "1px solid #EEF2F7" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
        <button onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex" }}>
          {aberta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        <input className="inp" style={{ width: 100 }} value={r.lecom} onChange={(e) => upd(r.id, { lecom: e.target.value })} placeholder="Lecom" />
        <input className="inp" style={{ flex: 1, fontWeight: 600 }} value={r.nome} onChange={(e) => upd(r.id, { nome: e.target.value })} placeholder="Nome da demanda/marco" />
        {/* Fase atual */}
        {/* {!r.despriorizado && r.fases.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>Fase atual:</span>
            <select className="inp" style={{ width: 140, fontSize: 12, color: faseCor(r.fases[r.faseAtivaIdx ?? r.fases.length-1]), fontWeight: 700 }}
              value={r.faseAtivaIdx ?? r.fases.length - 1}
              onChange={(e) => upd(r.id, { faseAtivaIdx: +e.target.value })}>
              {r.fases.map((f, i) => (
                <option key={i} value={i}>{faseLabel(f) || `Fase ${i+1}`}</option>
              ))}
            </select>
          </div>
        )} */}
        {/* Status da demanda */}
        {!r.despriorizado && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>Status:</span>
            <select className="inp" style={{ width: 120, fontSize: 12, fontWeight: 700,
            color: statusCor(r.statusDemanda || 'A iniciar') }}
            
            
              onChange={(e) => upd(r.id, { statusDemanda: e.target.value })}>
              <option value="A iniciar">A iniciar</option>
              <option value="Em Andamento">Em Andamento</option>
              <option value="Atrasado">Atrasado</option>
              <option value="Aguardando Publicação">Aguardando Publicação</option>
              <option value="Op. Assistida">Op. Assistida</option>
              <option value="Monitoramento e Controle">Monitoramento e Controle</option>
              <option value="Concluído">Concluído</option>
            </select>
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b", whiteSpace: "nowrap", cursor: "pointer" }}>
          <input type="checkbox" checked={r.despriorizado} onChange={(e) => upd(r.id, { despriorizado: e.target.checked })} />
          Despriorizado
        </label>
        <button onClick={() => delRaia(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", display: "flex" }}><Trash2 size={16} /></button>
      </div>

      {aberta && !r.despriorizado && (
        <div style={{ padding: "0 14px 14px 40px" }}>
          {/* cabeçalho */}
          <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 120px 120px 110px 80px 1fr 30px", gap: 10, fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", padding: "0 2px 5px" }}>
            <span></span><span>Fase</span><span>Início</span><span>Fim</span><span title="Nova data fim (repactuação)">↪ Repac.</span><span style={{ fontSize:9, textAlign: "center" }} title="Sem data definida">DT A<br/>DEF.</span><span>% executado</span><span style={{ textAlign: "center" }}>—</span>
          </div>
          {r.fases.map((f, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 120px 120px 110px 80px 1fr 30px", gap: 10, alignItems: "center" }}>
                {/* Reordenar (início) */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <button onClick={() => moveFase(r.id, i, -1)} disabled={i === 0} title="Mover para cima"
                    style={{ background: "none", border: "none", cursor: i === 0 ? "not-allowed" : "pointer", color: i === 0 ? "#cbd5e1" : "#64748b", padding: 0, display: "flex", height: 14 }}>
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => moveFase(r.id, i, +1)} disabled={i === r.fases.length - 1} title="Mover para baixo"
                    style={{ background: "none", border: "none", cursor: i === r.fases.length - 1 ? "not-allowed" : "pointer", color: i === r.fases.length - 1 ? "#cbd5e1" : "#64748b", padding: 0, display: "flex", height: 14 }}>
                    <ChevronDown size={14} />
                  </button>
                </div>
                {/* Fase: select + campo manual */}
                {/* Fase: select + campo manual */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <select className="inp" style={{ fontSize: 12 }} value={f.fase} onChange={(e) => updFase(r.id, i, { fase: e.target.value, faseCustom: e.target.value === FASE_CUSTOM ? (f.faseCustom || '') : undefined })}>
                    {ORDEM_FASES.map((fa) => <option key={fa}>{fa}</option>)}
                    <option value={FASE_CUSTOM}>✏️ Incluir manual…</option>
                  </select>
                  {f.fase === FASE_CUSTOM && (
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Nome da fase…" value={f.faseCustom || ''} onChange={(e) => updFase(r.id, i, { faseCustom: e.target.value })} />
                  )}
                </div>
                {/* Início */}
                <input type="date" className="inp" style={{ fontSize: 12 }} value={f.inicio || ''} disabled={!!f.aDefinir} onChange={(e) => updFase(r.id, i, { inicio: e.target.value })} />
                {/* Fim */}
                <input type="date" className="inp" style={{ fontSize: 12 }} value={f.fim || ''} disabled={!!f.aDefinir} onChange={(e) => updFase(r.id, i, { fim: e.target.value })} />
                {/* Repactuação */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {f.fim && !f.aDefinir ? (
                    <input type="date" className="inp" style={{ fontSize: 11, borderColor: f.fimRepactuado ? '#F47B20' : '#cbd5e1' }}
                      title="Nova data fim (repactuação)" value={f.fimRepactuado || ''} onChange={(e) => updFase(r.id, i, { fimRepactuado: e.target.value || undefined })} />
                  ) : (
                    <div style={{ height: 32 }} />
                  )}
                </div>
                {/* Checkbox A definir */}
                <label title="A definir (sem datas)" style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!f.aDefinir} onChange={(e) => updFase(r.id, i, { aDefinir: e.target.checked, inicio: e.target.checked ? '' : f.inicio, fim: e.target.checked ? '' : f.fim, fimRepactuado: e.target.checked ? undefined : f.fimRepactuado })} />
                </label>
                {/* Slider % */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, opacity: f.aDefinir ? 0.4 : 1 }}>
                  <input type="range" min={0} max={100} value={f.pct || 0} disabled={!!f.aDefinir} onChange={(e) => updFase(r.id, i, { pct: +e.target.value })} style={{ flex: 1, minWidth: 0, accentColor: faseCor(f) }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, width: 38, textAlign: "right", color: "#0f172a", flexShrink: 0 }}>{f.pct || 0}%</span>
                </div>
                

                
                <button onClick={() => delFase(r.id, i)} title="Remover fase" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", display: "flex", justifyContent: "center" }}><Trash2 size={15} /></button>
                
              </div>
              {/* hint repactuação */}
              {f.fimRepactuado && !f.aDefinir && (
                <div style={{ fontSize: 11, color: "#F47B20", gridColumn: "1 / -1", marginTop: 2, paddingLeft: 4 }}>
                  ⚠ Data original: {ddmm(f.fim)} → Repactuada: {ddmm(f.fimRepactuado)}
                </div>
              )}
              {f.aDefinir && (
                <div style={{ fontSize: 11, color: "#94a3b8", gridColumn: "1 / -1", marginTop: 2, paddingLeft: 4 }}>
                  ◻ Sem data definida — aparece como "A definir" no cronograma
                </div>
              )}
            </div>
          ))}
          <button className="btn" onClick={() => addFase(r.id)} style={{ background: "#eef2f7", color: "#334155", marginTop: 4 }}><Plus size={14} />Adicionar fase</button>
        </div>
      )}
      {aberta && r.despriorizado && (
        <div style={{ padding: "0 14px 14px 40px", display: "flex", gap: 10, alignItems: "end" }}>
          <Field label="Início (span da raia)"><input type="date" className="inp" value={r.fases[0]?.inicio || ""} onChange={(e) => updFase(r.id, 0, { inicio: e.target.value })} /></Field>
          <Field label="Fim (span da raia)"><input type="date" className="inp" value={r.fases[0]?.fim || ""} onChange={(e) => updFase(r.id, 0, { fim: e.target.value })} /></Field>
          <span style={{ fontSize: 12, color: "#94a3b8", paddingBottom: 8 }}>Raia cinza com "Despriorizado".</span>
        </div>
      )}
    </div>
  );
}

// ---------- UI helpers ----------
function Section({ title, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginTop: 16, boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}>
      <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#003B82", margin: "0 0 14px" }}>{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (<label style={{ display: "block" }}><div className="lbl" style={{ marginBottom: 4 }}>{label}</div>{children}</label>);
}

// ============================================================
//  Geração do .pptx — gerador próprio, sem bibliotecas externas
//  (OOXML + ZIP montados na mão). Coordenadas em polegadas,
//  calibradas a partir do template original Hapvida.
// ============================================================
const EMU = 914400;
const emu = (inch) => Math.round(inch * EMU);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- CRC32 ----
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// ---- ZIP store-only ----
function zip(parts) {
  const enc = new TextEncoder();
  const files = Object.entries(parts).map(([name, content]) => ({ name, data: enc.encode(content) }));
  const chunks = []; const central = []; let offset = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
  for (const f of files) {
    const nameBytes = enc.encode(f.name); const crc = crc32(f.data); const sz = f.data.length;
    const local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nameBytes.length), u16(0));
    chunks.push(new Uint8Array(local), nameBytes, f.data);
    const cen = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
    central.push(new Uint8Array(cen), nameBytes);
    offset += local.length + nameBytes.length + sz;
  }
  let cenSize = 0; central.forEach((c) => cenSize += c.length);
  const cenOffset = offset;
  const eocd = [].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cenSize), u32(cenOffset), u16(0));
  const all = [...chunks, ...central, new Uint8Array(eocd)];
  let total = 0; all.forEach((c) => total += c.length);
  const out = new Uint8Array(total); let p = 0; all.forEach((c) => { out.set(c, p); p += c.length; });
  return out;
}

// ---- DrawingML helpers ----
let _id = 100;
const nid = () => ++_id;
function lineToParas(content, rPrBase) {
  // content: string | [{text,bold}]
  let runs = typeof content === "string" ? [{ text: content }] : content;
  const lines = [[]];
  for (const r of runs) {
    const segs = String(r.text).split("\n");
    segs.forEach((seg, i) => { if (i > 0) lines.push([]); if (seg !== "" || segs.length === 1) lines[lines.length - 1].push({ text: seg, bold: r.bold }); });
  }
  return lines.map((line) => {
    const runsXml = line.map((r) => `<a:r><a:rPr lang="pt-BR" sz="${rPrBase.sz}"${r.bold ? ' b="1"' : (rPrBase.bold ? ' b="1"' : "")}><a:solidFill><a:srgbClr val="${rPrBase.color}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${esc(r.text)}</a:t></a:r>`).join("");
    const pPr = `<a:pPr algn="${rPrBase.algn}">${rPrBase.lnSpc ? `<a:lnSpc><a:spcPct val="${rPrBase.lnSpc}"/></a:lnSpc>` : ""}</a:pPr>`;
    return `<a:p>${pPr}${runsXml || '<a:endParaRPr lang="pt-BR"/>'}</a:p>`;
  }).join("");
}
function txBody(content, o) {
  const opt = Object.assign({ sz: 1000, bold: false, color: "000000", algn: "l", anchor: "t", wrap: "square" }, o);
  return `<p:txBody><a:bodyPr wrap="${opt.wrap}" anchor="${opt.anchor}" lIns="36000" tIns="18000" rIns="36000" bIns="18000"></a:bodyPr><a:lstStyle/>${lineToParas(content, opt)}</p:txBody>`;
}
function shape({ x, y, w, h, prst = "rect", fill, line, round, text, textOpt }) {
  const geomPrst = (round != null && prst === "rect") ? "roundRect" : prst;
  const geom = round != null
    ? `<a:prstGeom prst="${geomPrst}"><a:avLst><a:gd name="adj" fmla="val ${round}"/></a:avLst></a:prstGeom>`
    : `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`;
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : `<a:noFill/>`;
  const lineXml = line ? `<a:ln w="${emu(line.w || 0.01)}"><a:solidFill><a:srgbClr val="${line.color}"/></a:solidFill></a:ln>` : `<a:ln><a:noFill/></a:ln>`;
  const body = text != null ? txBody(text, textOpt) : `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="pt-BR"/></a:p></p:txBody>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${nid()}" name="s${_id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>${geom}${fillXml}${lineXml}</p:spPr>${body}</p:sp>`;
}
function dashLine({ x, y, h, color, w = 0.02 }) {
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nid()}" name="l${_id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="0" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${emu(w)}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr></p:cxnSp>`;
}

// ===== scaffolds estáticos =====
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`;
const RELS_ROOT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`;
const PRES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
const PRES_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`;
const EMPTY_TREE = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>`;
const MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${EMPTY_TREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
const MASTER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`;
const LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const LAYOUT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
const SLIDE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
function themeXml() {
  const dk1="000000",lt1="FFFFFF",dk2="1F2A44",lt2="EEEEEE";
  const acc=["003B82","F47B20","0070C0","7030A0","00B050","FDB713"];
  const accXml = acc.map((c,i)=>`<a:accent${i+1}><a:srgbClr val="${c}"/></a:accent${i+1}>`).join("");
  const fill3 = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
  const ln3 = `<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`;
  const eff3 = `<a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Tema"><a:themeElements><a:clrScheme name="Tema"><a:dk1><a:srgbClr val="${dk1}"/></a:dk1><a:lt1><a:srgbClr val="${lt1}"/></a:lt1><a:dk2><a:srgbClr val="${dk2}"/></a:dk2><a:lt2><a:srgbClr val="${lt2}"/></a:lt2>${accXml}<a:hlink><a:srgbClr val="0070C0"/></a:hlink><a:folHlink><a:srgbClr val="7030A0"/></a:folHlink></a:clrScheme><a:fontScheme name="Tema"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Tema"><a:fillStyleLst>${fill3}</a:fillStyleLst><a:lnStyleLst>${ln3}</a:lnStyleLst><a:effectStyleLst>${eff3}</a:effectStyleLst><a:bgFillStyleLst>${fill3}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}
function slideXml(shapesXml) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapesXml}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
function buildPptxParts(shapesXml) {
  return {
    "[Content_Types].xml": CT,
    "_rels/.rels": RELS_ROOT,
    "ppt/presentation.xml": PRES,
    "ppt/_rels/presentation.xml.rels": PRES_RELS,
    "ppt/slideMasters/slideMaster1.xml": MASTER,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": MASTER_RELS,
    "ppt/slideLayouts/slideLayout1.xml": LAYOUT,
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": LAYOUT_RELS,
    "ppt/theme/theme1.xml": themeXml(),
    "ppt/slides/slide1.xml": slideXml(shapesXml),
    "ppt/slides/_rels/slide1.xml.rels": SLIDE_RELS,
  };
}

function fmtBR(d){if(!d)return"";const x=new Date(d+"T12:00:00");if(isNaN(x))return"";return `${String(x.getDate()).padStart(2,"0")}/${String(x.getMonth()+1).padStart(2,"0")}/${x.getFullYear()}`;}

function tintHex(hex,amount=0.78){const n=parseInt(hex,16);let r=(n>>16)&255,g=(n>>8)&255,b=n&255;r=Math.round(r+(255-r)*amount);g=Math.round(g+(255-g)*amount);b=Math.round(b+(255-b)*amount);return[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");}




// ---- PPTX Multi-slide ----
function buildMultiSlidePptxParts(slideXmlsArr) {
  const N = slideXmlsArr.length;
  let ctOverrides = `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`;
  for (let i=1;i<=N;i++) ctOverrides+=`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  const CTm=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${ctOverrides}</Types>`;
  let sldIdLst=''; for(let i=1;i<=N;i++) sldIdLst+=`<p:sldId id="${255+i}" r:id="rId${i+1}"/>`;
  const PRM=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIdLst}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  let presR=`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`;
  for(let i=1;i<=N;i++) presR+=`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`;
  const PRR=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presR}</Relationships>`;
  const parts={
    "[Content_Types].xml":CTm, "_rels/.rels":RELS_ROOT,
    "ppt/presentation.xml":PRM, "ppt/_rels/presentation.xml.rels":PRR,
    "ppt/slideMasters/slideMaster1.xml":MASTER, "ppt/slideMasters/_rels/slideMaster1.xml.rels":MASTER_RELS,
    "ppt/slideLayouts/slideLayout1.xml":LAYOUT, "ppt/slideLayouts/_rels/slideLayout1.xml.rels":LAYOUT_RELS,
    "ppt/theme/theme1.xml":themeXml(),
  };
  slideXmlsArr.forEach((xml,i)=>{
    parts[`ppt/slides/slide${i+1}.xml`]=slideXml(xml);
    parts[`ppt/slides/_rels/slide${i+1}.xml.rels`]=SLIDE_RELS;
  });
  return parts;
}

// Gera 1 ou mais slides para um projeto.
// Paginação por número de linhas (máx. 12: pacotes + demandas) E por altura útil.
// Cada página é um slide completo: cabeçalho do report, topo da tabela e rodapé.
// A ordem das linhas é exatamente a ordem cadastrada pelo usuário.
function gerarSlidesXmls({ projeto, raias, timeline, usaPacotes, pacotes }) {
  const MAX_LINHAS  = 12;
  const bodyTop     = 2.91;
  const bodyBottom  = 5.92;
  const ALTURA_UTIL = bodyBottom - bodyTop;   // 3.01"

  // Altura mínima de uma raia: cada fase ocupa uma lane exclusiva.
  const MIN_LANE = 0.13;
  const alturaMinRaia = (r) => {
    if (r.despriorizado) return 0;
    const n = Math.max((r.fases || []).length, 1);
    if (n <= 1) return 0;
    return n * MIN_LANE + (n - 1) * 0.02 + 0.06;
  };

  // Replica exatamente o cálculo interno de rowH de gerarSlideXml.
  const alturaPagina = (us) => {
    const rh = Math.min(0.42, ALTURA_UTIL / Math.max(us.length, 7));
    return us.reduce((s, u) => s + (u.kind === 'pac' ? rh : Math.max(rh, u.min)), 0);
  };

  // 1) Linearizar tudo na ORDEM cadastrada
  const units = [];
  if (!usaPacotes || !pacotes?.length) {
    raias.forEach(r => units.push({ kind: 'raia', r, min: alturaMinRaia(r) }));
  } else {
    pacotes.forEach(pac => {
      units.push({ kind: 'pac', pac });
      pac.raiaIds.forEach(id => {
        const r = raias.find(x => x.id === id);
        if (r) units.push({ kind: 'raia', r, min: alturaMinRaia(r), pacId: pac.id });
      });
    });
  }
  if (!units.length) return [gerarSlideXml({ projeto, raias, timeline, usaPacotes, pacotes })];

  // 2) Fatiar em páginas respeitando MAX_LINHAS e a altura útil
  const pages = [];
  let cur = [];
  for (const u of units) {
    const tentativa = [...cur, u];
    const estoura = cur.length > 0 &&
      (tentativa.length > MAX_LINHAS || alturaPagina(tentativa) > ALTURA_UTIL + 0.02);
    if (estoura) { pages.push(cur); cur = []; }
    // Se a página nova começa com raia de um pacote, repete o cabeçalho do pacote.
    if (cur.length === 0 && u.kind === 'raia' && u.pacId) {
      const pac = pacotes.find(p => p.id === u.pacId);
      if (pac) cur.push({ kind: 'pac', pac });
    }
    cur.push(u);
  }
  if (cur.length) pages.push(cur);

  // 3) Cada página vira um slide completo
  return pages.map(page => {
    const pageRaias = page.filter(u => u.kind === 'raia').map(u => u.r);
    if (!usaPacotes || !pacotes?.length) {
      return gerarSlideXml({ projeto, raias: pageRaias, timeline, usaPacotes: false, pacotes: [] });
    }
    const pagePacotes = page.filter(u => u.kind === 'pac').map(u => ({ ...u.pac, raiaIds: [] }));
    page.filter(u => u.kind === 'raia').forEach(u => {
      const p = pagePacotes.find(pp => pp.id === u.pacId);
      if (p) p.raiaIds.push(u.r.id);
    });
    return gerarSlideXml({ projeto, raias: pageRaias, timeline, usaPacotes: true, pacotes: pagePacotes });
  });
}

function baixarPptx(projects) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mesInicio = Math.floor(hoje.getMonth() / 3) * 3 + 1;
  const allSlideXmls = [];
  projects.forEach((p) => {
    _id = 100;
    const tl = buildTimeline(ano, mesInicio, p.nFuturos ?? 1, p.nPassados ?? 0);
    const slides = gerarSlidesXmls({ projeto: p.projeto, raias: p.raias, timeline: tl, usaPacotes: p.usaPacotes ?? false, pacotes: p.pacotes ?? [] });
    slides.forEach(xml => allSlideXmls.push(xml));
  });
  const parts = buildMultiSlidePptxParts(allSlideXmls);
  const bytes = zip(parts);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  const url = URL.createObjectURL(blob);
  const safe = (projects[0]?.projeto?.nome || "Projetos").replace(/[^\wÀ-ú\- ]/g, "").trim().replace(/\s+/g, "_").slice(0,40);
  const a = document.createElement("a");
  a.href = url; a.download = `Status_Semanal_${safe}.pptx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// Slide de continuação: cabeçalho compacto + raias passadas
function gerarSlideContXml({ projeto, raias, timeline, slideNum, totalSlides }) {
  // Reutiliza gerarSlideXml com flag de continuação embutida no nome
  // Hack simples: gera normalmente e substitui o bloco de cabeçalho no XML resultante
  // O cabeçalho do cronograma (linhas da tabela) é mantido — só o topo muda
  const fullXml = gerarSlideXml({ projeto, raias, timeline, usaPacotes: false, pacotes: [] });
  // O fullXml é shapes raw (sem wrapper) — retornar como está
  // Os slides de continuação ficam iguais ao original mas com raias diferentes
  return fullXml;
}

function gerarSlideXml({ projeto, raias, timeline, usaPacotes, pacotes }) {
  const S = [];
  const HX = (c) => (c || "").replace("#", "");
  const cells = timeline.cells;
  const X0 = 4.87, X1 = 13.18;
  const fx = (f) => X0 + f * (X1 - X0);
  const dX = (d) => { const f = dateToFrac(d, cells); return f == null ? null : fx(f); };

  // título
  S.push(shape({ x:0.27,y:0.18,w:0.09,h:0.42,fill:"F47B20" }));
  S.push(shape({ x:0.45,y:0.12,w:9,h:0.55,text:projeto.nome,textOpt:{sz:2600,bold:true,color:"003B82",algn:"l",anchor:"ctr"} }));
  // (logo/nome Hapvida removido do canto superior direito)

  // boxes topo
  S.push(shape({ x:0.14,y:0.78,w:3,h:0.26,text:"Resumo do Projeto",textOpt:{sz:1300,bold:true,color:"003B82"} }));
  S.push(shape({ x:0.14,y:1.06,w:6.8,h:0.78,fill:"F2F2F2",line:{color:"E2E8F0",w:0.01},round:6000 }));
  S.push(shape({ x:0.26,y:1.09,w:6.55,h:0.72,text:[{text:"Lecom: ",bold:1},{text:(projeto.resumoLecom||"")+"\n"},{text:"Descrição: ",bold:1},{text:projeto.resumoDesc||""}],textOpt:{sz:850,color:"1E293B",anchor:"t"} }));

  S.push(shape({ x:7.01,y:0.78,w:3,h:0.26,text:"Equipe do Projeto",textOpt:{sz:1300,bold:true,color:"003B82"} }));
  S.push(shape({ x:7.01,y:1.06,w:3.5,h:0.78,fill:"F2F2F2",line:{color:"E2E8F0",w:0.01},round:6000 }));
  S.push(shape({ x:7.12,y:1.09,w:1.7,h:0.72,text:[{text:"Área Cliente: ",bold:1},{text:(projeto.areaCliente||"")+"\n"},{text:"Diretor: ",bold:1},{text:(projeto.dirCliente||"")+"\n"},{text:"Líder: ",bold:1},{text:projeto.lidCliente||""}],textOpt:{sz:800,color:"1E293B",anchor:"ctr",lnSpc:150000} }));
  S.push(shape({ x:8.7,y:1.09,w:1.75,h:0.72,text:[{text:"Área Executora: ",bold:1},{text:(projeto.areaExec||"")+"\n"},{text:"Diretor: ",bold:1},{text:(projeto.dirExec||"")+"\n"},{text:"Líder: ",bold:1},{text:projeto.lidExec||""}],textOpt:{sz:800,color:"1E293B",anchor:"ctr",lnSpc:150000} }));

  S.push(shape({ x:10.58,y:0.78,w:2.6,h:0.26,text:"Status Geral",textOpt:{sz:1300,bold:true,color:"003B82"} }));
  S.push(shape({ x:10.58,y:1.06,w:2.59,h:0.78,fill:"F2F2F2",line:{color:"E2E8F0",w:0.01},round:6000 }));
  [["Bom","69AE9A"],["Com Riscos","FDB713"],["Com Problemas","FF0000"]].forEach(([t,c],i)=>{
    S.push(shape({ x:10.72,y:1.16+i*0.21,w:0.14,h:0.14,prst:"ellipse",fill:c }));
    S.push(shape({ x:10.92,y:1.13+i*0.21,w:1.3,h:0.2,text:t,textOpt:{sz:900,color:"334155",anchor:"ctr"} }));
  });
  S.push(shape({ x:12.45,y:1.2,w:0.55,h:0.55,prst:"ellipse",fill:HX(STATUS_GERAL[projeto.statusGeral]||"#999999") }));

  // cronograma + legenda
  S.push(shape({ x:0.1,y:2.0,w:3,h:0.26,text:"Cronograma de Execução",textOpt:{sz:1300,bold:true,color:"003B82"} }));
  let lx=6.5;
  Object.entries(FASES).forEach(([k,v])=>{
    S.push(shape({ x:lx,y:2.07,w:0.11,h:0.11,fill:HX(v) }));
    S.push(shape({ x:lx+0.14,y:2.0,w:1.25,h:0.22,text:k,textOpt:{sz:700,color:"334155",anchor:"ctr",wrap:"none"} }));
    lx+=0.14+k.length*0.066+0.12;
  });

  // cabeçalho grade — cores exatas do template
  const hY=2.34,hH=0.57; const qY=hY,mY=hY+0.19,dY=hY+0.38,bandH=0.19;
  const LABEL_BG="F2F2F2", LABEL_TX="1F2A44", GRID_LN={color:"D9D9D9",w:0.008};
  const head=(x,w,t)=>{ S.push(shape({x,y:hY,w,h:hH,fill:"2F5597",line:GRID_LN})); S.push(shape({x:x+0.02,y:hY,w:w-0.04,h:hH,text:t,textOpt:{sz:900,bold:true,color:"FFFFFF",algn:"ctr",anchor:"ctr",wrap:"none"}})); };
  head(0.14,0.67,"Lecom"); head(0.81,2.37,"Marcos/Demanda"); head(3.18,1.0,"Status"); head(4.18,0.69,"Dt Início");
  const vig=cells.filter(c=>!c.futuro);
  // faixa do dia (BFBFBF) — título sz:900
  vig.forEach(c=>{ const xa=fx(c.f0),xb=fx(c.f1); S.push(shape({x:xa,y:dY,w:xb-xa,h:bandH,fill:"BFBFBF",line:GRID_LN,text:c.label,textOpt:{sz:900,bold:true,color:"FFFFFF",algn:"ctr",anchor:"ctr"}})); });
  // faixa do mês (595959) — título sz:900
  const grupos=[]; cells.forEach(c=>{ if(c.futuro)return; const last=grupos[grupos.length-1]; if(last&&last.label===c.mesLabel)last.b=c.f1; else grupos.push({label:c.mesLabel,a:c.f0,b:c.f1}); });
  grupos.forEach(g=>{ const xa=fx(g.a),xb=fx(g.b); S.push(shape({x:xa,y:mY,w:xb-xa,h:bandH,fill:"595959",line:GRID_LN,text:g.label,textOpt:{sz:900,bold:true,color:"FFFFFF",algn:"ctr",anchor:"ctr"}})); });
  // faixa do trimestre vigente (2F5597) — título sz:900
  if(vig.length){const xa=fx(vig[0].f0),xb=fx(vig[vig.length-1].f1); S.push(shape({x:xa,y:qY,w:xb-xa,h:bandH,fill:"2F5597",line:GRID_LN,text:`${timeline.trimVigente}T`,textOpt:{sz:900,bold:true,color:"FFFFFF",algn:"ctr",anchor:"ctr"}}));}
  // trimestres futuros/passados — sz:900
  cells.filter(c=>c.futuro).forEach(c=>{ S.push(shape({x:fx(c.f0),y:qY,w:fx(c.f1)-fx(c.f0),h:hH,fill:"2F5597",line:GRID_LN,text:c.label,textOpt:{sz:900,bold:true,color:"FFFFFF",algn:"ctr",anchor:"ctr"}})); });

  // linhas
  const bodyTop=hY+hH,bodyBottom=5.92;
  const totalRows = usaPacotes && pacotes?.length
    ? pacotes.reduce((s,pac) => s + 1 + pac.raiaIds.length, 0)
    : raias.length;
  const nRows=Math.max(totalRows,7);
  const rowH=Math.min(0.42,(bodyBottom-bodyTop)/nRows);
  const barH=Math.min(0.2,rowH*0.55);

  // altura por raia: usa lane mínima de 0.13in (~9pt) para não sobrescrever
  const calcRhPptx = (r) => {
    if (r.despriorizado) return rowH;
    const comDatas = (r.fases||[]).filter(f=>!f.aDefinir);
    const semDatas = (r.fases||[]).filter(f=>f.aDefinir);
    const ends=[];
    [...comDatas].sort((a,b)=>(a.inicio||'')<=(b.inicio||'')?-1:1).forEach(f=>{
      const fim=f.fimRepactuado||f.fim||'';
      let l=ends.findIndex(e=>(e||'')<(f.inicio||''));
      if(l===-1){l=ends.length;ends.push('');}ends[l]=fim;
    });
    const numLanes = Math.max(ends.length + semDatas.length, 1);
    if (numLanes <= 1) return rowH;
    const MIN_LANE = 0.13; // altura mínima legível por lane (~9pt)
    const needed = numLanes * MIN_LANE + (numLanes-1)*0.02 + 0.06;
    return Math.max(rowH, needed);
  };

  const renderRaiaRow = (r, ry, rh) => {
    const cy=ry+(rh-barH)/2;
    [[0.14,0.67],[0.81,2.37],[3.18,1.0],[4.18,0.69]].forEach(([cx,cw])=>S.push(shape({x:cx,y:ry,w:cw,h:rh,fill:"F2F2F2",line:GRID_LN})));
    cells.forEach(c=>{ const xa=fx(c.f0),xb=fx(c.f1); S.push(shape({x:xa,y:ry,w:xb-xa,h:rh,fill:c.futuro?"F8FAFC":"FFFFFF",line:GRID_LN})); });
    S.push(shape({x:0.16,y:ry,w:0.64,h:rh,text:r.lecom||"",textOpt:{sz:900,color:"404040",algn:"ctr",anchor:"ctr",wrap:"none"}}));
    S.push(shape({x:0.86,y:ry,w:2.28,h:rh,text:r.nome||"",textOpt:{sz:900,bold:true,color:"1F2A44",anchor:"ctr"}}));
    const stRaw = r.despriorizado ? 'Despriorizado' : (r.statusDemanda || 'A iniciar');
    const stCor = r.despriorizado ? '7F7F7F' : stRaw === 'Concluído' ? '00B050' : stRaw === 'Monitoramento e Controle' ? '0891B2' : stRaw === 'Op. Assistida' ? '14B8A6' : stRaw === 'Aguardando Publicação' ? 'F59E0B' : stRaw === 'Em Andamento' ? '0070C0' : stRaw === 'Atrasado' ? 'C00000' : '94A3B8';
    S.push(shape({x:3.18,y:ry,w:0.98,h:rh,text:stRaw,textOpt:{sz:900,bold:true,color:stCor,algn:"ctr",anchor:"ctr",wrap:"none"}}));
    const dtIni=(()=>{const d=r.fases[0]?.inicio||"";if(!d)return"";const x=new Date(d+"T12:00:00");if(isNaN(x))return"";return String(x.getDate()).padStart(2,"0")+"/"+String(x.getMonth()+1).padStart(2,"0");})();
    S.push(shape({x:4.18,y:ry,w:0.68,h:rh,text:dtIni,textOpt:{sz:900,color:"404040",algn:"ctr",anchor:"ctr",wrap:"none"}}));
    if(r.despriorizado){
      const xa=dX(r.fases.reduce((a,f)=>(f.inicio&&(!a||f.inicio<a)?f.inicio:a),null))??X0;
      const xb=dX(r.fases.reduce((a,f)=>(f.fim&&f.fim>a?f.fim:a),""))??X1;
      if(xb>xa){ S.push(shape({x:xa,y:cy,w:xb-xa,h:barH,fill:"D9D9D9",round:50000,text:"Despriorizado",textOpt:{sz:750,color:"64748B",algn:"ctr",anchor:"ctr",wrap:"none"}})); }
      return;
    }
    // Uma fase por lane, na ordem definida pelo usuário no card de edição (setas ⬆⬇).
    // Mantém consistência entre card, preview do Gantt e PPTX exportado.
    const lanesInfo = {
      asgn: r.fases.map((_, i) => i),
      n: Math.max(r.fases.length, 1),
    };
    
    const {asgn,n:numL}=lanesInfo;
    const lBarH=numL>1?Math.min(barH,(rh*0.75)/numL):barH;
    const lGap=numL>1?0.02:0;
    const totH=numL*lBarH+(numL-1)*lGap;
    const lTop=ry+Math.max(0,(rh-totH)/2);
    const MIN_BAR=0.25;
    r.fases.forEach((f,fi)=>{
      const lane=asgn[fi]; const cy2=lTop+lane*(lBarH+lGap);
      const rawCor = f.fase===FASE_CUSTOM ? '#64748B' : (FASES[f.fase]||"#999999");
      const cor=HX(rawCor); const corL=tintHex(cor);
      const frac=Math.max(0,Math.min(1,(Number(f.pct)||0)/100));
      if(f.aDefinir){
        const hoje=new Date(); const mesAtual=hoje.getMonth(); const anoAtual=hoje.getFullYear();
        const celsMes=cells.filter(c=>!c.futuro&&c.start instanceof Date&&c.start.getMonth()===mesAtual&&c.start.getFullYear()===anoAtual);
        const celsRef=celsMes.length>0?celsMes:cells.filter(c=>!c.futuro).slice(-2);
        const adefX=celsRef.length>0?fx(celsRef[0].f0):(X0+(X1-X0)*0.72);
        const adefW=celsRef.length>0?Math.max(fx(celsRef[celsRef.length-1].f1)-adefX,0.6):(X1-X0)*0.22;
        const adefLabel = faseLabel(f) ? faseLabel(f) + ' · A definir' : 'A definir';
        S.push(shape({x:adefX,y:cy2,w:adefW,h:lBarH,fill:"D9D9D9",round:50000,text:adefLabel,textOpt:{sz:550,bold:true,color:"64748B",algn:"ctr",anchor:"ctr",wrap:"none"}}));
        return;
      }
      const fimEfetivo = f.fimRepactuado || f.fim;
      const xa=dX(f.inicio), xb=dX(fimEfetivo);
      if(xa==null||xb==null) return;
      const naturalW=Math.max(xb-xa,0);
      const MIN_DISPLAY=0.6; // ~polegadas mínimas para caber % + data
      const f1fracPptx=dateToFrac(fimEfetivo,cells);
      const f0fracPptx=dateToFrac(f.inicio,cells);
      const f1cellPptx=f1fracPptx!=null?cells.find(c=>f1fracPptx>=c.f0&&f1fracPptx<c.f1)||cells[cells.length-1]:null;
      const f0cellPptx=f0fracPptx!=null?cells.find(c=>f0fracPptx>=c.f0&&f0fracPptx<c.f1)||cells[cells.length-1]:null;
      const sameMonthPptx=!!(f0cellPptx?.mesLabel&&f0cellPptx.mesLabel===f1cellPptx?.mesLabel&&!f1cellPptx?.futuro);
      
      // Fase inteira em tri comprimido → ocupa coluna inteira.
      // Fase que INICIA em tri comprimido → âncora no início da coluna.
      // Fase que TERMINA em tri comprimido → âncora no fim da coluna.
      // Consistência total com o preview em tela.
      const iniciaComprimidoPptx = !!f0cellPptx?.futuro;
      const terminaComprimidoPptx = !!f1cellPptx?.futuro;
      const emComprimidoPptx = iniciaComprimidoPptx && terminaComprimidoPptx && f0cellPptx === f1cellPptx;

      let barX, barW;
      if (emComprimidoPptx) {
        barX = fx(f0cellPptx.f0);
        barW = fx(f0cellPptx.f1) - fx(f0cellPptx.f0);
      } else if (iniciaComprimidoPptx || terminaComprimidoPptx) {
        barX = iniciaComprimidoPptx ? fx(f0cellPptx.f0) : xa;
        const rightX = terminaComprimidoPptx ? fx(f1cellPptx.f1) : xb;
        barW = rightX - barX;
      } else {
        barX = xa;
        barW = sameMonthPptx ? Math.max(naturalW, MIN_BAR) : Math.max(naturalW, naturalW < MIN_DISPLAY ? MIN_DISPLAY : MIN_BAR);
      }
      const xd = barX + barW * frac;
      
      S.push(shape({x:barX,y:cy2,w:barW,h:lBarH,fill:corL,round:50000}));
      if(f.fimRepactuado){const xbOrig=dX(f.fim);if(xbOrig!=null&&xbOrig<xb){S.push(shape({x:xbOrig-0.01,y:cy2,w:0.02,h:lBarH,fill:"F47B20"}));}}
      if(frac>0.01) S.push(shape({x:barX,y:cy2,w:barW*frac,h:lBarH,fill:cor,round:50000}));
      const dataTexto = f.fimRepactuado ? ddmm(f.fim)+'→'+ddmm(f.fimRepactuado) : ddmm(fimEfetivo);
      // Em trimestre comprimido, barra é larga o suficiente pra dois textos (% esq + data dir)
      const mostrar2Textos = naturalW >= MIN_BAR || emComprimidoPptx;
      if(mostrar2Textos){
        S.push(shape({x:barX+0.03,y:cy2,w:Math.max(0.3,xd-barX),h:lBarH,text:`${f.pct||0}%`,textOpt:{sz:emComprimidoPptx?550:600,bold:true,color:frac>0.12?"FFFFFF":"1E293B",algn:"l",anchor:"ctr",wrap:"none"}}));
        S.push(shape({x:barX,y:cy2,w:barW,h:lBarH,text:dataTexto,textOpt:{sz:emComprimidoPptx?550:600,bold:true,color:frac>=0.9?"FFFFFF":"1E293B",algn:"r",anchor:"ctr",wrap:"none"}}));
      } else {
        S.push(shape({x:barX,y:cy2,w:barW,h:lBarH,text:`${f.pct||0}% ${dataTexto}`,textOpt:{sz:550,bold:true,color:"1E293B",algn:"ctr",anchor:"ctr",wrap:"none"}}));
      }
    });
  };

  if (!usaPacotes || !pacotes?.length) {
    let curY = bodyTop;
    raias.forEach(r => { const rh=calcRhPptx(r); renderRaiaRow(r, curY, rh); curY+=rh; });
  } else {
    let curY = bodyTop;
    pacotes.forEach(pac => {
      const pacRaias = pac.raiaIds.map(id => raias.find(r=>r.id===id)).filter(Boolean);
      const info = calcPacoteInfo(pac, pacRaias);
      
      const sCor = info.status==='Concluído'?'00B050':info.status==='Monitoramento e Controle'?'0891B2':info.status==='Op. Assistida'?'14B8A6':info.status==='Aguardando Publicação'?'F59E0B':info.status==='Em Andamento'?'0070C0':info.status==='Atrasado'?'C00000':'94A3B8';
      const pacH = rowH;
      const ry = curY;
      [[0.14,0.67],[0.81,2.37],[3.18,1.0],[4.18,0.69]].forEach(([cx,cw])=>S.push(shape({x:cx,y:ry,w:cw,h:pacH,fill:"EEF4FF",line:GRID_LN})));
      cells.forEach(c=>{ const xa=fx(c.f0),xb=fx(c.f1); S.push(shape({x:xa,y:ry,w:xb-xa,h:pacH,fill:c.futuro?"EEF4FF":"F0F6FF",line:GRID_LN})); });
      S.push(shape({x:0.16,y:ry,w:0.64,h:pacH,text:"Pac",textOpt:{sz:800,bold:true,color:"2F5597",algn:"ctr",anchor:"ctr"}}));
      S.push(shape({x:0.86,y:ry,w:2.28,h:pacH,text:pac.nome,textOpt:{sz:900,bold:true,color:"1E3A6E",anchor:"ctr"}}));
      S.push(shape({x:3.18,y:ry,w:0.98,h:pacH,text:info.status,textOpt:{sz:900,bold:true,color:sCor,algn:"ctr",anchor:"ctr",wrap:"none"}}));
      S.push(shape({x:4.18,y:ry,w:0.68,h:pacH,text:ddmm(info.minInicio),textOpt:{sz:700,bold:true,color:"2F5597",algn:"ctr",anchor:"ctr",wrap:"none"}}));
      const xaPac=dX(info.minInicio), xbPac=dX(info.maxFim);
      if(xaPac!=null&&xbPac!=null&&xbPac>xaPac){
        const wPac=xbPac-xaPac; const frac=Math.max(0,Math.min(1,info.pctMedia/100));
        S.push(shape({x:xaPac,y:ry+(pacH-barH)/2,w:wPac,h:barH,fill:tintHex(sCor,0.7),round:50000}));
        if(frac>0.01) S.push(shape({x:xaPac,y:ry+(pacH-barH)/2,w:wPac*frac,h:barH,fill:sCor,round:50000}));
        S.push(shape({x:xaPac,y:ry+(pacH-barH)/2,w:wPac,h:barH,text:`${info.pctMedia}%  ${ddmm(info.maxFim)}`,textOpt:{sz:600,bold:true,color:frac>0.5?"FFFFFF":"1E293B",algn:"ctr",anchor:"ctr",wrap:"none"}}));
      }
      curY += pacH;
      pacRaias.forEach(r => { const rh=calcRhPptx(r); renderRaiaRow(r, curY, rh); curY+=rh; });
    });
  }

  // hoje
  const hojeX=dX(projeto.atualizadoEm);
  if(hojeX!=null){ S.push(dashLine({x:hojeX,y:hY,h:bodyBottom-hY,color:"ED7D31",w:0.02})); S.push(shape({x:hojeX-0.07,y:hY-0.14,w:0.14,h:0.14,prst:"diamond",fill:"ED7D31"})); }

  // pontos
  S.push(shape({x:0.1,y:6.0,w:3,h:0.26,text:"Pontos de Atenção",textOpt:{sz:1300,bold:true,color:"003B82"}}));
  S.push(shape({x:0.14,y:6.28,w:13.04,h:0.78,fill:"F2F2F2",line:{color:"CBD5E1",w:0.01},round:6000}));
  if(projeto.pontosAtencao) S.push(shape({x:0.3,y:6.34,w:12.7,h:0.66,text:projeto.pontosAtencao,textOpt:{sz:900,color:"1E293B",anchor:"t"}}));

  // rodapé
  S.push(shape({x:0.14,y:7.18,w:10,h:0.28,text:[{text:"Iniciado em: ",bold:1},{text:fmtBR(projeto.iniciadoEm)+"      "},{text:"Atualizado por: ",bold:1},{text:(projeto.atualizadoPor||"")+"   "},{text:"em: ",bold:1},{text:fmtBR(projeto.atualizadoEm)}],textOpt:{sz:900,color:"334155",anchor:"ctr"}}));
  S.push(shape({x:11.3,y:7.14,w:1.9,h:0.3,text:"Governança",textOpt:{sz:1200,bold:true,color:"003B82",algn:"r",anchor:"ctr"}}));

  return S.join("");
}

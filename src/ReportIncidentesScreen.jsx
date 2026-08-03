import { useState, useEffect } from "react";
import {
  ChevronLeft, LogOut, Info, Download, Eye,
  Check, AlertCircle, Users, Paperclip, Table2,
  AlertTriangle, TrendingUp, Loader2, Layers,
} from "lucide-react";
import { useAuth } from './AuthContext';
import { logAudit, loadIncidentesTemplate, getIncidentesTemplateInfo } from './supabaseClient';
import {
  analisarBase, gerarReportIncidentes,
  MAX_ATRASADO, MAX_AGUARDANDO, MAX_BACKLOG,
} from './reportIncidentesEngine';

/* ── STORAGE: o template fica no Supabase Storage ──────────────────────────
   Funções de carregamento estão em ./supabaseClient.js:
   - loadIncidentesTemplate()    → ArrayBuffer do .pptx atual
   - getIncidentesTemplateInfo() → { name, updatedAt, size }
   Upload de nova versão: feito pelo admin direto no painel do Supabase,
   em templates/incidentes/report_incidentes_template.pptx (mesmo padrão da RAS).
   ────────────────────────────────────────────────────────────────────────── */

/* ── CAMPOS DO FORMULÁRIO ───────────────────────────────────────────────────── */
const CAMPOS_DEF = [
  { key: "capaArea",      label: "Nome da área (capa)", ph: "Marketing – Projetos Corporativos", full: true },
  { key: "areaExecutora", label: "Área Executora",      ph: "TI – Growth Comercial" },
  { key: "diretor",       label: "Diretor",             ph: "Bernardo Marotta" },
  { key: "produto",       label: "Produto",             ph: "Thais Lino" },
  { key: "tecnologia",    label: "Tecnologia",          ph: "Guilherme Humberto" },
];

/* ── STYLES ─────────────────────────────────────────────────────────────────── */
const S = {
  page: {
    fontFamily: "'Inter',system-ui,sans-serif",
    fontSize: 14, color: "#071735", background: "#f5f7fb",
    minHeight: "100vh", margin: 0,
  },
  container: { maxWidth: 900, margin: "0 auto", padding: "0 28px 48px" },
  hero: {
    marginTop: 28, height: 150,
    background: "linear-gradient(90deg,#001b4d,#003d8f)",
    borderRadius: 18, padding: "0 44px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    color: "#fff", boxShadow: "0 15px 35px rgba(0,0,0,0.15)",
  },
  heroLeft: { display: "flex", gap: 28, alignItems: "center" },
  heroIcon: {
    width: 68, height: 68, borderRadius: 14,
    background: "rgba(255,255,255,0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 30, flexShrink: 0,
  },
  heroTitle: { fontSize: 26, fontWeight: 700, margin: 0 },
  heroSub: { fontSize: 14, opacity: 0.88, marginTop: 8 },
  infoBanner: {
    marginTop: 20, padding: "14px 22px", borderRadius: 12,
    border: "1px solid #c9daf5", background: "#eef5ff", color: "#003d8f",
    fontSize: 13, lineHeight: 1.65,
    display: "flex", gap: 10, alignItems: "flex-start",
  },
  card: {
    marginTop: 20, background: "#fff", borderRadius: 18,
    padding: "28px 32px", boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
  },
  cardTitle: { display: "flex", alignItems: "center", gap: 16, marginBottom: 24 },
  cardNum: {
    width: 34, height: 34, borderRadius: "50%",
    background: "#001b4d", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontSize: 15, flexShrink: 0,
  },
  cardH2: { fontSize: 17, fontWeight: 700, margin: 0 },
  cardSub: { fontSize: 13, fontWeight: 400, color: "#526070", marginLeft: 8 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  label: { display: "block", fontSize: 13, color: "#526070", fontWeight: 600, marginBottom: 8 },
  input: {
    width: "100%", height: 44,
    border: "1px solid #ccd6e4", borderRadius: 10,
    padding: "0 14px", fontSize: 15,
    outline: "none", boxSizing: "border-box",
    fontFamily: "'Inter',system-ui,sans-serif",
  },
  actions: {
    display: "flex", gap: 16, marginTop: 28, paddingTop: 24,
    borderTop: "1px solid #e5eaf1",
  },
  btnPreview: {
    flex: 1, height: 52, borderRadius: 10, border: "1px solid #ccd6e4",
    background: "#fff", color: "#003d8f", fontWeight: 700, fontSize: 16, cursor: "pointer",
  },
  btnPreviewDisabled: {
    flex: 1, height: 52, borderRadius: 10, border: "1px solid #ccd6e4",
    background: "#f0f2f5", color: "#99a3b0", fontWeight: 700, fontSize: 16, cursor: "not-allowed",
  },
  btnGenerate: {
    flex: 2, height: 52, borderRadius: 10, border: "none",
    background: "#003d8f", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer",
  },
  btnGenerateDisabled: {
    flex: 2, height: 52, borderRadius: 10, border: "1px solid #ccd6e4",
    background: "#f0f2f5", color: "#99a3b0", fontWeight: 700, fontSize: 16, cursor: "not-allowed",
  },
  msg: (type) => ({
    marginTop: 16, padding: "12px 18px", borderRadius: 10, fontSize: 13,
    background: type === "err" ? "#fce8e8" : type === "ok" ? "#e1f5ee" : type === "warn" ? "#fff7e6" : "#eef5ff",
    color: type === "err" ? "#a32d2d" : type === "ok" ? "#0f6e56" : type === "warn" ? "#854f0b" : "#003d8f",
    border: `1px solid ${type === "err" ? "#f5c2c2" : type === "ok" ? "#b7e4cc" : type === "warn" ? "#fcd98a" : "#c9daf5"}`,
  }),
  preview: {
    marginTop: 20, background: "#fff", borderRadius: 18,
    padding: "24px 28px", boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
  },
  previewTitle: {
    fontSize: 14, fontWeight: 700, color: "#526070",
    marginBottom: 20, display: "flex", alignItems: "center", gap: 8,
  },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  infoBox: { background: "#f8faff", borderRadius: 12, padding: "14px 16px", border: "1px solid #e5eaf1" },
  infoBoxTitle: { fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#071735" },
  infoRow: { fontSize: 12, color: "#526070", marginBottom: 4 },
};

/* ── REACT COMPONENT ────────────────────────────────────────────────────────── */
export default function ReportIncidentesScreen({ onVoltar }) {
  const { profile, signOut } = useAuth();

  const [tpl, setTpl] = useState(null);              // { buf }
  const [tplInfo, setTplInfo] = useState(null);      // { name, updatedAt, size }
  const [tplLoading, setTplLoading] = useState(true);
  const [tplError, setTplError] = useState(null);

  const [baseBuf, setBaseBuf] = useState(null);
  const [baseName, setBaseName] = useState(null);
  const [baseStatus, setBaseStatus] = useState({ state: "idle", msg: "" });

  const [campos, setCampos] = useState({
    capaArea: "", areaExecutora: "", diretor: "", produto: "", tecnologia: "",
  });

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [genStatus, setGenStatus] = useState({ state: "idle", msg: "", file: "" });
  const [msg, setMsg] = useState({ text: "", type: "info" });

  const iniciais = (profile?.name || profile?.email || 'US')
    .split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase().slice(0, 2);

  // ── Carregar template do Supabase Storage ao montar ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [bufResult, infoResult] = await Promise.all([
          loadIncidentesTemplate(),
          getIncidentesTemplateInfo(),
        ]);
        if (!alive) return;
        if (bufResult) {
          setTpl({ buf: bufResult });
          setTplInfo(infoResult);
          setTplError(null);
        } else {
          setTplError("Template não encontrado no Supabase Storage. Avise a equipe de Governança para fazer upload em templates/incidentes/report_incidentes_template.pptx.");
        }
      } catch (e) {
        if (!alive) return;
        setTplError(`Erro ao carregar template: ${e.message || "verifique conexão."}`);
      } finally {
        if (alive) setTplLoading(false);
      }
    })();

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
    if (!document.getElementById("inc-spin-css")) {
      const st = document.createElement("style");
      st.id = "inc-spin-css";
      st.textContent = "@keyframes inc-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(st);
    }

    return () => { alive = false; };
  }, []);

  // ── Upload da base .xlsx ──
  const onXlsx = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setBaseName(f.name);
    setPreview(null);
    setGenStatus({ state: "idle", msg: "", file: "" });
    setBaseStatus({ state: "loading", msg: "Lendo arquivo…" });
    try {
      const buf = await f.arrayBuffer();
      // Valida aba e colunas já na importação — erro cedo é melhor que erro na geração
      const a = analisarBase(buf);
      setBaseBuf(buf);
      setBaseStatus({
        state: "ok",
        msg: `Base carregada · ${a.kpis.total} incidentes válidos.`,
      });
      try {
        await logAudit({
          action: 'IMPORT_INCIDENTES_BASE',
          entity: 'xlsx',
          detail: { file_name: f.name, total_validos: a.kpis.total, atrasados: a.kpis.atrasado },
        });
      } catch (_) {}
    } catch (err) {
      setBaseStatus({ state: "error", msg: err.message || "Arquivo inválido ou corrompido." });
      setBaseBuf(null);
    }
  };

  const onCampo = (k) => (e) => setCampos((c) => ({ ...c, [k]: e.target.value }));

  const camposOk = CAMPOS_DEF.every((c) => campos[c.key].trim() !== "");
  const canPrev = !!(baseBuf && !busy && !previewing);
  const canGen = !!(tpl && baseBuf && camposOk && !busy && !previewing);

  // ── Pré-visualizar ──
  const doPreview = () => {
    if (!baseBuf) { setMsg({ text: "Envie a base .xlsx.", type: "err" }); return; }
    setPreviewing(true);
    setMsg({ text: "", type: "info" });
    setTimeout(() => {
      try {
        setPreview(analisarBase(baseBuf));
      } catch (e) {
        setMsg({ text: `Erro ao analisar a base: ${e.message}`, type: "err" });
        setPreview(null);
      }
      setPreviewing(false);
    }, 30);
  };

  // ── Gerar e baixar ──
  const doGenerate = async () => {
    if (!canGen) return;
    setBusy(true);
    setMsg({ text: "", type: "info" });
    setGenStatus({ state: "loading", msg: "Montando o PPTX…", file: "" });
    try {
      const { blob, resumo } = await gerarReportIncidentes({
        templateBuf: tpl.buf,
        xlsxBuf: baseBuf,
        campos,
      });
      setPreview(analisarBase(baseBuf));

      setGenStatus({ state: "loading", msg: "Preparando o arquivo para download…", file: "" });
      const t = new Date();
      const dd = String(t.getDate()).padStart(2, "0");
      const mm = String(t.getMonth() + 1).padStart(2, "0");
      const fn = `StatusReport_Incidentes_${dd}-${mm}-${t.getFullYear()}.pptx`;

      try {
        const arrayBuf = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        const b64 = btoa(binary);
        const dataUrl = "data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64," + b64;
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = fn;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        throw new Error(`ao preparar o download: ${err.message}`);
      }

      try {
        await logAudit({
          action: 'GENERATE_PPTX_INCIDENTES',
          entity: 'pptx',
          entityId: fn,
          detail: {
            total: resumo.total,
            concluido: resumo.concluido,
            andamento: resumo.andamento,
            atrasado: resumo.atrasado,
            slides: resumo.totalSlides,
            capa: campos.capaArea,
          },
        });
      } catch (_) {}

      setGenStatus({
        state: "ok",
        msg: `Download concluído · ${resumo.totalSlides} slides (${resumo.slidesDashboard} dashboard, ${resumo.slidesBacklog} backlog).`,
        file: fn,
      });
    } catch (e) {
      setGenStatus({ state: "error", msg: `Erro ${e.message}`, file: "" });
    }
    setBusy(false);
  };

  return (
    <div style={S.page}>
      {/* ── HEADER PADRÃO PLATAFORMA HAPVIDA ── */}
      <header style={{
        height: 80, background: 'linear-gradient(90deg,#001b4d,#003d8f)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 40px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src="/logo-hapvida.png" alt="Hapvida" style={{ height: 36 }} />
          <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.35)' }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
            Plataforma | <span style={{ color: '#ff7900' }}>Governança TI</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.12)',
            }}>{iniciais}</div>
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{profile?.name || 'Usuário'}</div>
              <div style={{ opacity: 0.75, fontSize: 11 }}>{profile?.email}</div>
            </div>
          </div>
          <button onClick={signOut} style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', borderRadius: 8, padding: '7px 14px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <LogOut size={13} /> Sair
          </button>
        </div>
      </header>

      <div style={S.container}>
        {/* ── VOLTAR ── */}
        <div style={{ padding: '18px 0 0' }}>
          <button onClick={onVoltar} style={{
            background: 'transparent', border: 'none', color: '#003d8f',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 0',
          }}>
            <ChevronLeft size={18} /> Voltar ao início
          </button>
        </div>

        {/* ── HERO ── */}
        <div style={S.hero}>
          <div style={S.heroLeft}>
            <div style={S.heroIcon}>{<AlertTriangle size={30} color='#fff' />}</div>
            <div>
              <h1 style={S.heroTitle}>Atualizar Incidentes</h1>
              <p style={S.heroSub}>Report Semanal de Incidentes · Dashboard Executivo</p>
            </div>
          </div>
          {preview && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>Última pré-visualização</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{preview.kpis.total} incidentes</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{new Date().toLocaleDateString("pt-BR")}</div>
            </div>
          )}
        </div>

        {/* ── INFO BANNER ── */}
        <div style={S.infoBanner}>
          <span style={{ display: "flex", flexShrink: 0, marginTop: 1 }}>{<Info size={17} color="#185fa5" />}</span>
          <span>O template fica salvo na <strong>memória compartilhada da equipe</strong> — qualquer pessoa com o link vê o mesmo template. A base xlsx fica só no seu navegador e não é compartilhada.</span>
        </div>

        {/* ── MESSAGE ── */}
        {msg.text && <div style={S.msg(msg.type)}>{msg.text}</div>}

        {/* ── CARD 1: TEMPLATE ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <div style={S.cardNum}>1</div>
            <div>
              <span style={S.cardH2}>Template PowerPoint</span>
              <span style={S.cardSub}>Gerenciado pela equipe de Governança · somente leitura</span>
            </div>
          </div>
          {tplLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", background: "#f7f9fc", borderRadius: 12, border: "1px solid #cfd9ea" }}>
              <Spinner color="#5a6a82" size={20} />
              <div style={{ fontSize: 13, color: "#526070" }}>Carregando template do servidor…</div>
            </div>
          ) : tplError ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 20px", background: "#fdf2f2", borderRadius: 12, border: "1px solid #f5c2c2" }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>{<AlertCircle size={22} color="#c0392b" />}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#a32d2d" }}>Template indisponível</div>
                <div style={{ fontSize: 12, color: "#a32d2d", marginTop: 3, lineHeight: 1.45 }}>{tplError}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", background: "#f0faf5", borderRadius: 12, border: "1px solid #b7e4cc" }}>
              <span style={{ display: "flex" }}>{<Users size={22} color="#0f6e56" />}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#071735" }}>
                  {tplInfo?.name || 'report_incidentes_template.pptx'}
                </div>
                <div style={{ fontSize: 12, color: "#526070", marginTop: 3 }}>
                  Salvo na memória da equipe
                  {tplInfo?.updatedAt ? ` · atualizado em ${new Date(tplInfo.updatedAt).toLocaleDateString("pt-BR")}` : ""}
                </div>
              </div>
              <span style={{ fontSize: 13, color: "#0f6e56", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                {<Check size={13} color="#0f6e56" />} Pronto
              </span>
            </div>
          )}
        </div>

        {/* ── CARD 2: BASE XLSX ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <div style={S.cardNum}>2</div>
            <div>
              <span style={S.cardH2}>Base semanal</span>
              <span style={S.cardSub}>Nova exportação toda semana · aba "Work items"</span>
            </div>
          </div>
          <XlsxCard
            label="Importar base de Incidentes em .xlsx"
            loaded={!!baseBuf}
            fileName={baseName}
            status={baseStatus}
            onChange={onXlsx}
          />
        </div>

        {/* ── CARD 3: CAMPOS ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <div style={S.cardNum}>3</div>
            <div>
              <span style={S.cardH2}>Identificação</span>
              <span style={S.cardSub}>Capa e cabeçalho do dashboard</span>
            </div>
          </div>
          <div style={S.formGrid}>
            {CAMPOS_DEF.map((c) => (
              <div key={c.key} style={c.full ? { gridColumn: "1 / -1" } : undefined}>
                <label style={S.label}>{c.label}</label>
                <input
                  value={campos[c.key]}
                  onChange={onCampo(c.key)}
                  placeholder={c.ph}
                  style={S.input}
                />
              </div>
            ))}
          </div>

          {/* ── ACTIONS ── */}
          <div style={S.actions}>
            <button onClick={doPreview} disabled={!canPrev}
              style={canPrev ? S.btnPreview : S.btnPreviewDisabled}>
              {previewing
                ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Spinner color="#003d8f" /> Processando…</span>
                : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>{<Eye size={15} color="#003d8f" />} Pré-visualizar</span>}
            </button>
            <button onClick={doGenerate} disabled={!canGen}
              style={canGen ? S.btnGenerate : S.btnGenerateDisabled}>
              {busy
                ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Spinner color="#fff" /> Gerando PPTX…</span>
                : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>{<Download size={15} color="#fff" />} Gerar e baixar PPTX</span>}
            </button>
          </div>

          {!camposOk && baseBuf && (
            <div style={{ fontSize: 12, color: "#854f0b", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertCircle size={13} color="#854f0b" /> Preencha os 5 campos de identificação para liberar a geração.
            </div>
          )}

          {/* ── GENERATION STATUS PANEL ── */}
          {genStatus.state !== "idle" && (
            <div style={{
              marginTop: 14, padding: "14px 18px", borderRadius: 12,
              display: "flex", gap: 12, alignItems: "flex-start",
              border: genStatus.state === "error" ? "1px solid #f5c2c2" : genStatus.state === "ok" ? "1px solid #b7e4cc" : "1px solid #cfd9ea",
              background: genStatus.state === "error" ? "#fdf2f2" : genStatus.state === "ok" ? "#f0faf5" : "#f7f9fc",
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: genStatus.state === "error" ? "#c0392b" : genStatus.state === "ok" ? "#008c35" : "#5a6a82",
              }}>
                {genStatus.state === "loading" ? <Spinner color="#fff" size={18} />
                  : genStatus.state === "ok" ? <Check size={20} color="#fff" />
                  : <AlertCircle size={20} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600, fontSize: 13,
                  color: genStatus.state === "error" ? "#a32d2d" : genStatus.state === "ok" ? "#0f6e56" : "#3a4a63",
                }}>
                  {genStatus.state === "loading" ? "Gerando o PPTX…" : genStatus.state === "ok" ? "Pronto!" : "Não foi possível gerar"}
                </div>
                <div style={{
                  fontSize: 12, marginTop: 3, lineHeight: 1.45,
                  color: genStatus.state === "error" ? "#a32d2d" : "#526070",
                }}>
                  {genStatus.msg}
                </div>
                {genStatus.state === "ok" && genStatus.file ? (
                  <div style={{
                    fontSize: 11, marginTop: 4, color: "#526070", fontStyle: "italic",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{<Download size={11} color="#526070" />} {genStatus.file}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* ── PREVIEW ── */}
        {preview && <PreviewPanel d={preview} />}
      </div>
    </div>
  );
}

/* ── SUB-COMPONENTS ─────────────────────────────────────────────────────────── */
function Spinner({ color = "#003d8f", size = 16 }) {
  return <Loader2 size={size} color={color} style={{ animation: "inc-spin 0.7s linear infinite", flexShrink: 0 }} />;
}

function XlsxCard({ label, loaded, fileName, status, onChange }) {
  const st = status || { state: "idle", msg: "" };
  const isLoading = st.state === "loading";
  const isError = st.state === "error";
  const border = isError ? "1px solid #f5c2c2" : isLoading ? "1px solid #cfd9ea" : loaded ? "1px solid #b7e4cc" : "1px solid #ccd6e4";
  const bg = isError ? "#fdf2f2" : isLoading ? "#f7f9fc" : loaded ? "#f0faf5" : "#fff";
  const iconBg = isError ? "#c0392b" : isLoading ? "#5a6a82" : "#008c35";
  return (
    <label style={{
      display: "flex", alignItems: "flex-start", gap: 14,
      minHeight: loaded || isError || isLoading ? 76 : 68, padding: "14px 22px",
      border, borderRadius: 12, cursor: isLoading ? "wait" : "pointer",
      background: bg, userSelect: "none", minWidth: 240, maxWidth: 420,
      transition: "all 0.2s",
    }}>
      <div style={{
        width: 40, height: 40, background: iconBg, color: "#fff",
        borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {isLoading ? <Spinner color="#fff" size={18} /> : isError ? <AlertCircle size={20} color="#fff" /> : <Table2 size={18} color="#fff" />}
      </div>
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#071735" }}>{label}</div>
        {fileName && !isError ? (
          <div style={{
            fontSize: 11, marginTop: 3, color: "#526070", fontStyle: "italic",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 300,
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{<Paperclip size={11} color="#526070" />} {fileName}</span>
          </div>
        ) : null}
        {isLoading ? (
          <div style={{ fontSize: 12, marginTop: 3, color: "#5a6a82", display: "flex", alignItems: "center", gap: 5 }}>
            <Spinner color="#5a6a82" size={11} /> Carregando…
          </div>
        ) : isError ? (
          <div style={{ fontSize: 12, marginTop: 4, color: "#a32d2d", lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 4 }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{<AlertCircle size={12} color="#a32d2d" />}</span>
            <span>{st.msg}</span>
          </div>
        ) : loaded ? (
          <div style={{ fontSize: 12, marginTop: 3, color: "#0f6e56", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {<Check size={12} color="#0f6e56" />} {st.msg || "Carregado"} — clique para trocar
          </div>
        ) : (
          <div style={{ fontSize: 12, marginTop: 2, color: "#526070" }}>Clique para selecionar</div>
        )}
      </div>
      <input type="file" accept=".xlsx" onChange={onChange} style={{ display: "none" }} disabled={isLoading} />
    </label>
  );
}

function KPIBox({ label, value, pct, color }) {
  return (
    <div style={{ background: "#f8faff", borderRadius: 12, padding: "16px 12px", textAlign: "center", border: "1px solid #e5eaf1" }}>
      <div style={{ fontSize: 11, color: "#526070", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {pct != null && <div style={{ fontSize: 11, color: "#526070", marginTop: 5 }}>{pct}</div>}
    </div>
  );
}

function PreviewPanel({ d }) {
  const k = d.kpis;
  return (
    <div style={S.preview}>
      <div style={S.previewTitle}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          {<TrendingUp size={13} color="#526070" />} Pré-visualização · {new Date().toLocaleDateString("pt-BR")}
        </span>
      </div>

      <div style={S.kpiGrid}>
        <KPIBox label="Total" value={k.total} pct={null} color="#001b4d" />
        <KPIBox label="Concluído" value={k.concluido} pct={k.concluidoPct} color="#00B050" />
        <KPIBox label="Andamento" value={k.andamento} pct={k.andamentoPct} color="#ED7D31" />
        <KPIBox label="Atrasado" value={k.atrasado} pct={k.atrasadoPct} color="#C00000" />
      </div>

      {/* Quantos slides vão sair — o usuário vê a paginação ANTES de gerar */}
      <div style={{
        ...S.infoBox, marginBottom: 12,
        display: "flex", alignItems: "center", gap: 12,
        background: "#eef5ff", border: "1px solid #c9daf5",
      }}>
        <Layers size={18} color="#003d8f" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: "#003d8f", lineHeight: 1.5 }}>
          O PPTX vai sair com <strong>{d.totalSlides} slides</strong> —
          capa · <strong>{d.slidesDashboard}</strong> {d.slidesDashboard > 1 ? "páginas" : "página"} de dashboard ·{" "}
          <strong>{d.slidesBacklog}</strong> {d.slidesBacklog > 1 ? "páginas" : "página"} de backlog · encerramento.
        </div>
      </div>

      <div style={S.infoGrid}>
        <div style={S.infoBox}>
          <div style={S.infoBoxTitle}>Target Atrasado · {d.atrasadoRows.length}</div>
          {d.atrasadoRows.length === 0
            ? <div style={S.infoRow}>Nenhum incidente atrasado.</div>
            : <>
                {d.atrasadoRows.slice(0, 3).map((r, i) => (
                  <div key={i} style={S.infoRow}>{r[0]} · {r[3]} · target {r[4]}</div>
                ))}
                {d.atrasadoRows.length > MAX_ATRASADO && (
                  <div style={{ ...S.infoRow, fontStyle: "italic" }}>
                    +{d.atrasadoRows.length - MAX_ATRASADO} em páginas seguintes
                  </div>
                )}
              </>}
        </div>

        <div style={S.infoBox}>
          <div style={S.infoBoxTitle}>Aguardando Homologação · {d.aguardandoRows.length}</div>
          {d.aguardandoRows.length === 0
            ? <div style={S.infoRow}>Nenhum item aguardando.</div>
            : <>
                {d.aguardandoRows.slice(0, 3).map((r, i) => (
                  <div key={i} style={S.infoRow}>{r[0]} · {r[3]} · target {r[4]}</div>
                ))}
                {d.aguardandoRows.length > MAX_AGUARDANDO && (
                  <div style={{ ...S.infoRow, fontStyle: "italic" }}>
                    +{d.aguardandoRows.length - MAX_AGUARDANDO} em páginas seguintes
                  </div>
                )}
              </>}
        </div>

        <div style={S.infoBox}>
          <div style={S.infoBoxTitle}>Distribuição por Status</div>
          {d.porStatus.cats.map((c, i) => (
            <div key={c} style={S.infoRow}>{c} · {d.porStatus.vals[i]}</div>
          ))}
        </div>

        <div style={S.infoBox}>
          <div style={S.infoBoxTitle}>Incidentes por Squad</div>
          {d.porSquad.cats.map((c, i) => (
            <div key={c} style={S.infoRow}>{c} · {d.porSquad.vals[i]} ({d.porSquad.pcts[i]}%)</div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#99a3b0", marginTop: 12, lineHeight: 1.5 }}>
        Backlog quebra a cada {MAX_BACKLOG} linhas. Target Atrasado e Aguardando quebram a cada {MAX_ATRASADO}.
        Registros com status Removed ou Rejected ficam fora de todos os cálculos.
      </div>
    </div>
  );
}

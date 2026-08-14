/**
 * ganttCore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * O CÁLCULO do Gantt: cores das fases, timeline em trimestres/quinzenas,
 * conversão de data em posição horizontal, faixas de fases sobrepostas,
 * resumo de pacote e legenda do projeto.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * Estas funções nasceram no App.jsx e são usadas por três desenhos diferentes:
 *   1. o preview do Gantt na tela do Atualizar Status
 *   2. o gerador de OOXML do PPTX
 *   3. o slide HTML da Reunião  ← o novo
 * O desenho de cada um é próprio e legítimo. O CÁLCULO tem que ser um só: se
 * `dateToFrac` divergir, a mesma data cai em posições diferentes na tela, no
 * PPTX e no PDF — e ninguém percebe até alguém comparar dois documentos lado a
 * lado numa reunião.
 *
 * CÓPIA LITERAL do App.jsx. Nada foi renomeado, reordenado ou "melhorado" na
 * mudança. Equivalência verificada por comparação automática antes da entrega.
 *
 * O que NÃO veio junto, de propósito:
 *   • BarRow          — 137 linhas de desenho, dimensionadas para o editor
 *   • mapaCoresCustom — usado só na edição, para atribuir cor a fase manual
 *
 * Módulo puro: sem React, sem DOM, sem Supabase.
 */

/* ═══════════════════════ CORES E CONSTANTES ═══════════════════════ */

export const FASES = {
  Planejamento:   "#7030A0",
  Desenvolvimento:"#0070C0",
  "Homologação":  "#ED7D31",
  Entrega:        "#00B050",
  "Op. Assistida":"#006100",
};
export const ORDEM_FASES     = Object.keys(FASES);
export const FASE_CUSTOM     = '__manual__';
export const FASE_CUSTOM_COR = '#64748B';
export const A_DEFINIR_COR   = '#D9D9D9';
export const CINZA_DESPRI    = "#D9D9D9";

export const STATUS_GERAL = {
  Bom:            "#69AE9A",
  "Com Riscos":   "#FDB713",
  "Com Problemas":"#FF0000",
};

export const MESES = ["JAN","FEV","MAR","ABRIL","MAIO","JUNHO","JUL","AGO","SET","OUT","NOV","DEZ"];

/* ═══════════════════════ FASE ═══════════════════════ */

export function faseCor(f) {
  if (!f) return '#999999';
  if (f.fase === FASE_CUSTOM) return f.cor || FASE_CUSTOM_COR;
  return FASES[f.fase] || '#999999';
}

/** Rótulo legível da fase. Fase manual usa o texto digitado pelo usuário. */
export function faseLabel(f) {
  if (!f) return '';
  if (f.fase === FASE_CUSTOM) return f.faseCustom || 'Manual';
  return f.fase || '';
}

export function statusCor(s) {
  return s === 'Concluído' ? '#00B050' : s === 'Monitoramento e Controle' ? '#0891B2' : s === 'Op. Assistida' ? '#006100' : s === 'Aguardando Publicação' ? '#F59E0B' : s === 'Em Andamento' ? '#0070C0' : s === 'Atrasado' ? '#C00000' : s === 'Plan./Esp.' ? '#7030A0' : '#94A3B8';
}

/** Data ISO -> "dd/mm". String vazia quando não há data ou ela é inválida. */
export const ddmm = (d) => { if (!d) return ""; const x = new Date(d + "T12:00:00"); if (isNaN(x)) return ""; return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}`; };

/* ═══════════════════════ DEMANDA E PACOTE ═══════════════════════ */

/** % da demanda: média das fases, ignorando as que estão "a definir". */
export function calcPctRaia(r) {
  const fases = (r.fases || []).filter(f => !f.aDefinir);
  if (!fases.length) return 0;
  return fases.reduce((s, f) => s + (Number(f.pct) || 0), 0) / fases.length;
}

/**
 * Resumo de um pacote a partir das suas demandas.
 * O status do pacote é por PRIORIDADE, não por maioria: basta uma demanda
 * atrasada para o pacote inteiro ficar atrasado. "Concluído" exige todas.
 */
export function calcPacoteInfo(pac, pacRaias) {
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
                  : statuses.includes('Plan./Esp.') ? 'Plan./Esp.'
                  : statuses.length && statuses.every(s => s === 'Concluído') ? 'Concluído'
                  : 'A iniciar';

  return { minInicio, maxFim, pctMedia, status };
}

/**
 * Uma fase por faixa, na ordem do array — que é a ordem que o usuário definiu
 * com os botões ⬆⬇. Não tenta empacotar fases que não se sobrepõem: fase que
 * troca de linha entre uma semana e outra confunde mais do que economiza.
 */
export function assignLanes(fases) {
  if (!fases.length) return { assignments: [], numLanes: 1 };
  return {
    assignments: fases.map((_, i) => i),
    numLanes: Math.max(fases.length, 1),
  };
}

/* ═══════════════════════ LEGENDA ═══════════════════════ */

/**
 * Itens da legenda do PROJETO inteiro — não da página.
 * Fases padrão saem na ordem canônica; manuais depois, em ordem alfabética.
 * "A definir" e "Despriorizado" só aparecem se existirem de fato.
 */
export function legendaDoProjeto(raias) {
  const usadas = new Map();
  let temADefinir = false, temDespri = false;
  (raias || []).forEach(r => {
    if (r.despriorizado) { temDespri = true; return; }
    (r.fases || []).forEach(f => {
      if (f.aDefinir) { temADefinir = true; return; }
      const label = faseLabel(f);
      if (!label || (f.fase === FASE_CUSTOM && !(f.faseCustom || '').trim())) return;
      if (!usadas.has(label)) usadas.set(label, faseCor(f));
    });
  });
  const itens = [];
  ORDEM_FASES.forEach(nome => {
    if (usadas.has(nome)) { itens.push({ label: nome, cor: usadas.get(nome), estrela: nome === 'Entrega' }); usadas.delete(nome); }
  });
  [...usadas.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .forEach(([label, cor]) => itens.push({ label, cor }));
  if (temADefinir) itens.push({ label: 'A definir', cor: A_DEFINIR_COR });
  if (temDespri)   itens.push({ label: 'Despriorizado', cor: CINZA_DESPRI });
  return itens;
}

/* ═══════════════════════ TIMELINE ═══════════════════════ */

/**
 * Monta as colunas do cronograma.
 *
 * O trimestre vigente é detalhado em 6 quinzenas (peso 1 cada); trimestres
 * passados e futuros ocupam uma coluna estreita (peso 0,55). É o que dá espaço
 * ao "agora" sem perder o horizonte.
 *
 * Cada célula sai com `f0`/`f1` — a fração 0..1 que ela ocupa na largura total.
 * Assim o desenho não precisa saber de pesos: posiciona por porcentagem.
 */
export function buildTimeline(ano, mesInicio /*1-based*/, nFuturos, nPassados = 0) {
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

/** Data -> fração 0..1 ao longo da timeline. null quando a data é inválida. */
export function dateToFrac(date, cells) {
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

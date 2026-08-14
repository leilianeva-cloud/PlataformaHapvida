/**
 * statusPaginacao.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Paginação do Gantt de um projeto: dado o conjunto de raias/pacotes, decide
 * quantas páginas (slides) o projeto ocupa e o que entra em cada uma.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * Esta regra nasceu dentro de `gerarSlidesXmls()` no App.jsx, colada no gerador
 * de OOXML. A Reunião precisa da MESMA regra para renderizar em HTML e para
 * dizer "este projeto gera 2 slides". Recalcular por fora criaria duas verdades:
 * o roteiro diria 2 páginas e o PPTX sairia com 3.
 *
 * O código abaixo é CÓPIA LITERAL do App.jsx — mesmas constantes, mesma ordem
 * de operações, mesmos arredondamentos. Nada foi "melhorado" na mudança.
 *
 * ⚠️ ESTADO ATUAL: DUPLICADO DE PROPÓSITO, TEMPORARIAMENTE.
 * O App.jsx ainda tem a sua cópia. Enquanto isso for verdade, qualquer ajuste
 * na regra tem que ser feito NOS DOIS. A remoção da cópia do App.jsx está
 * prevista para o deploy seguinte e é uma troca pequena:
 *
 *   1. `import { paginarProjeto, buildUnidades } from './statusPaginacao'`
 *   2. apagar `buildUnidades` (linha ~128) e o miolo de `gerarSlidesXmls`
 *      entre `const MAX_LINHAS = 12` e o `flush()` final
 *   3. `gerarSlidesXmls` passa a ser: `paginarProjeto(...).map(montaSlide)`
 *
 * Módulo puro: sem React, sem DOM, sem Supabase. Testável fora do browser.
 */

/** Máximo de linhas por página (pacotes + demandas). */
export const MAX_LINHAS = 12;

/** Altura útil do corpo do slide, em polegadas (bodyBottom - bodyTop). */
export const BODY_TOP = 2.91;
export const BODY_BOTTOM = 5.92;
export const ALTURA_UTIL = BODY_BOTTOM - BODY_TOP; // 3.01"

/** Altura fixa por fase. Casa com o render — não é estimativa. */
export const LANE_H = 0.2;

/**
 * Ordena raias e pacotes conforme a ordem cadastrada pelo usuário.
 * Raias que estão dentro de um pacote não aparecem soltas.
 * Itens sem posição em `ordem` vão para o fim, pacotes antes de raias soltas.
 */
export function buildUnidades(raias, pacotes, ordem) {
  const rs = raias || [], ps = pacotes || [];
  const emPacote = new Set();
  ps.forEach(p => (p.raiaIds || []).forEach(id => emPacote.add(String(id))));
  const soltas = rs.filter(r => !emPacote.has(String(r.id)));
  const mapPac   = new Map(ps.map(p => [String(p.id), p]));
  const mapSolta = new Map(soltas.map(r => [String(r.id), r]));
  const out = [], usados = new Set();
  (ordem || []).forEach(o => {
    const key = o.t + ':' + String(o.id);
    if (usados.has(key)) return;
    if (o.t === 'pac'  && mapPac.has(String(o.id)))   { out.push({ t:'pac',  id:String(o.id), pac:  mapPac.get(String(o.id)) });   usados.add(key); }
    if (o.t === 'raia' && mapSolta.has(String(o.id))) { out.push({ t:'raia', id:String(o.id), raia: mapSolta.get(String(o.id)) }); usados.add(key); }
  });
  ps.forEach(p     => { if (!usados.has('pac:'  + String(p.id))) out.push({ t:'pac',  id:String(p.id), pac:p  }); });
  soltas.forEach(r => { if (!usados.has('raia:' + String(r.id))) out.push({ t:'raia', id:String(r.id), raia:r }); });
  return out;
}

/**
 * Altura mínima de uma raia, em polegadas.
 * Raia despriorizada não ocupa espaço. Com 1 fase, a altura é a da linha padrão
 * (devolve 0 e o cálculo da página usa `rh`). Com N fases, cada fase ganha uma
 * lane exclusiva.
 */
export function alturaMinRaia(r) {
  if (r.despriorizado) return 0;
  const n = Math.max((r.fases || []).length, 1);
  if (n <= 1) return 0;
  return n * LANE_H + (n - 1) * 0.02 + 0.06;
}

/** Altura total de uma página. Replica o cálculo interno de rowH do gerador. */
export function alturaPagina(us) {
  const rh = Math.min(0.42, ALTURA_UTIL / Math.max(us.length, 7));
  return us.reduce((s, u) => s + (u.kind === 'pac' ? rh : Math.max(rh, u.min)), 0);
}

/** Um conjunto de unidades cabe numa página? Limita por contagem E por altura. */
export function cabe(us) {
  return us.length <= MAX_LINHAS && alturaPagina(us) <= ALTURA_UTIL + 0.02;
}

/**
 * Divide um projeto em páginas.
 *
 * @param {object}  p
 * @param {Array}   p.raias        demandas/marcos do projeto
 * @param {boolean} p.usaPacotes   projeto agrupa em pacotes de entrega?
 * @param {Array}   p.pacotes      pacotes, cada um com `raiaIds`
 * @param {Array}   p.ordem        ordem cadastrada: [{ t:'pac'|'raia', id }]
 * @returns {Array<Array<Unidade>>} páginas; cada página é uma lista de unidades
 *          `{ kind:'raia', r, min, pacId? }` ou `{ kind:'pac', pac }`.
 *          Projeto sem demandas devolve `[[]]` — uma página vazia, não zero.
 */
export function paginarProjeto({ raias, usaPacotes, pacotes, ordem }) {
  const rs = raias || [];

  // ── SEM PACOTES: quebra linha a linha, na ordem cadastrada ──
  if (!usaPacotes || !pacotes?.length) {
    const units = rs.map(r => ({ kind: 'raia', r, min: alturaMinRaia(r) }));
    if (!units.length) return [[]];
    const pages = []; let cur = [];
    for (const u of units) {
      if (cur.length > 0 && !cabe([...cur, u])) { pages.push(cur); cur = []; }
      cur.push(u);
    }
    if (cur.length) pages.push(cur);
    return pages;
  }

  // ── COM PACOTES: o pacote começa no topo de uma página, salvo se couber no resto ──
  const pages = []; let cur = [];
  const flush = () => { if (cur.length) { pages.push(cur); cur = []; } };

  buildUnidades(rs, pacotes, ordem).forEach(un => {
    if (un.t === 'raia') {
      const u = { kind: 'raia', r: un.raia, min: alturaMinRaia(un.raia) };
      if (cur.length > 0 && !cabe([...cur, u])) flush();
      cur.push(u);
      return;
    }
    const pac = un.pac;
    const pacRaias = (pac.raiaIds || []).map(id => rs.find(x => x.id === id)).filter(Boolean);
    const header = { kind: 'pac', pac };
    const raiaUnits = pacRaias.map(r => ({ kind: 'raia', r, min: alturaMinRaia(r), pacId: pac.id }));
    const bloco = [header, ...raiaUnits];

    if (cabe(bloco)) {
      // pacote inteiro cabe numa página: junta ao resto se couber, senão página nova
      if (cur.length > 0 && !cabe([...cur, ...bloco])) flush();
      cur.push(...bloco);
    } else {
      // pacote maior que uma página: começa em página nova e quebra repetindo o cabeçalho
      flush();
      let sub = [header];
      for (const u of raiaUnits) {
        if (sub.length > 1 && !cabe([...sub, u])) { pages.push(sub); sub = [header, u]; }
        else sub.push(u);
      }
      cur = sub; // resto vira a página corrente — um próximo pacote pequeno pode dividi-la
    }
  });
  flush();

  return pages.length ? pages : [[]];
}

/** Quantas páginas (slides) um projeto ocupa. Atalho para o roteiro da Reunião. */
export function contarPaginasProjeto(p) {
  return paginarProjeto(p).length;
}

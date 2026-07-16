/**
 * reportIncidentesEngine.js
 * Governança TI — Hapvida | Plataforma Hapvida
 *
 * Engine pura de geração do Report Semanal de Incidentes (template V4).
 * Sem React, sem DOM — roda no browser e no Node (testável).
 *
 * Entrada:  template .pptx (ArrayBuffer) + base .xlsx (ArrayBuffer) + campos do cabeçalho
 * Saída:    .pptx (Blob no browser / Uint8Array no Node)
 */

import JSZip from 'jszip';
import * as XLSX from 'xlsx';

/* ═══════════════════════ REGRAS DE NEGÓCIO ═══════════════════════ */

export const CONCLUIDO_STATES  = ['Closed'];
export const AGUARDANDO_STATES = ['Resolved', 'Homologation', 'Ready for Production'];
export const IGNORAR_STATES    = ['Removed', 'Rejected'];

/** Limites de paginação (decisão de produto) */
export const MAX_ATRASADO   = 3;
export const MAX_AGUARDANDO = 3;
export const MAX_BACKLOG    = 20;

/** Colunas obrigatórias da aba "Work items" */
export const COLUNAS_OBRIGATORIAS = [
  'Service Now', 'Title', 'State', 'Team Project', 'Created Date', 'Due Date',
];

/* ═══════════════════════ PARÂMETROS DO TEMPLATE V4 ═══════════════════════ */

const SHAPE = {
  capaArea:     '7',    // slide 1 — 1º run do ctrTitle ("Marketing – Projetos Corporativos")
  total:        '307',
  concluido:    '312',
  concluidoPct: '315',
  andamento:    '317',
  andamentoPct: '320',
  atrasado:     '322',
  atrasadoPct:  '325',
  campos:       '60',   // text box único com os 4 campos
  backlogHdr:   '6',    // "BACKLOG DOS INCIDENTES — N registros"
};

const FRAME = {
  atrasado:   '46',
  aguardando: '11',
  backlog:    '10',
};

const FILL_CINZA =
  '<a:solidFill><a:schemeClr val="tx1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill>';

/* ═══════════════════════ HELPERS ═══════════════════════ */

export function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** dd/mm/aaaa — aceita Date, string ou serial do Excel */
export function fmtDate(val) {
  const d = toDate(val);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toDate(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    // serial do Excel (base 1899-12-30)
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  if (!s) return null;
  // dd/mm/aaaa
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Due Date < hoje (comparação por dia, ignora hora) */
export function isOverdue(val, hoje = new Date()) {
  const d = toDate(val);
  if (!d) return false;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return a < b;
}

const txt = (v) => String(v ?? '').trim();

/* ═══════════════════════ LEITURA DA BASE ═══════════════════════ */

/** Lê a aba "Work items", normaliza cabeçalhos e remove Removed/Rejected */
export function parseXlsx(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets['Work items'];
  if (!ws) {
    throw new Error(
      `Aba "Work items" não encontrada. Abas do arquivo: ${wb.SheetNames.join(', ')}`
    );
  }

  const raw = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!raw.length) throw new Error('A aba "Work items" está vazia.');

  const linhas = raw.map((r) => {
    const o = {};
    for (const k of Object.keys(r)) o[String(k).trim()] = r[k];
    return o;
  });

  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !(c in linhas[0]));
  if (faltando.length) {
    throw new Error(
      `Colunas ausentes na planilha: ${faltando.join(', ')}. ` +
      `Encontradas: ${Object.keys(linhas[0]).join(', ')}`
    );
  }

  return linhas.filter((r) => !IGNORAR_STATES.includes(txt(r['State'])));
}

/* ═══════════════════════ KPIs ═══════════════════════ */

export function calcKpis(rows, hoje = new Date()) {
  const total = rows.length;
  const concluido = rows.filter((r) => CONCLUIDO_STATES.includes(txt(r['State']))).length;
  const atrasado = rows.filter(
    (r) => isOverdue(r['Due Date'], hoje) && !CONCLUIDO_STATES.includes(txt(r['State']))
  ).length;
  // Andamento = por EXCLUSÃO: não concluído e não vencido
  const andamento = rows.filter(
    (r) => !CONCLUIDO_STATES.includes(txt(r['State'])) && !isOverdue(r['Due Date'], hoje)
  ).length;

  const pct = (n) => (total > 0 ? `${Math.round((n / total) * 100)}% do total` : '0% do total');

  return {
    total,
    concluido,
    concluidoPct: pct(concluido),
    andamento,
    andamentoPct: pct(andamento),
    atrasado,
    atrasadoPct: pct(atrasado),
  };
}

/** Linha da tabela: INC · Squad · Título · Status · Target · Criação */
export function toRow(r) {
  return [
    txt(r['Service Now']),
    txt(r['Team Project']),
    txt(r['Title']),
    txt(r['State']),
    fmtDate(r['Due Date']),
    fmtDate(r['Created Date']),
  ];
}

/* ═══════════════════════ CIRURGIA DE XML ═══════════════════════ */

/** Acha o elemento <tag> cujo <p:cNvPr id="..."> bate. Não atravessa o fechamento da tag. */
function findElementById(xml, tag, id) {
  const re = new RegExp(
    `<${tag}\\b(?:(?!</${tag}>)[\\s\\S])*?<p:cNvPr[^>]*\\bid="${id}"[^>]*?(?:/>|>)` +
    `(?:(?!</${tag}>)[\\s\\S])*?</${tag}>`
  );
  const m = xml.match(re);
  return m ? m[0] : null;
}

/** replace literal — evita interpretação de $& e afins no replacement */
function hardReplace(haystack, needle, replacement) {
  return haystack.replace(needle, () => replacement);
}

export function buildTableRow(cells) {
  const tc = (v) =>
    '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' +
    '<a:p><a:pPr algn="ctr"/><a:r>' +
    `<a:rPr lang="pt-BR" sz="800" dirty="0">${FILL_CINZA}</a:rPr>` +
    `<a:t>${xmlEscape(v)}</a:t></a:r></a:p></a:txBody>` +
    '<a:tcPr anchor="ctr">' +
    '<a:lnL w="6350" cap="flat" cmpd="sng" algn="ctr"><a:noFill/><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:lnL>' +
    '<a:lnR w="6350" cap="flat" cmpd="sng" algn="ctr"><a:noFill/><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:lnR>' +
    '<a:lnT w="3175" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="bg1"><a:lumMod val="65000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:lnT>' +
    '<a:lnB w="3175" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="bg1"><a:lumMod val="65000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:lnB>' +
    '<a:lnTlToBr w="12700" cmpd="sng"><a:noFill/><a:prstDash val="solid"/></a:lnTlToBr>' +
    '<a:lnBlToTr w="12700" cmpd="sng"><a:noFill/><a:prstDash val="solid"/></a:lnBlToTr>' +
    '<a:noFill/></a:tcPr></a:tc>';

  return `<a:tr h="126636">${cells.map(tc).join('')}</a:tr>`;
}

/**
 * Substitui as linhas de dados da tabela dentro do graphicFrame indicado.
 * Preserva tblPr, tblGrid e a linha de cabeçalho (índice 0).
 * Tabela vazia → uma linha com "—".
 */
export function replaceTableInFrame(slideXml, frameId, dataRows) {
  const frameXml = findElementById(slideXml, 'p:graphicFrame', frameId);
  if (!frameXml) {
    console.warn(`[engine] graphicFrame id=${frameId} não encontrado`);
    return slideXml;
  }

  const tblM = frameXml.match(/<a:tbl>[\s\S]*<\/a:tbl>/);
  if (!tblM) return slideXml;

  const tblXml = tblM[0];
  const rows = tblXml.match(/<a:tr\b[\s\S]*?<\/a:tr>/g);
  if (!rows || !rows.length) return slideXml;

  const headerRow = rows[0];
  const prefix = tblXml.slice(0, tblXml.indexOf('<a:tr'));

  const linhas = dataRows.length ? dataRows : [['—', '—', '—', '—', '—', '—']];
  const dataXml = linhas.map(buildTableRow).join('');

  const newTbl = prefix + headerRow + dataXml + '</a:tbl>';
  const newFrame = hardReplace(frameXml, tblXml, newTbl);
  return hardReplace(slideXml, frameXml, newFrame);
}

/** Troca o texto de um shape: primeiro run recebe o texto, os demais são removidos. */
export function updateShapeText(slideXml, shapeId, newText) {
  const spXml = findElementById(slideXml, 'p:sp', shapeId);
  if (!spXml) {
    console.warn(`[engine] shape id=${shapeId} não encontrado`);
    return slideXml;
  }

  const tags = [...spXml.matchAll(/<a:t[^>]*>[\s\S]*?<\/a:t>/g)];
  if (!tags.length) return slideXml;

  let newSp = spXml;
  for (let i = tags.length - 1; i >= 0; i--) {
    const rep = i === 0 ? `<a:t>${xmlEscape(newText)}</a:t>` : '';
    newSp = newSp.slice(0, tags[i].index) + rep + newSp.slice(tags[i].index + tags[i][0].length);
  }
  return hardReplace(slideXml, spXml, newSp);
}

/**
 * Troca APENAS o texto do primeiro run do shape, preservando todos os demais.
 *
 * Usado na capa: o título é um único parágrafo com
 *   run0 "Marketing – Projetos Corporativos" + <a:br/> + run1 "Status Report".
 * updateShapeText() apagaria o "Status Report" — aqui não.
 */
export function updateShapeFirstRun(slideXml, shapeId, newText) {
  const spXml = findElementById(slideXml, 'p:sp', shapeId);
  if (!spXml) {
    console.warn(`[engine] shape id=${shapeId} não encontrado`);
    return slideXml;
  }

  const m = spXml.match(/<a:t[^>]*>[\s\S]*?<\/a:t>/);
  if (!m) return slideXml;

  const newSp =
    spXml.slice(0, m.index) +
    `<a:t>${xmlEscape(newText)}</a:t>` +
    spXml.slice(m.index + m[0].length);

  return hardReplace(slideXml, spXml, newSp);
}

/**
 * Reconstrói o text box dos 4 campos por inteiro.
 * Necessário porque o template tem os runs fragmentados ("Bernardo " + "Marotta"),
 * o que torna qualquer mapeamento por índice de run frágil.
 */
export function updateCampos(slideXml, campos) {
  const spXml = findElementById(slideXml, 'p:sp', SHAPE.campos);
  if (!spXml) {
    console.warn('[engine] text box dos campos (id=60) não encontrado');
    return slideXml;
  }

  const par = (label, valor) =>
    '<a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr>' +
    `<a:r><a:rPr lang="pt-BR" sz="900" b="1" dirty="0">${FILL_CINZA}</a:rPr>` +
    `<a:t>${xmlEscape(label)}</a:t></a:r>` +
    `<a:r><a:rPr lang="pt-BR" sz="900" b="0" dirty="0">${FILL_CINZA}</a:rPr>` +
    `<a:t xml:space="preserve"> ${xmlEscape(valor)}</a:t></a:r></a:p>`;

  const txBody =
    '<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="ctr"><a:spAutoFit/></a:bodyPr><a:lstStyle/>' +
    par('Área Executora:', campos.areaExecutora) +
    par('Diretor:', campos.diretor) +
    par('Produto:', campos.produto) +
    par('Tecnologia:', campos.tecnologia) +
    '</p:txBody>';

  const newSp = spXml.replace(/<p:txBody>[\s\S]*<\/p:txBody>/, () => txBody);
  return hardReplace(slideXml, spXml, newSp);
}

/**
 * Atualiza o cache de categorias e valores do gráfico.
 *
 * ⚠️ ARMADILHA: cada gráfico tem DOIS blocos <c:strCache>.
 *    O primeiro é o título da série; o segundo, dentro de <c:cat>, são as
 *    categorias do eixo. Busca genérica atualiza o errado e some com os nomes.
 *    Por isso a busca é ANINHADA: strCache dentro de <c:cat>, numCache dentro de <c:val>.
 */
export function updateChartCache(chartXml, categories, values) {
  const n = categories.length;

  const catPts =
    `<c:ptCount val="${n}"/>` +
    categories.map((c, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(c)}</c:v></c:pt>`).join('');
  const valPts =
    `<c:ptCount val="${n}"/>` +
    values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');

  function replaceCacheInside(xml, parentTag, cacheTag, newPts) {
    const pM = xml.match(new RegExp(`<${parentTag}>[\\s\\S]*?</${parentTag}>`));
    if (!pM) return xml;
    const parentXml = pM[0];

    const cM = parentXml.match(new RegExp(`(<${cacheTag}>)([\\s\\S]*?)(</${cacheTag}>)`));
    if (!cM) return xml;

    const fmt = cM[2].match(/<c:formatCode>[\s\S]*?<\/c:formatCode>/);
    const newCache = `${cM[1]}${fmt ? fmt[0] : ''}${newPts}${cM[3]}`;
    const newParent =
      parentXml.slice(0, cM.index) + newCache + parentXml.slice(cM.index + cM[0].length);
    return xml.slice(0, pM.index) + newParent + xml.slice(pM.index + pM[0].length);
  }

  chartXml = replaceCacheInside(chartXml, 'c:cat', 'c:strCache', catPts);
  chartXml = replaceCacheInside(chartXml, 'c:val', 'c:numCache', valPts);

  // dPt: manter apenas índices < N (senão sobram cores órfãs do template)
  const dpts = [...chartXml.matchAll(/<c:dPt>[\s\S]*?<\/c:dPt>/g)];
  if (dpts.length) {
    const valid = dpts
      .filter((d) => {
        const im = d[0].match(/<c:idx val="(\d+)"/);
        return im && Number(im[1]) < n;
      })
      .map((d) => d[0]);
    const start = dpts[0].index;
    const last = dpts[dpts.length - 1];
    const end = last.index + last[0].length;
    chartXml = chartXml.slice(0, start) + valid.join('') + chartXml.slice(end);
  }

  return chartXml;
}

/* ═══════════════════════ PAGINAÇÃO ═══════════════════════ */

export function chunk(arr, size) {
  if (!arr.length) return [[]];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Nº de páginas do dashboard = max entre os dois boxes (paginação paralela) */
export function planejarPaginas(atrasado, aguardando, backlog) {
  const pAtr = chunk(atrasado, MAX_ATRASADO);
  const pAgu = chunk(aguardando, MAX_AGUARDANDO);
  const nDash = Math.max(pAtr.length, pAgu.length, 1);

  const dashboard = [];
  for (let i = 0; i < nDash; i++) {
    dashboard.push({ atrasado: pAtr[i] ?? [], aguardando: pAgu[i] ?? [] });
  }

  return { dashboard, backlog: chunk(backlog, MAX_BACKLOG) };
}

/* ═══════════════════════ MONTAGEM DO PACOTE OOXML ═══════════════════════ */

/**
 * A ordem dos slides é definida por <p:sldIdLst>, não pelo nome do arquivo.
 * Então clonamos para slide5, slide6... e só reordenamos a lista no final.
 */
class Pacote {
  constructor(zip) {
    this.zip = zip;
    this.novosSlides = [];   // [{ path, xml, relsXml }]
    this.novosCharts = [];   // [{ path, xml }]
    this.novosBin = [];      // [{ path, data }]
    this.ctOverrides = [];   // [{ partName, contentType }]
    this.proxSlide = 5;
    this.proxChart = 3;
  }

  addSlide(xml, relsXml) {
    const n = this.proxSlide++;
    const path = `ppt/slides/slide${n}.xml`;
    this.novosSlides.push({ n, path, xml, relsXml });
    this.ctOverrides.push({
      partName: `/${path}`,
      contentType:
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
    });
    return path;
  }

  /** Clone profundo de um gráfico: chart + colors + style + planilha embutida */
  async cloneChart(origIdx, chartXml) {
    const n = this.proxChart++;

    this.novosCharts.push({ path: `ppt/charts/chart${n}.xml`, xml: chartXml });
    this.ctOverrides.push({
      partName: `/ppt/charts/chart${n}.xml`,
      contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
    });

    for (const [tipo, ct] of [
      ['colors', 'application/vnd.ms-office.chartcolorstyle+xml'],
      ['style', 'application/vnd.ms-office.chartstyle+xml'],
    ]) {
      const src = await this.zip.file(`ppt/charts/${tipo}${origIdx}.xml`).async('string');
      this.novosCharts.push({ path: `ppt/charts/${tipo}${n}.xml`, xml: src });
      this.ctOverrides.push({ partName: `/ppt/charts/${tipo}${n}.xml`, contentType: ct });
    }

    // planilha embutida (xlsx já tem Default no Content_Types — sem override)
    const origRels = await this.zip
      .file(`ppt/charts/_rels/chart${origIdx}.xml.rels`)
      .async('string');
    const embM = origRels.match(/Target="\.\.\/embeddings\/([^"]+)"/);
    let embNome = null;
    if (embM) {
      const orig = embM[1];
      const ext = orig.slice(orig.lastIndexOf('.'));
      embNome = `Microsoft_Excel_Worksheet_p${n}${ext}`;
      const bin = await this.zip.file(`ppt/embeddings/${orig}`).async('uint8array');
      this.novosBin.push({ path: `ppt/embeddings/${embNome}`, data: bin });
    }

    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2011/relationships/chartStyle" Target="style${n}.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2011/relationships/chartColorStyle" Target="colors${n}.xml"/>` +
      (embNome
        ? `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/${embNome}"/>`
        : '') +
      '</Relationships>';

    this.novosCharts.push({ path: `ppt/charts/_rels/chart${n}.xml.rels`, xml: rels });
    return n;
  }
}

/** rels de um slide de dashboard clonado: layout + os 2 gráficos dele */
function relsDashboard(chartA, chartB) {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout22.xml"/>' +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartA}.xml"/>` +
    `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartB}.xml"/>` +
    '</Relationships>'
  );
}

const RELS_BACKLOG =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout22.xml"/>' +
  '</Relationships>';

/**
 * Analisa a base e devolve tudo que preview E geração precisam.
 *
 * Fonte da verdade ÚNICA: a tela usa isto para a pré-visualização e
 * gerarReportIncidentes() usa o mesmo — o preview nunca diverge do arquivo gerado.
 */
export function analisarBase(xlsxBuf, hoje = new Date()) {
  const rows = parseXlsx(xlsxBuf);
  const kpis = calcKpis(rows, hoje);

  const atrasadoRows = rows
    .filter((r) => isOverdue(r['Due Date'], hoje) && !CONCLUIDO_STATES.includes(txt(r['State'])))
    .map(toRow);
  const aguardandoRows = rows
    .filter((r) => AGUARDANDO_STATES.includes(txt(r['State'])))
    .map(toRow);
  const backlogRows = rows.map(toRow);

  const plano = planejarPaginas(atrasadoRows, aguardandoRows, backlogRows);

  return {
    rows,
    kpis,
    atrasadoRows,
    aguardandoRows,
    backlogRows,
    plano,
    porStatus: contar(rows, 'State'),
    porSquad: contar(rows, 'Team Project'),
    slidesDashboard: plano.dashboard.length,
    slidesBacklog: plano.backlog.length,
    totalSlides: 2 + plano.dashboard.length + plano.backlog.length, // capa + encerramento
  };
}

/* ═══════════════════════ ENTRY POINT ═══════════════════════ */

/**
 * @param {ArrayBuffer} templateBuf  template V4 (.pptx)
 * @param {ArrayBuffer} xlsxBuf      base exportada (.xlsx, aba "Work items")
 * @param {{capaArea,areaExecutora,diretor,produto,tecnologia}} campos
 *        capaArea → título da capa (slide 1). Ex.: "Marketing – Projetos Corporativos"
 * @param {Date} [hoje]              injetável para testes
 * @returns {{ blob, resumo }}
 */
export async function gerarReportIncidentes({ templateBuf, xlsxBuf, campos, hoje = new Date() }) {
  const a = analisarBase(xlsxBuf, hoje);
  const { rows, kpis, atrasadoRows, aguardandoRows, backlogRows, plano } = a;

  const zip = await JSZip.loadAsync(templateBuf);
  const pkg = new Pacote(zip);

  /* ---- capa (slide 1): nome da área ---- */
  if (campos.capaArea) {
    const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
    zip.file('ppt/slides/slide1.xml', updateShapeFirstRun(slide1, SHAPE.capaArea, campos.capaArea));
  }

  const slide2Base = await zip.file('ppt/slides/slide2.xml').async('string');
  const slide3Base = await zip.file('ppt/slides/slide3.xml').async('string');
  const chart1Base = await zip.file('ppt/charts/chart1.xml').async('string');
  const chart2Base = await zip.file('ppt/charts/chart2.xml').async('string');

  /* ---- gráficos (mesmos dados em todas as páginas) ---- */
  const chart1Novo = updateChartCache(chart1Base, a.porStatus.cats, a.porStatus.vals);
  const chart2Novo = updateChartCache(chart2Base, a.porSquad.cats, a.porSquad.vals);

  /* ---- páginas do dashboard ---- */
  const ordemDash = [];
  for (let i = 0; i < plano.dashboard.length; i++) {
    const pg = plano.dashboard[i];

    let xml = slide2Base;
    xml = updateShapeText(xml, SHAPE.total, String(kpis.total));
    xml = updateShapeText(xml, SHAPE.concluido, String(kpis.concluido));
    xml = updateShapeText(xml, SHAPE.concluidoPct, kpis.concluidoPct);
    xml = updateShapeText(xml, SHAPE.andamento, String(kpis.andamento));
    xml = updateShapeText(xml, SHAPE.andamentoPct, kpis.andamentoPct);
    xml = updateShapeText(xml, SHAPE.atrasado, String(kpis.atrasado));
    xml = updateShapeText(xml, SHAPE.atrasadoPct, kpis.atrasadoPct);
    xml = updateCampos(xml, campos);
    xml = replaceTableInFrame(xml, FRAME.atrasado, pg.atrasado);
    xml = replaceTableInFrame(xml, FRAME.aguardando, pg.aguardando);

    if (i === 0) {
      // página 1 reaproveita slide2.xml + chart1/chart2 originais
      zip.file('ppt/slides/slide2.xml', xml);
      zip.file('ppt/charts/chart1.xml', chart1Novo);
      zip.file('ppt/charts/chart2.xml', chart2Novo);
      ordemDash.push({ existente: 'rId6' });
    } else {
      // clone profundo dos gráficos — sem compartilhar parts entre slides
      const cA = await pkg.cloneChart(1, chart1Novo);
      const cB = await pkg.cloneChart(2, chart2Novo);
      const path = pkg.addSlide(xml, relsDashboard(cA, cB));
      ordemDash.push({ novo: path });
    }
  }

  /* ---- páginas do backlog ---- */
  const ordemBack = [];
  for (let i = 0; i < plano.backlog.length; i++) {
    const pg = plano.backlog[i];
    const cont =
      plano.backlog.length > 1 ? ` (cont. ${i + 1}/${plano.backlog.length})` : '';

    let xml = slide3Base;
    xml = updateShapeText(
      xml,
      SHAPE.backlogHdr,
      `BACKLOG DOS INCIDENTES — ${backlogRows.length} registros${cont}`
    );
    xml = replaceTableInFrame(xml, FRAME.backlog, pg);

    if (i === 0) {
      zip.file('ppt/slides/slide3.xml', xml);
      ordemBack.push({ existente: 'rId7' });
    } else {
      const path = pkg.addSlide(xml, RELS_BACKLOG);
      ordemBack.push({ novo: path });
    }
  }

  /* ---- grava os novos parts ---- */
  for (const s of pkg.novosSlides) {
    zip.file(s.path, s.xml);
    zip.file(`ppt/slides/_rels/slide${s.n}.xml.rels`, s.relsXml);
  }
  for (const c of pkg.novosCharts) zip.file(c.path, c.xml);
  for (const b of pkg.novosBin) zip.file(b.path, b.data);

  /* ---- registra relationships em presentation.xml.rels ---- */
  let presRels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  let maxRid = Math.max(
    ...[...presRels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))
  );

  const ridDe = new Map();
  for (const s of pkg.novosSlides) {
    const rid = `rId${++maxRid}`;
    ridDe.set(s.path, rid);
    presRels = presRels.replace(
      '</Relationships>',
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${s.n}.xml"/></Relationships>`
    );
  }
  zip.file('ppt/_rels/presentation.xml.rels', presRels);

  /* ---- Content_Types ---- */
  let ct = await zip.file('[Content_Types].xml').async('string');
  for (const o of pkg.ctOverrides) {
    ct = ct.replace(
      '</Types>',
      `<Override PartName="${o.partName}" ContentType="${o.contentType}"/></Types>`
    );
  }
  zip.file('[Content_Types].xml', ct);

  /* ---- sldIdLst: capa · dashboards · backlogs · encerramento ---- */
  let pres = await zip.file('ppt/presentation.xml').async('string');
  const idsUsados = new Set(
    [...pres.matchAll(/<p:sldId id="(\d+)"/g)].map((m) => Number(m[1]))
  );
  let proxId = 600;
  const novoId = () => {
    while (idsUsados.has(proxId)) proxId++;
    idsUsados.add(proxId);
    return proxId++;
  };

  const ordem = [
    { existente: 'rId5' },                 // capa
    ...ordemDash,
    ...ordemBack,
    { existente: 'rId8' },                 // encerramento
  ];

  const sldIdAtual = new Map(
    [...pres.matchAll(/<p:sldId id="(\d+)" r:id="(rId\d+)"\/>/g)].map((m) => [m[2], m[1]])
  );

  const lista = ordem
    .map((o) => {
      if (o.existente) {
        return `<p:sldId id="${sldIdAtual.get(o.existente)}" r:id="${o.existente}"/>`;
      }
      return `<p:sldId id="${novoId()}" r:id="${ridDe.get(o.novo)}"/>`;
    })
    .join('');

  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, () => `<p:sldIdLst>${lista}</p:sldIdLst>`);
  zip.file('ppt/presentation.xml', pres);

  /* ---- saída ---- */
  const isNode = typeof window === 'undefined';
  const blob = await zip.generateAsync({
    type: isNode ? 'uint8array' : 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
  });

  return {
    blob,
    resumo: {
      ...kpis,
      registros: rows.length,
      slidesDashboard: plano.dashboard.length,
      slidesBacklog: plano.backlog.length,
      totalSlides: 2 + plano.dashboard.length + plano.backlog.length,
    },
  };
}

/** value_counts() — ordem decrescente, igual ao pandas */
function contar(rows, campo) {
  const mapa = new Map();
  for (const r of rows) {
    const k = txt(r[campo]);
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  const ord = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  return { cats: ord.map((e) => e[0]), vals: ord.map((e) => e[1]) };
}

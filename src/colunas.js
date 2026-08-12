// =====================================================================
//  colunas.js — REGISTRO ÚNICO DE COLUNAS DA PLATAFORMA
//
//  Por que este arquivo existe:
//  Ler planilha por POSIÇÃO (r[62]) quebra em silêncio toda vez que
//  alguém insere, remove ou reordena uma coluna na origem. Já aconteceu
//  duas vezes: o gráfico de squad passou a mostrar UUID, e a leitura das
//  Melhorias ficou deslocada em +1 por semanas sem ninguém perceber.
//
//  Aqui a coluna é encontrada pelo NOME do cabeçalho. Posição deixa de
//  importar. Se o nome mudar, o sistema AVISA em vez de gerar report zerado.
//
//  Manutenção: mudou o nome de uma coluna na planilha? Adicione o nome novo
//  à lista de apelidos da chave correspondente. Nada mais.
// =====================================================================

/* Normalização: minúscula, sem acento, espaços colapsados, sem pontuação
   final. É o que faz "DESPRIORIZAÇÃO " (com espaço sobrando) casar com
   "despriorizacao". */
export const normCab = (s) => String(s ?? '')
  .trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .replace(/[.:]+$/, '');

/* ── PORTFÓLIO ───────────────────────────────────────────────────────
   ORDEM define o layout CANÔNICO: depois de importar, toda linha é
   reescrita nesta ordem. Assim COL vira fixo para sempre, independente
   de como a planilha de origem estiver organizada.
   ATENÇÃO: não reordenar esta lista — os índices viram COL.*            */
export const ORDEM_PORTFOLIO = [
  'ID', 'NOME', 'DESC', 'AREA_EXEC', 'LIDER_EXEC', 'DIR_EXEC', 'SM',
  'AREA_CLI', 'LIDER_CLI', 'DIR_CLI', 'STATUS', 'DT_INICIO',
  'TRIMESTRE', 'COMPROMISSO', 'DESPRI', 'FASE', 'TARGET', 'SQUAD', 'REPLAN',
];

/* Apelidos aceitos por chave. Comparação é por IGUALDADE do nome
   normalizado — nunca "contém". É isso que impede SQUAD de casar com
   "ID Squad Azure" ou "squad atualizada".
   Primeiro apelido encontrado na planilha vence (ordem = preferência). */
export const CAMPOS_PORTFOLIO = {
  ID:          ['lecom', 'identificacao', 'identificacao (lecom)'],
  NOME:        ['titulo', 'nome do projeto'],
  DESC:        ['descricao'],
  AREA_EXEC:   ['area executora'],
  LIDER_EXEC:  ['lider executor'],
  DIR_EXEC:    ['diretor executor', 'diretor executora'],
  SM:          ['sm/pmo', 'sm / pmo', 'sm-pmo'],
  AREA_CLI:    ['area cliente', 'area solicitante'],
  LIDER_CLI:   ['lider cliente', 'lider de negocio'],
  DIR_CLI:     ['diretor cliente', 'vp solicitante'],
  STATUS:      ['status do projeto'],
  DT_INICIO:   ['data de inicio plan', 'data de inicio', 'data de inicio real'],
  TRIMESTRE:   ['trimestre priorizado', 'trimestre'],
  COMPROMISSO: ['compromisso', 'compromisso do trimestre'],
  DESPRI:      ['despriorizacao'],
  FASE:        ['fase do projeto'],
  TARGET:      ['data de termino plan', 'data de termino planejada'],
  SQUAD:       ['squad azure'],
  REPLAN:      ['replanejamento', 'status lecom'],
};

/* Obrigatória = sem ela o report perde uma parte visível.
   Crítica    = sem ela o report sai INTEIRO zerado (o filtro não casa nada).
   Nenhuma das duas impede a geração — o aviso é informativo e o usuário
   decide. A diferença é só a gravidade do texto mostrado na tela. */
export const OBRIGATORIAS_PORTFOLIO = [
  'ID', 'NOME', 'LIDER_EXEC', 'SM', 'STATUS', 'TRIMESTRE',
  'COMPROMISSO', 'DESPRI', 'FASE', 'TARGET', 'SQUAD',
];
export const CRITICAS_PORTFOLIO = ['LIDER_EXEC', 'TRIMESTRE', 'COMPROMISSO'];

/* ── MELHORIAS ───────────────────────────────────────────────────────── */
export const ORDEM_MELHORIAS = [
  'ID', 'NOME', 'DESPRI', 'TARGET', 'STATUS', 'LIDER', 'SQUAD', 'REPLAN',
];

export const CAMPOS_MELHORIAS = {
  ID:     ['lecom'],
  NOME:   ['titulo', 'demanda'],
  DESPRI: ['despriorizacao'],
  TARGET: ['p prevista', 'p. prevista', 'data prevista'],
  STATUS: ['status'],
  LIDER:  ['gerente ti'],
  SQUAD:  ['nome squad azure'],
  REPLAN: ['replanejamento'],
};

export const OBRIGATORIAS_MELHORIAS = ['ID', 'NOME', 'TARGET', 'STATUS', 'LIDER', 'SQUAD'];
export const CRITICAS_MELHORIAS = ['LIDER', 'STATUS'];

/* Legenda de impacto: o que some do report quando a coluna falta.
   Serve para o aviso na tela dizer algo útil em vez de só "não achou". */
export const IMPACTO = {
  ID: 'Coluna Lecom das tabelas',
  NOME: 'Nome do projeto/demanda nas tabelas',
  LIDER_EXEC: 'TUDO — nenhuma linha casa com o líder',
  LIDER: 'TUDO — nenhuma linha casa com o líder',
  SM: 'Filtro por SM/PMO',
  STATUS: 'Fase/Status nas tabelas e KPIs',
  TRIMESTRE: 'TUDO — nenhuma linha casa com o trimestre',
  COMPROMISSO: 'TUDO — nenhuma linha casa com o compromisso',
  DESPRI: 'Despriorizados entram indevidamente no report',
  FASE: 'Meta de entregues e gráfico de fases',
  TARGET: 'Atrasados, Alerta e Entregas Próximas',
  SQUAD: 'Gráfico Progresso por squad',
  REPLAN: 'Coluna Replan. das tabelas',
};

/* Converte índice 0-based em letra de coluna do Excel (0 → A, 62 → BK).
   Só para o painel de diagnóstico — ajuda a conferir na planilha. */
export const letraCol = (n) => {
  let s = '';
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
};

/* ── RESOLVEDOR ───────────────────────────────────────────────────────
   Recebe a matriz crua (array de arrays, como o SheetJS devolve com
   header:1) e devolve onde cada chave está.

   Detecta a linha de cabeçalho sozinho: varre as primeiras linhas e
   escolhe a que casa com mais chaves conhecidas. Isso resolve o caso em
   que a planilha muda o cabeçalho de linha (o Portfólio já foi da 2 para
   a 1) sem precisar de configuração.                                    */
export function resolverColunas(matriz, campos, opts = {}) {
  const {
    obrigatorias = Object.keys(campos),
    criticas = [],
    maxLinhasBusca = 10,
  } = opts;

  const chaves = Object.keys(campos);
  let melhor = { linha: -1, idx: {}, achou: 0, cabecalhos: [] };

  const limite = Math.min(maxLinhasBusca, matriz.length);
  for (let li = 0; li < limite; li++) {
    const linha = matriz[li] || [];
    if (!linha.length) continue;

    // nome normalizado → primeira posição em que aparece
    const mapa = new Map();
    linha.forEach((cel, ci) => {
      const n = normCab(cel);
      if (n && !mapa.has(n)) mapa.set(n, ci);
    });

    const idx = {};
    let achou = 0;
    for (const chave of chaves) {
      for (const apelido of campos[chave]) {
        const pos = mapa.get(normCab(apelido));
        if (pos !== undefined) { idx[chave] = pos; achou++; break; }
      }
    }
    if (achou > melhor.achou) {
      melhor = { linha: li, idx, achou, cabecalhos: linha.map(c => String(c ?? '').trim()).filter(Boolean) };
    }
  }

  const faltando = obrigatorias.filter(k => melhor.idx[k] === undefined);
  const faltandoCriticas = criticas.filter(k => melhor.idx[k] === undefined);

  return {
    headerRow: melhor.linha,          // índice 0-based da linha de cabeçalho
    idx: melhor.idx,                  // { CHAVE: posição }
    encontradas: melhor.achou,
    totalChaves: chaves.length,
    faltando,                         // obrigatórias ausentes
    faltandoCriticas,                 // subconjunto que zera o report
    zeraReport: faltandoCriticas.length > 0,  // aviso mais grave — não bloqueia
    cabecalhos: melhor.cabecalhos,    // o que realmente veio na planilha
    ok: faltando.length === 0,
    // linhas de dados: tudo depois do cabeçalho
    linhas: melhor.linha >= 0 ? matriz.slice(melhor.linha + 1) : [],
  };
}

/* Reescreve as linhas no layout canônico definido por ORDEM_*.
   Depois disso o índice é fixo para sempre — quem consome não precisa
   saber nada sobre a planilha de origem. */
export function canonizar(linhas, idx, ordem) {
  return linhas.map(r => ordem.map(chave => {
    const pos = idx[chave];
    return pos === undefined ? '' : (r[pos] ?? '');
  }));
}

/* Índices canônicos derivados da ORDEM — é o COL do portfólio. */
export const COL_CANONICO = Object.fromEntries(ORDEM_PORTFOLIO.map((k, i) => [k, i]));
export const MEL_CANONICO = Object.fromEntries(ORDEM_MELHORIAS.map((k, i) => [k, i]));

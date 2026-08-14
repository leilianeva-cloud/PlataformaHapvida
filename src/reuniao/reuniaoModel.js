/**
 * reuniao/reuniaoModel.js
 * ─────────────────────────────────────────────────────────────────────────────
 * O coração do módulo Reunião. Puro: sem React, sem DOM, sem Supabase.
 *
 * Responsabilidade única: dado o ROTEIRO (lista de blocos) e o CONTEXTO
 * (projetos carregados + insumos da bandeja), devolver a lista achatada de
 * PÁGINAS que vão ser renderizadas — em tela, na apresentação e no PDF.
 *
 * REGRA DE OURO DESTE ARQUIVO
 * Ele NÃO recalcula paginação de ninguém. Ele consome:
 *   • projeto     → `paginarProjeto()` de statusPaginacao.js (extraído do App.jsx)
 *   • incidentes  → `analise.plano`, produzido por `analisarBase()` da engine
 *   • ras         → `analise.plano`, quando a extração do RAS for feita
 * Se algum dia aparecer um `Math.ceil(x / 3)` aqui dentro, é bug: significa que
 * a Reunião passou a ter opinião própria sobre quantos slides algo ocupa, e o
 * preview vai divergir do arquivo gerado. Foi assim que nasceu a armadilha 16.7.
 *
 * BLOCO ≠ SLIDE. Um bloco de RAS pode virar 4 páginas; um projeto, 1 ou 2.
 * Por isso o roteiro guarda blocos e a renderização pede páginas.
 */

import { paginarProjeto } from '../statusPaginacao'

/* ═══════════════════════ TIPOS DE BLOCO ═══════════════════════ */

export const TIPOS = {
  capa:       { rotulo: 'Capa',            tag: null,          editavel: true,  unico: true  },
  divisoria:  { rotulo: 'Divisória',       tag: null,          editavel: true,  unico: false },
  projeto:    { rotulo: 'Projeto',         tag: 'Status',      editavel: false, unico: false },
  ras:        { rotulo: 'RAS',             tag: 'RAS',         editavel: false, unico: true  },
  incidentes: { rotulo: 'Incidentes',      tag: 'Incidentes',  editavel: false, unico: true  },
  tabela:     { rotulo: 'Tabela',          tag: 'Tabela',      editavel: true,  unico: false },
  importado:  { rotulo: 'Importado',       tag: 'Importado',   editavel: true,  unico: false },
  fim:        { rotulo: 'Encerramento',    tag: null,          editavel: false, unico: true  },
}

/** Blocos que o usuário pode renomear pelo ✎. */
export const ehEditavel = (tipo) => !!TIPOS[tipo]?.editavel

/** Blocos que só podem existir uma vez no roteiro (inserir de novo substitui). */
export const ehUnico = (tipo) => !!TIPOS[tipo]?.unico

/* ═══════════════════════ CRIAÇÃO DE BLOCOS ═══════════════════════ */

let _seq = 0
const novoId = () => `b${Date.now().toString(36)}${(_seq++).toString(36)}`

/**
 * Cria um bloco novo já com os campos que o tipo exige.
 * Todo bloco tem `id` estável — o React precisa de key, e o drag-and-drop
 * de identidade que sobreviva à reordenação.
 */
export function criarBloco(tipo, dados = {}) {
  const base = { id: novoId(), tipo, nome: dados.nome || TIPOS[tipo]?.rotulo || tipo }
  switch (tipo) {
    case 'capa':
      return { ...base, nome: 'Capa', titulo: dados.titulo || 'Reunião de Acompanhamento Semanal' }
    case 'divisoria':
      return { ...base, nome: dados.nome || 'Nova divisória' }
    case 'projeto':
      return { ...base, projetoId: String(dados.projetoId), nome: dados.nome || 'Projeto',
               smNome: dados.smNome || '', atualizadoEm: dados.atualizadoEm || '' }
    case 'ras':
    case 'incidentes':
      return { ...base, nome: dados.nome || TIPOS[tipo].rotulo,
               enviadoPor: dados.enviadoPor || '', enviadoEm: dados.enviadoEm || '' }
    case 'tabela':
      return { ...base, nome: dados.nome || 'Tabela',
               colunas: (dados.colunas || ['', '', '']).slice(),
               linhas: dados.linhas || Array.from({ length: 3 }, () => (dados.colunas || ['', '', '']).map(() => '')) }
    case 'importado':
      return { ...base, nome: dados.nome || 'Conteúdo importado',
               caminho: dados.caminho || '', largura: dados.largura || 0,
               altura: dados.altura || 0, origem: dados.origem || 'imagem' }
    case 'fim':
      return { ...base, nome: 'Encerramento' }
    default:
      return base
  }
}

/**
 * Roteiro inicial de uma reunião nova: a espinha do deck consolidado.
 * Ninguém monta 32 slides do zero toda semana — mas tudo aqui é removível.
 */
export function roteiroPadrao() {
  return [
    criarBloco('capa'),
    criarBloco('divisoria', { nome: 'Visão Macro dos Projetos' }),
    criarBloco('divisoria', { nome: 'Report Executivo de Incidentes' }),
    criarBloco('divisoria', { nome: 'Report Executivo dos Projetos' }),
    criarBloco('fim'),
  ]
}

/* ═══════════════════════ MODELOS DE TABELA ═══════════════════════ */

export const MODELOS_TABELA = [
  { nome: 'Pontos de Atenção', colunas: ['Projeto', 'Ponto de atenção', 'Impacto', 'Ação', 'Responsável'] },
  { nome: 'Encaminhamentos',   colunas: ['Tema', 'Encaminhamento', 'Responsável', 'Prazo', 'Status'] },
  { nome: 'Tabela',            colunas: ['', '', ''] },
]

export const MAX_COLUNAS_TABELA = 8

/* ═══════════════════════ PÁGINAS DE CADA BLOCO ═══════════════════════ */

/**
 * Expande UM bloco nas páginas que ele ocupa.
 *
 * @param {object} bloco
 * @param {object} ctx
 * @param {Map<string,object>} ctx.projetos  projetoId → { projeto, raias, pacotes, ordem, usaPacotes, nFuturos, nPassados, smNome }
 * @param {object} ctx.insumos               { ras: {analise,...}|null, incidentes: {analise,...}|null }
 * @returns {Array<object>} páginas `{ tipo, props }`
 */
function paginasDoBloco(bloco, ctx) {
  switch (bloco.tipo) {
    case 'capa':
      return [{ tipo: 'capa', props: { titulo: bloco.titulo } }]

    case 'divisoria':
      return [{ tipo: 'divisoria', props: { titulo: bloco.nome } }]

    case 'fim':
      return [{ tipo: 'fim', props: {} }]

    case 'tabela':
      return [{ tipo: 'tabela', props: { titulo: bloco.nome, colunas: bloco.colunas, linhas: bloco.linhas, blocoId: bloco.id } }]

    case 'importado':
      return [{ tipo: 'importado', props: { caminho: bloco.caminho, nome: bloco.nome } }]

    case 'projeto': {
      const dados = ctx.projetos?.get(String(bloco.projetoId))
      // Projeto que sumiu (SM apagou, ou a leitura falhou): 1 página de aviso.
      // Nunca zero páginas — sumir em silêncio do roteiro é pior que aparecer quebrado.
      if (!dados) return [{ tipo: 'projetoAusente', props: { nome: bloco.nome, projetoId: bloco.projetoId } }]
      const paginas = paginarProjeto({
        raias:      dados.raias || [],
        usaPacotes: dados.usaPacotes || false,
        pacotes:    dados.pacotes || [],
        ordem:      dados.ordem || [],
      })
      return paginas.map((unidades, i) => ({
        tipo: 'projeto',
        props: { dados, unidades, pagina: i + 1, totalPaginas: paginas.length },
      }))
    }

    case 'ras': {
      const a = ctx.insumos?.ras?.analise
      if (!a) return [{ tipo: 'insumoAusente', props: { qual: 'RAS' } }]
      // Consome o plano que veio junto da análise. Ver REGRA DE OURO no topo.
      const plano = a.plano || { dashboard: [{}], backlog: [] }
      const total = plano.dashboard.length + plano.backlog.length
      let n = 0
      return [
        ...plano.dashboard.map((pg, i) => ({
          tipo: 'rasDashboard',
          props: { analise: a, pagina: pg, indice: ++n, total, cont: plano.dashboard.length > 1 ? [i + 1, plano.dashboard.length] : null },
        })),
        ...plano.backlog.map((pg, i) => ({
          tipo: 'rasBacklog',
          props: { analise: a, pagina: pg, indice: ++n, total, cont: plano.backlog.length > 1 ? [i + 1, plano.backlog.length] : null },
        })),
      ]
    }

    case 'incidentes': {
      const a = ctx.insumos?.incidentes?.analise
      if (!a) return [{ tipo: 'insumoAusente', props: { qual: 'Incidentes' } }]
      const plano = a.plano || { dashboard: [{ atrasado: [], aguardando: [] }], backlog: [] }
      return [
        ...plano.dashboard.map((pg, i) => ({
          tipo: 'incDashboard',
          props: { analise: a, atrasado: pg.atrasado, aguardando: pg.aguardando,
                   cont: plano.dashboard.length > 1 ? [i + 1, plano.dashboard.length] : null },
        })),
        ...plano.backlog.map((linhas, i) => ({
          tipo: 'incBacklog',
          props: { analise: a, linhas, totalRegistros: (a.backlogRows || []).length,
                   cont: plano.backlog.length > 1 ? [i + 1, plano.backlog.length] : null },
        })),
      ]
    }

    default:
      return [{ tipo: 'desconhecido', props: { tipoOriginal: bloco.tipo } }]
  }
}

/**
 * Quantas páginas um bloco ocupa. Usado no rótulo "N slides" do roteiro.
 * Barato o bastante para chamar a cada render da lista.
 */
export function contarPaginas(bloco, ctx) {
  return paginasDoBloco(bloco, ctx).length
}

/**
 * Achata o roteiro inteiro na sequência de páginas a renderizar.
 * É a ÚNICA função que a tela, a apresentação e o PDF devem usar — se cada uma
 * montar a sua lista, o preview diz uma coisa e o arquivo sai outra.
 *
 * @returns {Array<object>} `{ chave, tipo, props, blocoIndex, blocoId, nomeBloco, pg, tot }`
 */
export function montarRoteiro(blocos, ctx = {}) {
  const out = []
  ;(blocos || []).forEach((bloco, bi) => {
    const paginas = paginasDoBloco(bloco, ctx)
    paginas.forEach((p, j) => {
      out.push({
        chave: `${bloco.id}:${j}`,
        tipo: p.tipo,
        props: p.props,
        blocoIndex: bi,
        blocoId: bloco.id,
        nomeBloco: bloco.nome,
        pg: j + 1,
        tot: paginas.length,
      })
    })
  })
  return out
}

/** Total de slides do roteiro. Atalho para o contador do cabeçalho. */
export const contarSlides = (blocos, ctx) => montarRoteiro(blocos, ctx).length

/* ═══════════════════════ OPERAÇÕES SOBRE O ROTEIRO ═══════════════════════ */
/* Todas devolvem um array NOVO — nada muta o roteiro no lugar, porque o
   histórico de desfazer guarda referências e mutação silenciosa quebraria. */

export function inserirApos(blocos, indice, ...novos) {
  const out = blocos.slice()
  out.splice(indice + 1, 0, ...novos)
  return out
}

export function remover(blocos, indice) {
  const out = blocos.slice()
  out.splice(indice, 1)
  return out
}

export function mover(blocos, de, para) {
  if (para < 0 || para >= blocos.length || de === para) return blocos
  const out = blocos.slice()
  const [b] = out.splice(de, 1)
  out.splice(para, 0, b)
  return out
}

/** Substitui o bloco único do tipo (RAS/Incidentes/capa) em vez de duplicar. */
export function substituirUnico(blocos, novo) {
  const semAntigo = ehUnico(novo.tipo) ? blocos.filter(b => b.tipo !== novo.tipo) : blocos
  return semAntigo
}

export function atualizarBloco(blocos, id, patch) {
  return blocos.map(b => (b.id === id ? { ...b, ...patch } : b))
}

/* ═══════════════════════ CARIMBO ═══════════════════════ */

/**
 * Texto do rodapé de todos os slides. É o antídoto contra o ruído de versão:
 * qualquer cópia antiga se denuncia sozinha.
 */
export function carimbo(reuniao) {
  if (!reuniao?.publicada) return 'Rascunho — não publicado'
  const v = `v${reuniao.versao}${reuniao.alterada ? '+' : ''}`
  return `RAS ${reuniao.dataReuniao} · ${v} · ${reuniao.editadoPorNome || ''}`.trim()
}

/** dd/mm/aaaa de hoje — formato usado no carimbo e no nome do PDF. */
export function hojeBR() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

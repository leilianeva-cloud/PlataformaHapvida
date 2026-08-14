/**
 * reuniao/reuniaoInsumos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A BANDEJA: o ponto de entrega entre o Atualizar RAS / Atualizar Incidentes e
 * a Reunião.
 *
 * POR QUE ELA EXISTE
 * O Gantt fica gravado no Supabase, então a Reunião só precisou de permissão
 * para ler. RAS e Incidentes não persistem nada — a planilha é lida no
 * navegador, o PPTX sai, e a análise morre quando a aba fecha. A bandeja é o
 * lugar onde essa análise sobrevive.
 *
 * O QUE VIAJA É A ANÁLISE, NÃO O ARQUIVO
 * Nada de .xlsx e nada de .pptx. Vai o JSON que o `analisarBase()` (Incidentes)
 * e o `processData()` (RAS) já produzem — incluindo o `plano` de paginação.
 * Assim o PPTX avulso e o PDF da reunião nascem da MESMA conta e não têm como
 * divergir. Se a Reunião recalculasse qualquer coisa, teríamos duas verdades.
 *
 * SEM HISTÓRICO, DE PROPÓSITO
 * Uma linha por tipo. Enviar de novo sobrescreve. Quem quiser tendência por
 * squad vai precisar de outra decisão de produto, não de um remendo aqui.
 *
 * ESTE ARQUIVO É IMPORTADO POR TELAS EM PRODUÇÃO
 * O ReportRasScreen e o ReportIncidentesScreen chamam `enviarInsumo`. Mudança
 * de assinatura aqui quebra os dois. Adicione campos; não renomeie os que
 * existem.
 */

import { supabase, logAudit } from '../supabaseClient'

export const TIPOS_INSUMO = ['ras', 'incidentes']

/** Depois de quantos dias a bandeja passa a avisar que o dado pode estar velho. */
export const DIAS_PARA_ALERTA = 2

function falhar(onde, error) {
  const e = new Error(`[${onde}] ${error?.message || 'erro desconhecido'}`)
  e.causa = error
  return e
}

const paraModelo = (row) => ({
  tipo:      row.tipo,
  arquivo:   row.arquivo || '',
  slides:    row.slides || 0,
  resumo:    row.resumo_json || {},
  analise:   row.analise_json || {},
  enviadoPor:     row.enviado_por,
  enviadoPorNome: row.enviado_por_nome || '',
  enviadoEm:      row.enviado_em,
})

/* ═══════════════════════ ENVIAR ═══════════════════════ */

/**
 * Grava a análise na bandeja. Chamado pelo botão "Enviar para a Reunião".
 *
 * @param {'ras'|'incidentes'} tipo
 * @param {object} p
 * @param {string} p.arquivo  nome da(s) planilha(s), só para exibir no cartão
 * @param {number} p.slides   quantos slides a análise gera
 * @param {object} p.resumo   KPIs curtos para o cartão — poucos bytes
 * @param {object} p.analise  a saída completa de analisarBase/processData
 * @param {object} p.usuario  { id, nome }
 */
export async function enviarInsumo(tipo, { arquivo, slides, resumo, analise, usuario }) {
  if (!TIPOS_INSUMO.includes(tipo)) throw new Error(`Tipo de insumo inválido: ${tipo}`)
  if (!analise) throw new Error('Análise vazia — nada a enviar.')

  const { error } = await supabase.from('reuniao_insumos').upsert({
    tipo,
    arquivo:          String(arquivo || ''),
    slides:           Number(slides || 0),
    resumo_json:      resumo || {},
    analise_json:     analise,
    enviado_por:      usuario?.id || null,
    enviado_por_nome: usuario?.nome || '',
    enviado_em:       new Date().toISOString(),
  }, { onConflict: 'tipo' })

  // Erro comum aqui: payload grande demais. Vale a mensagem real, não um null.
  if (error) throw falhar('enviarInsumo', error)

  await logAudit({
    action: 'ENVIAR_INSUMO_REUNIAO', entity: 'reuniao_insumo', entityId: tipo,
    detail: { arquivo, slides },
  })
}

/* ═══════════════════════ LER ═══════════════════════ */

/** Um insumo. Devolve null só quando a bandeja está vazia — erro joga. */
export async function lerInsumo(tipo) {
  const { data, error } = await supabase
    .from('reuniao_insumos').select('*').eq('tipo', tipo).maybeSingle()
  if (error) throw falhar('lerInsumo', error)
  return data ? paraModelo(data) : null
}

/**
 * Os dois de uma vez, para montar o roteiro sem duas idas ao banco.
 * @returns {Promise<{ras: object|null, incidentes: object|null}>}
 */
export async function lerInsumos() {
  const { data, error } = await supabase.from('reuniao_insumos').select('*')
  if (error) throw falhar('lerInsumos', error)
  const out = { ras: null, incidentes: null }
  ;(data || []).forEach(row => { out[row.tipo] = paraModelo(row) })
  return out
}

/**
 * Só o cabeçalho, sem o `analise_json`.
 * A análise pode ter centenas de KB; para desenhar o cartão da bandeja e o
 * aviso de "enviado há N dias" isso é peso morto.
 */
export async function lerResumos() {
  const { data, error } = await supabase
    .from('reuniao_insumos')
    .select('tipo, arquivo, slides, resumo_json, enviado_por_nome, enviado_em')
  if (error) throw falhar('lerResumos', error)
  const out = { ras: null, incidentes: null }
  ;(data || []).forEach(r => {
    out[r.tipo] = {
      tipo: r.tipo, arquivo: r.arquivo || '', slides: r.slides || 0,
      resumo: r.resumo_json || {}, enviadoPorNome: r.enviado_por_nome || '',
      enviadoEm: r.enviado_em,
    }
  })
  return out
}

/* ═══════════════════════ IDADE ═══════════════════════ */

/** Dias inteiros desde o envio. null quando não há insumo. */
export function diasDesde(enviadoEm) {
  if (!enviadoEm) return null
  const ms = Date.now() - new Date(enviadoEm).getTime()
  return Math.floor(ms / 86400000)
}

/** A bandeja merece aviso laranja? */
export const estaVelho = (enviadoEm) => (diasDesde(enviadoEm) ?? 0) >= DIAS_PARA_ALERTA

/** Texto pronto: "hoje", "ontem", "há 4 dias". */
export function idadeTexto(enviadoEm) {
  const d = diasDesde(enviadoEm)
  if (d === null) return ''
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  return `há ${d} dias`
}

/* ═══════════════════════ RESUMOS PADRÃO ═══════════════════════ */
/* O que aparece no cartão da bandeja. Fica aqui e não na tela para o RAS e o
   Incidentes montarem o mesmo formato sem combinar nada entre si. */

/** @param {object} a saída de processData (RAS) */
export const resumoRas = (a) => ({
  kpis: [
    ['Demandas',  a?.kpis?.total    ?? a?.total    ?? 0],
    ['No prazo',  a?.kpis?.noPrazo  ?? a?.noPrazo  ?? 0],
    ['Alerta',    a?.kpis?.alerta   ?? a?.alerta   ?? 0],
    ['Atrasados', a?.kpis?.atrasados ?? a?.atrasados ?? 0],
  ],
})

/** @param {object} a saída de analisarBase (Incidentes) */
export const resumoIncidentes = (a) => ({
  kpis: [
    ['Válidos',    a?.kpis?.total     ?? 0],
    ['Concluídos', a?.kpis?.concluido ?? 0],
    ['Andamento',  a?.kpis?.andamento ?? 0],
    ['Atrasados',  a?.kpis?.atrasado  ?? 0],
  ],
})

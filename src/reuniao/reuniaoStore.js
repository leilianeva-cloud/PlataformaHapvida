/**
 * reuniao/reuniaoStore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Toda a conversa da Reunião com o Supabase mora aqui. Nenhum componente fala
 * com o banco direto.
 *
 * TABELAS
 *   reuniao_rascunho  linha única (id = 1). Uma reunião viva por vez, garantido
 *                     por CHECK no banco, não só pela tela.
 *   report_projects   leitura de todos os SMs, liberada pela política
 *                     `report_projects_select_reuniao` para quem tem pode_reuniao.
 *   storage/reunioes  conteúdos importados, em reunioes/{reuniaoId}/.
 *
 * ERRO NUNCA VIRA null
 * O padrão `if (error) return null` já custou caro nesta plataforma duas vezes:
 * no `fetchProfile` escondeu a recursão de RLS, e no template do Incidentes fez
 * "sem permissão" virar "faça upload". Aqui todo erro sobe como Error com a
 * mensagem original. Quem chama decide o que mostrar — mas fica sabendo a causa.
 */

import { supabase, logAudit } from '../supabaseClient'

const BUCKET = 'reunioes'

/** Erro com contexto, preservando a mensagem que o Supabase devolveu. */
function falhar(onde, error) {
  const e = new Error(`[${onde}] ${error?.message || 'erro desconhecido'}`)
  e.causa = error
  e.code = error?.code
  return e
}

/* ═══════════════════════ RASCUNHO ═══════════════════════ */

const paraModelo = (row) => ({
  reuniaoId:     row.reuniao_id,
  titulo:        row.titulo,
  dataReuniao:   row.data_reuniao,
  versao:        row.versao,
  publicada:     row.publicada,
  alterada:      row.alterada,
  blocos:        Array.isArray(row.roteiro_json) ? row.roteiro_json : [],
  editadoPor:    row.editado_por,
  editadoPorNome: row.editado_por_nome || '',
  editadoEm:     row.editado_em,
})

/**
 * Carrega a reunião em andamento.
 * @returns {Promise<object|null>} null SÓ quando não existe nenhuma — erro joga.
 */
export async function carregarRascunho() {
  const { data, error } = await supabase
    .from('reuniao_rascunho')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw falhar('carregarRascunho', error)
  return data ? paraModelo(data) : null
}

/**
 * Grava a reunião inteira. Chamada com debounce pela tela — não chame a cada
 * tecla digitada. `roteiro_json` é jsonb: manda objeto, não string.
 */
export async function salvarRascunho(reuniao, usuario) {
  const { error } = await supabase.from('reuniao_rascunho').upsert({
    id:               1,
    reuniao_id:       reuniao.reuniaoId,
    titulo:           reuniao.titulo,
    data_reuniao:     reuniao.dataReuniao,
    versao:           reuniao.versao,
    publicada:        !!reuniao.publicada,
    alterada:         !!reuniao.alterada,
    roteiro_json:     reuniao.blocos || [],
    editado_por:      usuario?.id || null,
    editado_por_nome: usuario?.nome || '',
    editado_em:       new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) throw falhar('salvarRascunho', error)
}

/**
 * Descarta a reunião atual e começa outra.
 * Apaga a pasta de importados ANTES de trocar a linha: se apagasse depois e a
 * gravação falhasse, os arquivos ficariam órfãos no Storage para sempre.
 */
export async function trocarReuniao(reuniaoAntiga, novaReuniao, usuario) {
  if (reuniaoAntiga?.reuniaoId) {
    await limparPasta(reuniaoAntiga.reuniaoId)
  }
  await salvarRascunho(novaReuniao, usuario)
  await logAudit({
    action: 'NOVA_REUNIAO', entity: 'reuniao', entityId: novaReuniao.reuniaoId,
    detail: { substituiu: reuniaoAntiga?.reuniaoId || null, titulo: novaReuniao.titulo },
  })
}

/* ═══════════════════════ PROJETOS DE TODOS OS SMs ═══════════════════════ */

/**
 * Lê os projetos de todos os SMs, agrupados por dono.
 *
 * Depende da política `report_projects_select_reuniao`. Sem pode_reuniao, o
 * PostgREST devolve lista vazia — não erro. Por isso o retorno traz `vazio`
 * separado: "ninguém tem projeto" e "você não tem permissão" precisam de
 * mensagens diferentes na tela.
 *
 * @returns {Promise<{porSM: Array, total: number, semNomes: boolean}>}
 */
export async function listarProjetosDeTodos() {
  const { data, error } = await supabase
    .from('report_projects')
    .select('project_id, user_id, n_futuros, n_passados, usa_pacotes, projeto_json, raias_json, pacotes_json, ordem_json, updated_at')
    .order('updated_at', { ascending: false })
    .range(0, 99999)          // PostgREST trunca em 1000 por padrão
  if (error) throw falhar('listarProjetosDeTodos', error)

  const linhas = (data || []).map(row => {
    let projeto = {}, raias = [], pacotes = [], ordem = []
    try { projeto = row.projeto_json ? JSON.parse(row.projeto_json) : {} } catch { /* linha corrompida: segue com vazio */ }
    try { raias   = row.raias_json   ? JSON.parse(row.raias_json)   : [] } catch { /* idem */ }
    try { pacotes = row.pacotes_json ? JSON.parse(row.pacotes_json) : [] } catch { /* idem */ }
    try { ordem   = row.ordem_json   ? JSON.parse(row.ordem_json)   : [] } catch { /* idem */ }
    return {
      projectId:  String(row.project_id),
      userId:     row.user_id,
      nome:       projeto?.nome || '(sem nome)',
      atualizado: row.updated_at,
      dados: {
        projeto, raias, pacotes, ordem,
        usaPacotes: !!row.usa_pacotes,
        nFuturos:   row.n_futuros ?? 1,
        nPassados:  row.n_passados ?? 0,
      },
    }
  })

  // Nome do SM: report_projects guarda só o user_id.
  const ids = [...new Set(linhas.map(l => l.userId).filter(Boolean))]
  const nomes = new Map()
  if (ids.length) {
    const { data: perfis, error: errPerfis } = await supabase
      .from('profiles').select('id, name, email').in('id', ids)
    // Falha aqui NÃO derruba a lista: sem nome ainda dá para escolher o projeto.
    if (errPerfis) console.warn('[listarProjetosDeTodos] perfis:', errPerfis.message)
    ;(perfis || []).forEach(p => nomes.set(p.id, p.name || p.email || ''))
  }

  const porSM = []
  const idx = new Map()
  linhas.forEach(l => {
    const chave = l.userId || 'sem-dono'
    if (!idx.has(chave)) {
      idx.set(chave, porSM.length)
      porSM.push({ userId: l.userId, smNome: nomes.get(l.userId) || '', projetos: [] })
    }
    porSM[idx.get(chave)].projetos.push({ ...l, smNome: nomes.get(l.userId) || '' })
  })
  porSM.sort((a, b) => (a.smNome || 'zz').localeCompare(b.smNome || 'zz'))

  return { porSM, total: linhas.length, semNomes: ids.length > 0 && nomes.size === 0 }
}

/** Recarrega um projeto específico — usado na referência viva ao abrir a reunião. */
export async function carregarProjeto(projectId, userId) {
  const { data, error } = await supabase
    .from('report_projects')
    .select('project_id, user_id, n_futuros, n_passados, usa_pacotes, projeto_json, raias_json, pacotes_json, ordem_json, updated_at')
    .eq('project_id', String(projectId))
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw falhar('carregarProjeto', error)
  if (!data) return null
  const j = (s, f) => { try { return s ? JSON.parse(s) : f } catch { return f } }
  return {
    projeto:    j(data.projeto_json, {}),
    raias:      j(data.raias_json, []),
    pacotes:    j(data.pacotes_json, []),
    ordem:      j(data.ordem_json, []),
    usaPacotes: !!data.usa_pacotes,
    nFuturos:   data.n_futuros ?? 1,
    nPassados:  data.n_passados ?? 0,
    atualizado: data.updated_at,
  }
}

/* ═══════════════════════ CONTEÚDO IMPORTADO (Storage) ═══════════════════════ */

/**
 * Sobe uma imagem já tratada. Devolve o caminho, que é o que fica no roteiro —
 * URL assinada expira, caminho não.
 */
export async function subirImportado(reuniaoId, blob, nomeArquivo) {
  const seguro = String(nomeArquivo || 'slide')
    .replace(/[^\w.\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'slide'
  const caminho = `${reuniaoId}/${Date.now()}_${seguro}.png`
  const { error } = await supabase.storage.from(BUCKET)
    .upload(caminho, blob, { contentType: 'image/png', upsert: false })
  if (error) throw falhar('subirImportado', error)
  return caminho
}

/** URL temporária para exibir. Uma hora dá e sobra para montar e apresentar. */
export async function urlImportado(caminho, segundos = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, segundos)
  if (error) throw falhar('urlImportado', error)
  return data.signedUrl
}

/** Várias de uma vez — evita N chamadas ao abrir um roteiro cheio de anexos. */
export async function urlsImportados(caminhos, segundos = 3600) {
  const lista = (caminhos || []).filter(Boolean)
  if (!lista.length) return new Map()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(lista, segundos)
  if (error) throw falhar('urlsImportados', error)
  const m = new Map()
  ;(data || []).forEach(d => { if (d.signedUrl) m.set(d.path, d.signedUrl) })
  return m
}

/** Remove um arquivo. Falha aqui não é fatal — o pior caso é lixo no Storage. */
export async function removerImportado(caminho) {
  const { error } = await supabase.storage.from(BUCKET).remove([caminho])
  if (error) console.warn('[removerImportado]', error.message)
}

/**
 * Esvazia a pasta de uma reunião.
 * Sem isto o consumo cresce para sempre: ~2 MB por semana que nunca são usados
 * de novo. É o passo que a gente combinou de escrever de propósito.
 */
export async function limparPasta(reuniaoId) {
  const { data, error } = await supabase.storage.from(BUCKET).list(String(reuniaoId), { limit: 1000 })
  if (error) { console.warn('[limparPasta] list:', error.message); return 0 }
  const alvos = (data || []).map(f => `${reuniaoId}/${f.name}`)
  if (!alvos.length) return 0
  const { error: errDel } = await supabase.storage.from(BUCKET).remove(alvos)
  if (errDel) { console.warn('[limparPasta] remove:', errDel.message); return 0 }
  return alvos.length
}

/* ═══════════════════════ AUDITORIA ═══════════════════════ */

export const auditarPublicacao = (reuniao, nSlides) => logAudit({
  action: 'PUBLICAR_REUNIAO', entity: 'reuniao', entityId: reuniao.reuniaoId,
  detail: { titulo: reuniao.titulo, versao: reuniao.versao, blocos: reuniao.blocos.length, slides: nSlides },
})

export const auditarExportacao = (reuniao, nSlides) => logAudit({
  action: 'EXPORTAR_PDF_REUNIAO', entity: 'reuniao', entityId: reuniao.reuniaoId,
  detail: { titulo: reuniao.titulo, versao: reuniao.versao, slides: nSlides },
})

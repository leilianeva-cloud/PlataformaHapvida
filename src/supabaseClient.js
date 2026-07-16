import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Auditoria ──────────────────────────────────────────────────
export async function logAudit({ action, entity, entityId, detail }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('audit_log').insert({
    user_id:    user.id,
    user_email: user.email,
    action,
    entity,
    entity_id:  entityId ? String(entityId) : null,
    detail:     detail || null,
  })
}

// ── Sessão / uso ───────────────────────────────────────────────
export async function logSession({ action, detail }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('session_log').insert({
    user_id:    user.id,
    user_email: user.email,
    action,
    detail:     detail || null,
  })
}

// ── Portfólio compartilhado (linha única, id=1) ────────────────
// Leitura: liberada a todos os autenticados (RLS).
// Escrita: só admin (RLS barra o resto no servidor, além do gate na UI).

/**
 * Carrega o portfólio compartilhado do time.
 * Retorna { rows, importedAt, importedByEmail } ou null se ainda não houver.
 */
export async function loadSharedPortfolio() {
  const { data, error } = await supabase
    .from('portfolio_shared')
    .select('rows_json, imported_at, imported_by_email')
    .eq('id', 1)
    .maybeSingle()
  if (error) { console.warn('[loadSharedPortfolio]', error.message); return null }
  if (!data?.rows_json) return null
  return {
    rows:            JSON.parse(data.rows_json),
    importedAt:      data.imported_at || '',
    importedByEmail: data.imported_by_email || '',
  }
}

/**
 * Grava o portfólio compartilhado (só admin — a RLS recusa não-admin).
 * `rows` são as linhas de dados já fatiadas (sem o cabeçalho).
 * Retorna { ok, error }.
 */
export async function saveSharedPortfolio(rows) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sem usuário logado' }
  const now = new Date()
  const importedAtStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`
  const { error } = await supabase.from('portfolio_shared').upsert({
    id:                1,
    rows_json:         JSON.stringify(rows),
    imported_by:       user.id,
    imported_by_email: user.email,
    imported_at:       importedAtStr,
    updated_at:        now.toISOString(),
  }, { onConflict: 'id' })
  if (error) {
    console.error('[saveSharedPortfolio]', error.message)
    // Erro típico de RLS quando não-admin tenta importar:
    return { ok: false, error: error.message }
  }
  await logSession({ action: 'IMPORT_PORTFOLIO', detail: { total_rows: rows.length, shared: true } })
  return { ok: true, importedAt: importedAtStr }
}

// ── Template RAS (Storage) ─────────────────────────────────────
// Caminho fixo: bucket "templates", arquivo "ras/report_ras_template.pptx"
// Troca de template é feita direto no Supabase Dashboard pelo admin.
const RAS_TEMPLATE_BUCKET = 'templates'
const RAS_TEMPLATE_PATH   = 'ras/report_ras_template.pptx'

/**
 * Baixa o template RAS como ArrayBuffer (pronto para JSZip).
 * Retorna null se o arquivo não existir no Storage.
 */
export async function loadRasTemplate() {
  const { data, error } = await supabase
    .storage
    .from(RAS_TEMPLATE_BUCKET)
    .download(RAS_TEMPLATE_PATH)
  if (error) {
    console.warn('[loadRasTemplate] Erro:', error.message)
    return null
  }
  return await data.arrayBuffer()
}

/**
 * Retorna metadados do template RAS (nome, updated_at, tamanho).
 * Usa list() para pegar atributos do objeto. Retorna null se não existir.
 */
export async function getRasTemplateInfo() {
  const { data, error } = await supabase
    .storage
    .from(RAS_TEMPLATE_BUCKET)
    .list('ras', { limit: 100, search: 'report_ras_template.pptx' })
  if (error || !data || data.length === 0) {
    console.warn('[getRasTemplateInfo] Não encontrado:', error?.message)
    return null
  }
  const file = data.find(f => f.name === 'report_ras_template.pptx')
  if (!file) return null
  return {
    name:      file.name,
    updatedAt: file.updated_at || file.created_at || null,
    size:      file.metadata?.size || null,
  }
}

// ── Template Incidentes (Storage) ──────────────────────────────
// Caminho fixo: bucket "templates", arquivo "incidentes/report_incidentes_template.pptx"
// Troca de template é feita direto no Supabase Dashboard pelo admin (mesmo padrão da RAS).
const INCIDENTES_TEMPLATE_BUCKET = 'templates'
const INCIDENTES_TEMPLATE_DIR    = 'incidentes'
const INCIDENTES_TEMPLATE_FILE   = 'report_incidentes_template.pptx'
const INCIDENTES_TEMPLATE_PATH   = `${INCIDENTES_TEMPLATE_DIR}/${INCIDENTES_TEMPLATE_FILE}`

/**
 * Baixa o template de Incidentes como ArrayBuffer (pronto para JSZip).
 * Retorna null se o arquivo não existir no Storage.
 */
export async function loadIncidentesTemplate() {
  const { data, error } = await supabase
    .storage
    .from(INCIDENTES_TEMPLATE_BUCKET)
    .download(INCIDENTES_TEMPLATE_PATH)
  if (error) {
    console.warn('[loadIncidentesTemplate] Erro:', error.message)
    return null
  }
  return await data.arrayBuffer()
}

/**
 * Retorna metadados do template de Incidentes (nome, updated_at, tamanho).
 * Usa list() para pegar atributos do objeto. Retorna null se não existir.
 */
export async function getIncidentesTemplateInfo() {
  const { data, error } = await supabase
    .storage
    .from(INCIDENTES_TEMPLATE_BUCKET)
    .list(INCIDENTES_TEMPLATE_DIR, { limit: 100, search: INCIDENTES_TEMPLATE_FILE })
  if (error || !data || data.length === 0) {
    console.warn('[getIncidentesTemplateInfo] Não encontrado:', error?.message)
    return null
  }
  const file = data.find(f => f.name === INCIDENTES_TEMPLATE_FILE)
  if (!file) return null
  return {
    name:      file.name,
    updatedAt: file.updated_at || file.created_at || null,
    size:      file.metadata?.size || null,
  }
}

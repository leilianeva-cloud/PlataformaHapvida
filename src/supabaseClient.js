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

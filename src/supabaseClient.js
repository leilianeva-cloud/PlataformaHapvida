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

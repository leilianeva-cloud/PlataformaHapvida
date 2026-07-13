// ════════════════════════════════════════════════════════════════════
//  api/admin-usuarios.js  —  Função Serverless (Vercel)
//
//  Centraliza TODAS as operações privilegiadas de usuário que não podem
//  rodar no navegador porque exigem a service_role do Supabase:
//    · solicitar       (PÚBLICA)  cria conta bloqueada, aguardando aprovação
//    · criar           (admin)    cria usuário já liberado, com senha definida
//    · aprovar         (admin)    libera um cadastro pendente
//    · recusar         (admin)    apaga o cadastro pendente (Auth + profile)
//    · resetar-senha   (admin)    define uma nova senha para o usuário
//    · excluir         (admin)    apaga o usuário de vez (Auth + profile)
//
//  A service_role NUNCA vai para o navegador. Fica só aqui, na variável
//  SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables).
//  Toda ação de admin valida o token da sessão + is_admin antes de rodar.
// ════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOMINIO          = '@hapvida.com.br'
const MIN_SENHA        = 6

// Cliente com poderes de admin (service_role). Sem persistir sessão.
function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function emailDoDominio(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(DOMINIO)
}

// Valida o token da sessão e confirma que quem chamou é admin de verdade.
async function exigirAdmin(req, sb) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return { ok: false, status: 401, error: 'Não autenticado.' }

  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' }

  const { data: prof, error: e2 } = await sb
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (e2 || !prof?.is_admin) {
    return { ok: false, status: 403, error: 'Acesso restrito a administradores.' }
  }
  return { ok: true, adminUser: user }
}

// Registra no audit_log em nome do admin que executou. Nunca derruba a operação.
async function registrarAudit(sb, adminUser, action, entityId, detail) {
  try {
    await sb.from('audit_log').insert({
      user_id:    adminUser?.id    || null,
      user_email: adminUser?.email || null,
      action,
      entity:     'user',
      entity_id:  entityId ? String(entityId) : null,
      detail:     detail || null,
    })
  } catch (_) { /* auditoria é acessória: se falhar, a ação principal segue */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Configuração ausente: defina SUPABASE_SERVICE_ROLE_KEY na Vercel.',
    })
  }

  const sb = adminClient()
  const body = req.body || {}
  const { action } = body

  try {
    // ── AÇÃO PÚBLICA: solicitar acesso ────────────────────────────
    // Cria a conta já com a senha que a pessoa escolheu (hasheada pelo
    // próprio Auth), porém marcada como pendente e inativa. O "porteiro"
    // no AuthContext barra o login até um admin aprovar.
    if (action === 'solicitar') {
      const { name, email, password } = body
      if (!name?.trim())            return res.status(400).json({ error: 'Informe seu nome.' })
      if (!emailDoDominio(email))   return res.status(400).json({ error: `O e-mail precisa terminar em ${DOMINIO}.` })
      if (!password || password.length < MIN_SENHA)
                                    return res.status(400).json({ error: `A senha deve ter ao menos ${MIN_SENHA} caracteres.` })

      const { data, error } = await sb.auth.admin.createUser({
        email:         email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { name: name.trim() },
      })
      if (error) {
        const msg = /already|exist|registered/i.test(error.message)
          ? 'Já existe um cadastro ou solicitação com esse e-mail.'
          : error.message
        return res.status(400).json({ error: msg })
      }

      await sb.from('profiles').update({
        name:            name.trim(),
        approval_status: 'pending',
        is_active:       false,
        updated_at:      new Date().toISOString(),
      }).eq('id', data.user.id)

      return res.status(200).json({ ok: true })
    }

    // ── Daqui pra baixo, só admin autenticado ─────────────────────
    const auth = await exigirAdmin(req, sb)
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
    const adminUser = auth.adminUser

    // ── criar (admin define a senha, já liberado) ─────────────────
    if (action === 'criar') {
      const { name, email, password, isAdmin } = body
      if (!name?.trim())            return res.status(400).json({ error: 'Nome obrigatório.' })
      if (!emailDoDominio(email))   return res.status(400).json({ error: `O e-mail precisa terminar em ${DOMINIO}.` })
      if (!password || password.length < MIN_SENHA)
                                    return res.status(400).json({ error: `A senha deve ter ao menos ${MIN_SENHA} caracteres.` })

      const { data, error } = await sb.auth.admin.createUser({
        email:         email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { name: name.trim() },
      })
      if (error) {
        const msg = /already|exist|registered/i.test(error.message)
          ? 'Já existe um usuário com esse e-mail.'
          : error.message
        return res.status(400).json({ error: msg })
      }

      await sb.from('profiles').update({
        name:            name.trim(),
        is_admin:        !!isAdmin,
        approval_status: 'approved',
        is_active:       true,
        updated_at:      new Date().toISOString(),
      }).eq('id', data.user.id)

      await registrarAudit(sb, adminUser, 'CREATE_USER', data.user.id, { email, name, is_admin: !!isAdmin })
      return res.status(200).json({ ok: true, id: data.user.id })
    }

    // ── aprovar solicitação ───────────────────────────────────────
    if (action === 'aprovar') {
      const { id } = body
      if (!id) return res.status(400).json({ error: 'ID ausente.' })
      const { error } = await sb.from('profiles').update({
        approval_status: 'approved',
        is_active:       true,
        updated_at:      new Date().toISOString(),
      }).eq('id', id)
      if (error) return res.status(400).json({ error: error.message })
      await registrarAudit(sb, adminUser, 'APPROVE_USER', id, null)
      return res.status(200).json({ ok: true })
    }

    // ── recusar solicitação (apaga Auth + profile) ────────────────
    if (action === 'recusar') {
      const { id } = body
      if (!id) return res.status(400).json({ error: 'ID ausente.' })
      const { error } = await sb.auth.admin.deleteUser(id)
      if (error && !/not found/i.test(error.message)) {
        return res.status(400).json({ error: error.message })
      }
      await sb.from('profiles').delete().eq('id', id)
      await registrarAudit(sb, adminUser, 'REJECT_USER', id, null)
      return res.status(200).json({ ok: true })
    }

    // ── resetar senha (define uma nova na hora) ───────────────────
    if (action === 'resetar-senha') {
      const { id, password } = body
      if (!id) return res.status(400).json({ error: 'ID ausente.' })
      if (!password || password.length < MIN_SENHA)
        return res.status(400).json({ error: `A senha deve ter ao menos ${MIN_SENHA} caracteres.` })
      const { error } = await sb.auth.admin.updateUserById(id, { password })
      if (error) return res.status(400).json({ error: error.message })
      await registrarAudit(sb, adminUser, 'RESET_PASSWORD', id, null)
      return res.status(200).json({ ok: true })
    }

    // ── excluir usuário (apaga Auth + profile) ────────────────────
    if (action === 'excluir') {
      const { id } = body
      if (!id) return res.status(400).json({ error: 'ID ausente.' })
      if (id === adminUser.id) return res.status(400).json({ error: 'Você não pode excluir a própria conta.' })
      const { error } = await sb.auth.admin.deleteUser(id)
      if (error && !/not found/i.test(error.message)) {
        return res.status(400).json({ error: error.message })
      }
      await sb.from('profiles').delete().eq('id', id)
      await registrarAudit(sb, adminUser, 'DELETE_USER', id, null)
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Ação desconhecida.' })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno.' })
  }
}

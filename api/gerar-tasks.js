// ════════════════════════════════════════════════════════════════════
//  api/gerar-tasks.js  —  Função Serverless (Vercel)
//  Recebe a ata de reunião, chama a API do Google Gemini (camada
//  gratuita) para extrair itens de ação, e devolve
//  { tasks: [{ title, priority }] }.
//
//  A chave fica em GEMINI_API_KEY (variável de ambiente da Vercel),
//  NUNCA no navegador. Este é o motivo de existir este backend.
// ════════════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-2.5-flash' // estável e gratuito; troque por 'gemini-2.5-flash-lite' se quiser cota diária maior

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada na Vercel' })
  }

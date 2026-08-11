// =====================================================================
//  portfolioUtils.js — fonte ÚNICA da lógica de chave e validação.
//  Importado por App.jsx (Status) e PortfolioScreen.jsx (Portfólio).
//  Manter aqui garante que as duas telas gerem a MESMA chave para a
//  mesma linha — divergência aqui quebraria a ponte em silêncio.
// =====================================================================

// Mapeamento de colunas do Excel (Portfólio). Header na linha 2.
export const COL = {
  ID: 0, NOME: 2, DESC: 3, AREA_EXEC: 7, LIDER_EXEC: 8, DIR_EXEC: 9, SM: 12,
  AREA_CLI: 14, LIDER_CLI: 15, DIR_CLI: 16, STATUS: 20, DT_INICIO: 21,
  TRIMESTRE: 57, COMPROMISSO: 58, DESPRI: 59,
};

// Linha válida para o report: tem nome, não está cancelada/suspensa/despriorizada.
export const isValid = (r) => {
  if (!r[COL.NOME]) return false;
  const st = String(r[COL.STATUS] || '').toLowerCase();
  if (st.includes('cancelado') || st.includes('suspenso')) return false;
  if (r[COL.DESPRI] && String(r[COL.DESPRI]).trim() !== '') return false;
  return true;
};

// Impressão digital de campos ESTÁVEIS (nome | área exec | SM | início).
// Fora: trimestre e compromisso — mudam na repriorização e quebrariam o vínculo.
const _norm = (s) => String(s ?? '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

export const fingerprint = (r) => {
  const base = [_norm(r[COL.NOME]), _norm(r[COL.AREA_EXEC]), _norm(r[COL.SM]), String(r[COL.DT_INICIO] ?? '')].join('|');
  let h = 2166136261; // FNV-1a 32-bit
  for (let i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
};

// Chave ESTÁVEL — nunca derivada da posição na planilha.
//   Com Lecom            → lecom:<lecom>  (o Lecom É a identidade)
//   Sem Lecom / PENDENTE → pend:<impressão digital>
export const rKey = (r) => {
  const id = String(r[COL.ID] ?? '').trim();
  return (id && id.toUpperCase() !== 'PENDENTE') ? `lecom:${id}` : `pend:${fingerprint(r)}`;
};

// Chave da LINHA (demanda). Um Lecom pode ter N linhas distintas no portfólio —
// o Lecom identifica o CHAMADO, não a demanda. rKey continua sendo a identidade
// do chamado (contagem "projetos distintos"); rowKey distingue linha a linha.
export const rowKey = (r) => `${rKey(r)}#${fingerprint(r)}`;

// =====================================================================
//  portfolioUtils.js — fonte ÚNICA da lógica de chave e validação.
//  Importado por App.jsx (Status) e PortfolioScreen.jsx (Portfólio).
//  Manter aqui garante que as duas telas gerem a MESMA chave para a
//  mesma linha — divergência aqui quebraria a ponte em silêncio.
// =====================================================================

import { COL_CANONICO } from './colunas';

// COL não é mais uma lista de posições da planilha de origem.
// Na importação, cada linha é reescrita no layout CANÔNICO definido em
// colunas.js (ORDEM_PORTFOLIO) — a posição na planilha é resolvida lá,
// pelo NOME do cabeçalho. Daqui para baixo o índice é fixo para sempre.
//
// Consequência: mudança de layout na planilha de origem não chega até aqui.
// Só é preciso mexer em colunas.js, adicionando o nome novo aos apelidos.
export const COL = COL_CANONICO;

// Linha válida para o report: tem nome, não está cancelada/suspensa/despriorizada.
// Comparação por "contém" no status porque a planilha passou a trazer a
// explicação junto: "Suspenso → pausado por decisão executiva".
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

/**
 * reuniao/blocos/Slide.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Recebe UMA página do `montarRoteiro()` e desenha o componente certo.
 *
 * Existe para que a tela de montagem, o modo apresentação e o PDF usem
 * exatamente o mesmo caminho de renderização. Se cada um escolhesse o seu
 * componente, o preview e o arquivo poderiam divergir — e divergiriam, porque
 * alguém acabaria consertando um e esquecendo o outro.
 *
 * Todo slide sai com 960×540 fixos. Escala é problema de quem posiciona.
 */

import React from 'react'
import { Capa, Divisoria, Encerramento, ProjetoAusente, InsumoAusente } from './BlocosEstrutura'
import { BlocoTabela, BlocoImportado } from './BlocoTabela'
import BlocoProjeto from './BlocoProjeto'
import { IncidentesDashboard, IncidentesBacklog } from './BlocoIncidentes'

export default function Slide({ pagina, carimbo, editavel = false, onMudarTabela, urlImportado }) {
  const p = pagina?.props || {}

  switch (pagina?.tipo) {
    case 'capa':        return <Capa titulo={p.titulo} carimbo={carimbo} />
    case 'divisoria':   return <Divisoria titulo={p.titulo} carimbo={carimbo} />
    case 'fim':         return <Encerramento carimbo={carimbo} />

    case 'projeto':
      return <BlocoProjeto dados={p.dados} unidades={p.unidades}
                           pagina={p.pagina} totalPaginas={p.totalPaginas} carimbo={carimbo} />

    case 'incDashboard':
      return <IncidentesDashboard analise={p.analise} atrasado={p.atrasado}
                                  aguardando={p.aguardando} cont={p.cont} carimbo={carimbo} />
    case 'incBacklog':
      return <IncidentesBacklog analise={p.analise} linhas={p.linhas}
                                totalRegistros={p.totalRegistros} cont={p.cont} carimbo={carimbo} />

    case 'tabela':
      return <BlocoTabela titulo={p.titulo} colunas={p.colunas} linhas={p.linhas}
                          carimbo={carimbo} editavel={editavel}
                          onMudar={(tipo, i, j, valor) => onMudarTabela?.(p.blocoId, tipo, i, j, valor)} />

    case 'importado':
      return <BlocoImportado url={urlImportado?.(p.caminho)} nome={p.nome} carimbo={carimbo} />

    case 'projetoAusente': return <ProjetoAusente nome={p.nome} projetoId={p.projetoId} carimbo={carimbo} />
    case 'insumoAusente':  return <InsumoAusente qual={p.qual} carimbo={carimbo} />

    // Roteiro salvo por uma versão mais nova do que este código. Não quebra a
    // apresentação inteira por causa de um bloco desconhecido.
    default:
      return <InsumoAusente qual={pagina?.tipo || 'conteúdo'} carimbo={carimbo} />
  }
}

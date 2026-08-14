/**
 * reuniao/blocos/BlocoIncidentes.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Os dois slides do report de Incidentes: dashboard e backlog.
 *
 * Layout copiado de `report_incidentes_template.pptx`. Os dados vêm inteiros do
 * `analisarBase()` da engine — inclusive a paginação, que já chega decidida no
 * `plano`. Este arquivo não conta, não filtra e não divide nada.
 *
 * DUAS ARMADILHAS DO TEMPLATE, PRESERVADAS AQUI
 * • Squad é PERCENTUAL, status é CONTAGEM. Não é inconsistência: o gráfico de
 *   squad mostra a fatia de cada uma sobre o total; o de status mostra quantos
 *   incidentes há em cada estado. Trocar um pelo outro é o bug de ago/2026.
 * • Tabela vazia mostra uma linha com "—", nunca some. Box vazio no slide
 *   parece erro de geração.
 */

import React from 'react'
import { SlideConteudo, cont } from './chrome'

const NAVY = '#203864'

/** Barras horizontais — usado no percentual por squad. */
function BarrasH({ itens, sufixo = '%' }) {
  const maior = Math.max(...itens.map(i => i[1]), 1)
  return (
    <div className="hb">
      {itens.map(([rotulo, valor], i) => (
        <div className="hbr" key={i}>
          <span className="hbl" title={rotulo}>{rotulo}</span>
          <span className="hbt"><span className="hbf" style={{ width: `${(valor / maior) * 100}%`, background: NAVY }} /></span>
          <span className="hbv">{valor}{sufixo}</span>
        </div>
      ))}
    </div>
  )
}

/** Barras verticais — usado na distribuição por status (contagem). */
function BarrasV({ itens }) {
  const maior = Math.max(...itens.map(i => i[1]), 1)
  return (
    <div className="vb">
      {itens.map(([rotulo, valor, cor], i) => (
        <div className="vbc" key={i}>
          <span className="vbv">{valor}</span>
          <span className="vbb" style={{ height: `${Math.max(4, (valor / maior) * 100)}%`, background: cor || '#0070C0' }} />
          <span className="vbl">{rotulo}</span>
        </div>
      ))}
    </div>
  )
}

const COLUNAS_INC = ['INC', 'Squad', 'Título', 'Status', 'Target', 'Criação']

function Tabela({ titulo, classe, linhas }) {
  return (
    <div className="cd">
      <div className={`cdh ${classe}`}>{titulo}</div>
      <table className="tb">
        <tbody>
          <tr>{COLUNAS_INC.map(c => <th key={c}>{c}</th>)}</tr>
          {linhas?.length
            ? linhas.map((l, i) => (
                <tr key={i}>{COLUNAS_INC.map((_, j) => <td key={j}>{l[j] ?? ''}</td>)}</tr>
              ))
            // Box vazio parece erro de geração. Uma linha com "—" diz "não há".
            : <tr><td colSpan={COLUNAS_INC.length} className="vazio">—</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/** Slide 1: KPIs, identificação, dois gráficos e as duas tabelas. */
export function IncidentesDashboard({ analise, atrasado, aguardando, cont: c, carimbo }) {
  const k = analise?.kpis || {}
  const id = analise?.identificacao || {}
  return (
    <SlideConteudo titulo={`Dashboard Executivo Incidentes${cont(c)}`} classificacao="PÚBLICO" carimbo={carimbo}>
      <div className="toprow">
        <div className="kpis">
          <div className="kp" style={{ '--kc': '#0A53AA' }}><div className="kn">{k.total ?? 0}</div><div className="kl">Total Incidentes</div></div>
          <div className="kp" style={{ '--kc': '#00B050' }}><div className="kn">{k.concluido ?? 0}</div><div className="kl">Concluído</div><div className="ks">{k.concluidoPct || ''}</div></div>
          <div className="kp" style={{ '--kc': '#FFC000' }}><div className="kn">{k.andamento ?? 0}</div><div className="kl">Andamento</div><div className="ks">{k.andamentoPct || ''}</div></div>
          <div className="kp" style={{ '--kc': '#C00000' }}><div className="kn">{k.atrasado ?? 0}</div><div className="kl">Atrasado</div><div className="ks">{k.atrasadoPct || ''}</div></div>
        </div>
        <div className="ident wide">
          <div><b>Área Executora:</b> {id.areaExecutora || ''}</div>
          <div><b>Diretor:</b> {id.diretor || ''}</div>
          <div><b>Produto:</b> {id.produto || ''}</div>
          <div><b>Tecnologia:</b> {id.tecnologia || ''}</div>
        </div>
      </div>

      <div className="grid-inc">
        <div className="cd">
          <div className="cdh lt">PERCENTUAL DE INCIDENTES POR SQUAD</div>
          <BarrasH itens={analise?.porSquad || []} />
        </div>
        <div className="cd">
          <div className="cdh lt">DISTRIBUIÇÃO POR STATUS</div>
          <BarrasV itens={analise?.porStatus || []} />
        </div>
        <Tabela titulo="TARGET ATRASADO" classe="red2" linhas={atrasado} />
        <Tabela titulo="AGUARDANDO HOMOLOGAÇÃO E PRODUÇÃO" classe="yel" linhas={aguardando} />
      </div>
    </SlideConteudo>
  )
}

/** Slide 2: backlog completo, na ordem original da exportação. */
export function IncidentesBacklog({ analise, linhas, totalRegistros, cont: c, carimbo }) {
  return (
    <SlideConteudo titulo={`Backlog dos Incidentes${cont(c)}`} classificacao="PÚBLICO" carimbo={carimbo}>
      <div className="strip">BACKLOG DOS INCIDENTES — {totalRegistros ?? (analise?.backlogRows || []).length} registros</div>
      <table className="tb big cen">
        <tbody>
          <tr>{COLUNAS_INC.map(c2 => <th key={c2}>{c2}</th>)}</tr>
          {(linhas || []).map((l, i) => (
            <tr key={i}>{COLUNAS_INC.map((_, j) => <td key={j}>{l[j] ?? ''}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </SlideConteudo>
  )
}

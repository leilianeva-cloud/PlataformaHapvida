/**
 * reuniao/ApresentarScreen.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modo apresentação e exportação em PDF.
 *
 * ═══ POR QUE NÃO É SÓ "UM PPT DENTRO DO BROWSER" ═══
 * Se apresentar aqui for só empatar com o PowerPoint, o time volta para o
 * PowerPoint na segunda reunião. O que esta tela tem a mais é navegação: lista
 * lateral com salto direto para qualquer projeto (tecla M) e zoom de verdade
 * (+ − 0), para quando alguém pede "aumenta esse Gantt aí".
 *
 * ═══ O PDF ═══
 * Não é conversão nem biblioteca: é a impressão do próprio HTML. O `@page` em
 * slides.css define a página com exatamente 960×540px (10″ × 5,625″), então
 * uma página do PDF é um slide — sem faixa branca e sem corte.
 *
 * Os slides da impressão vão num container à parte (#reuniao-print), e o CSS de
 * impressão esconde todo o resto. Reaproveitar os slides da tela não funcionaria:
 * eles estão dentro de um contêiner com transform: scale().
 *
 * ⚠️ O CONTAINER PRECISA SER FILHO DIRETO DO <body> — POR ISSO O PORTAL.
 * A regra é `body > *:not(#reuniao-print){display:none}`. Renderizado no lugar
 * normal, o container nasce dentro do #root; o #root é escondido pela regra e
 * leva o container junto. Resultado: PDF com todas as páginas em branco. Foi
 * exatamente o que aconteceu. O portal tira ele do #root e resolve.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Slide from './blocos/Slide'

const LARGURA = 960
const ALTURA = 540

export default function ApresentarScreen({ paginas, carimbo, urlImportado, onSair, onExportou }) {
  const [idx, setIdx] = useState(0)
  const [zoom, setZoom] = useState(null)      // null = ajustar à tela
  const [menu, setMenu] = useState(false)
  const [imprimindo, setImprimindo] = useState(false)
  const escala = useRef(1)

  const total = paginas.length
  const ir = useCallback((i) => setIdx(Math.max(0, Math.min(i, total - 1))), [total])

  // Ajuste automático: o slide inteiro visível, com folga para a barra.
  const [ajuste, setAjuste] = useState(1)
  useEffect(() => {
    const calcular = () => setAjuste(Math.min((innerWidth - 52) / LARGURA, (innerHeight - 102) / ALTURA))
    calcular()
    addEventListener('resize', calcular)
    return () => removeEventListener('resize', calcular)
  }, [])
  escala.current = zoom || ajuste

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); ir(idx + 1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); ir(idx - 1) }
      else if (e.key === 'Home') ir(0)
      else if (e.key === 'End') ir(total - 1)
      else if (e.key === 'Escape') { if (menu) setMenu(false); else onSair?.() }
      else if (e.key === '+' || e.key === '=') setZoom(escala.current + 0.15)
      else if (e.key === '-' || e.key === '_') setZoom(Math.max(0.3, escala.current - 0.15))
      else if (e.key === '0') setZoom(null)
      else if (e.key.toLowerCase() === 'm') setMenu(m => !m)
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [idx, total, menu, ir, onSair])

  /**
   * Monta os slides no container de impressão e chama print().
   * O React precisa ter pintado antes — daí o duplo requestAnimationFrame.
   * `onafterprint` devolve a tela ao normal tanto se imprimir quanto se cancelar.
   */
  const exportar = useCallback(() => {
    setImprimindo(true)
    const fim = () => { setImprimindo(false); removeEventListener('afterprint', fim) }
    addEventListener('afterprint', fim)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { print() } finally { onExportou?.(total) }
    }))
  }, [total, onExportou])

  const atual = paginas[idx]
  const k = escala.current

  return (
    <>
      <div className="reu-apresentar">
        <div className={`pjump${menu ? ' on' : ''}`}>
          {paginas.map((p, j) => (
            <button key={p.chave} className={j === idx ? 'cur' : ''}
                    onClick={() => { ir(j); setMenu(false) }}>
              {j + 1}. {p.nomeBloco}{p.tot > 1 ? ` (${p.pg}/${p.tot})` : ''}
            </button>
          ))}
        </div>

        <div id="pwrap">
          <div id="pslot" style={{ width: LARGURA * k, height: ALTURA * k }}>
            <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', flex: '0 0 auto' }}>
              {atual && <Slide pagina={atual} carimbo={carimbo} urlImportado={urlImportado} />}
            </div>
          </div>
        </div>
      </div>

      <div className="pnav">
        <button onClick={() => setMenu(m => !m)} title="Lista de slides (M)">☰</button>
        <span className="sep" />
        <button onClick={() => ir(idx - 1)} disabled={idx === 0} title="Anterior (←)">‹</button>
        <span className="pos">{idx + 1} / {total}</span>
        <button onClick={() => ir(idx + 1)} disabled={idx === total - 1} title="Próximo (→)">›</button>
        <span className="sep" />
        <button onClick={() => setZoom(Math.max(0.3, k - 0.15))} title="Diminuir (−)">−</button>
        <span className="zl">{Math.round(k * 100)}%</span>
        <button onClick={() => setZoom(k + 0.15)} title="Aumentar (+)">+</button>
        <button onClick={() => setZoom(null)} title="Ajustar à tela (0)">Ajustar</button>
        <span className="sep" />
        <button className="pdf" onClick={exportar} title="Exportar PDF">⇩ PDF</button>
        <button className="sai" onClick={onSair} title="Sair (Esc)">✕</button>
      </div>

      {/* Só existe no DOM durante a impressão, e por portal — ver nota no topo. */}
      {imprimindo && createPortal(
        <div id="reuniao-print">
          {paginas.map(p => (
            <Slide key={p.chave} pagina={p} carimbo={carimbo} urlImportado={urlImportado} />
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

/**
 * Exportação em PDF sem entrar no modo apresentação — usada pelo botão da tela
 * de montagem. Mesmo caminho de renderização, só sem a navegação em volta.
 */
export function PrintOnly({ paginas, carimbo, urlImportado, aberto }) {
  if (!aberto) return null
  return createPortal(
    <div id="reuniao-print">
      {paginas.map(p => (
        <Slide key={p.chave} pagina={p} carimbo={carimbo} urlImportado={urlImportado} />
      ))}
    </div>,
    document.body
  )
}

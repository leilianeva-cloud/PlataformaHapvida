/**
 * reuniao/blocos/BlocoTabela.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Slide de tabela livre. Serve para Pontos de Atenção, Encaminhamentos, riscos,
 * decisões — qualquer conteúdo que não vem de sistema.
 *
 * É o bloco que substitui o antigo "Encaminhamentos" do deck consolidado, que
 * era feito à mão no PowerPoint e colado como slide 2. Aqui ele é editável na
 * hora, na própria reunião, em vez de virar imagem.
 *
 * EDIÇÃO NO PRÓPRIO SLIDE
 * As células são `contentEditable` quando `editavel` é true — só na tela de
 * montagem. Na apresentação e no PDF o slide é inerte, e célula vazia sai
 * vazia em vez de mostrar o "inserir".
 *
 * POR QUE contentEditable E NÃO <input>
 * A célula precisa crescer com o texto e respeitar a tipografia do slide. Com
 * input seria preciso medir e sincronizar altura a cada tecla; o resultado
 * ficaria diferente do que sai no PDF.
 */

import React, { useCallback } from 'react'
import { SlideConteudo } from './chrome'

export function BlocoTabela({ titulo, colunas, linhas, carimbo, editavel = false, onMudar }) {
  // Escreve direto no modelo. O debounce de gravação é da tela — aqui o
  // teclado precisa responder na hora.
  const editar = useCallback((tipo, i, j) => (ev) => {
    if (!onMudar) return
    onMudar(tipo, i, j, ev.currentTarget.textContent)
  }, [onMudar])

  const props = (valor) => editavel ? {
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    // Enter confirma em vez de criar <div> dentro da célula.
    onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } },
  } : {}

  const vazio = (v) => !String(v || '').trim()
  const mostrar = (v) => (vazio(v) ? (editavel ? 'inserir' : '') : v)

  return (
    <SlideConteudo titulo={titulo} carimbo={carimbo}>
      <table className="tb tabl">
        <tbody>
          <tr>
            {colunas.map((c, j) => (
              <th key={j} className={vazio(c) ? 'ph' : ''} {...props(c)} onInput={editar('coluna', j, null)}>
                {mostrar(c)}
              </th>
            ))}
          </tr>
          {linhas.map((linha, i) => (
            <tr key={i}>
              {colunas.map((_, j) => (
                <td key={j} className={vazio(linha[j]) ? 'ph' : ''} {...props(linha[j])} onInput={editar('celula', i, j)}>
                  {mostrar(linha[j])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </SlideConteudo>
  )
}

/**
 * reuniao/blocos/BlocoImportado.jsx  (mesmo arquivo — os dois são curtos)
 * ─────────────────────────────────────────────────────────────────────────────
 * Conteúdo que veio de fora: recorte de tela, imagem ou página de PDF.
 *
 * No roteiro fica gravado o CAMINHO no Storage, nunca a URL: URL assinada
 * expira em uma hora e o roteiro dura semanas. A tela resolve caminho → URL
 * quando vai desenhar.
 */
export function BlocoImportado({ url, nome, carimbo }) {
  return (
    <div className="slide">
      <div className="anx">
        {url
          ? <img src={url} alt={nome || 'Conteúdo importado'} />
          : <div className="ph"><b>{nome || 'Conteúdo importado'}</b>carregando…</div>}
      </div>
      <div className="sband">
        <span className="bstamp">{carimbo}</span>
        <span className="bmark">Portfólio, Projetos e Governança</span>
      </div>
    </div>
  )
}

export default BlocoTabela

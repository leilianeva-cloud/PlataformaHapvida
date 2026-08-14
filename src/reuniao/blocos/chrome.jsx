/**
 * reuniao/blocos/chrome.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * As partes que se repetem em todo slide: moldura, título, logo e rodapé.
 *
 * Tudo aqui é cópia do que está nos templates oficiais. Ver slides.css para as
 * cores e a explicação de por que o layout virou código.
 *
 * ASSETS
 * Os arquivos vão em `public/` e são referenciados por URL — não inline. Isso
 * mantém os componentes legíveis e deixa o browser cachear:
 *   public/hap-logo-cor.svg      wordmark azul + flor  (slides de fundo branco)
 *   public/hap-logo-branco.svg   wordmark branco + flor (capa, divisória, fim)
 *   public/hap-flor.svg          só a flor
 *   public/capa-ras.jpg          foto da capa
 *
 * O logo branco NÃO é o arquivo que veio do template: lá o wordmark é pintado
 * por uma classe de tema do Office que só existe dentro do PowerPoint. Fora
 * dele sairia azul escuro sobre fundo azul. O arquivo entregue já tem o branco
 * fixo, mantendo as cores originais da flor.
 */

import React from 'react'

export const LOGO_COR    = '/hap-logo-cor.svg'
export const LOGO_BRANCO = '/hap-logo-branco.svg'
export const FLOR        = '/hap-flor.svg'
export const FOTO_CAPA   = '/capa-ras.jpg'

/**
 * Faixa inferior azul, presente em todos os slides.
 * O carimbo à esquerda é o antídoto contra o ruído de versão: qualquer cópia
 * antiga se denuncia sozinha. À direita, a marca da área, como no template.
 */
export function Banda({ carimbo, marca = 'Portfólio, Projetos e Governança' }) {
  return (
    <div className="sband">
      <span className="bstamp">{carimbo}</span>
      <span className="bmark">{marca}</span>
    </div>
  )
}

/**
 * Cabeçalho dos slides de conteúdo: classificação, título com a barra laranja
 * e logo no canto.
 *
 * `classificacao` acompanha o template de origem — o RAS é INTERNO, o de
 * Incidentes é PÚBLICO. Não é decoração: é a tarja de classificação da
 * informação, e trocar por conta própria muda o significado do documento.
 */
export function Topo({ titulo, classificacao = 'INTERNO' }) {
  return (
    <>
      <div className="clsf">{classificacao}</div>
      <img className="slogo" src={LOGO_COR} alt="Hapvida" />
      <div className="stitle" title={titulo}>{titulo}</div>
    </>
  )
}

/**
 * Casca de um slide de conteúdo (fundo branco).
 * Todo slide tem exatamente 960×540 — quem escala é o container.
 */
export function SlideConteudo({ titulo, classificacao, carimbo, marca, children }) {
  return (
    <div className="slide">
      <Topo titulo={titulo} classificacao={classificacao} />
      <div className="sbody">{children}</div>
      <Banda carimbo={carimbo} marca={marca} />
    </div>
  )
}

/** Sufixo "(cont. 2/3)". Devolve string vazia quando o bloco cabe em uma página. */
export const cont = (par) => (par ? ` (cont. ${par[0]}/${par[1]})` : '')

/**
 * reuniao/blocos/BlocosEstrutura.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Os slides que não têm origem em sistema nenhum: capa, divisória, encerramento
 * — e os dois estados de falta.
 *
 * São os únicos, junto de Tabela e Importado, que o usuário edita: o texto vem
 * do roteiro, não de dado. Os slides com origem (Projeto, RAS, Incidentes) são
 * somente leitura, porque a reunião tem que ser fiel ao que veio do sistema.
 */

import React from 'react'
import { Banda, FLOR, FOTO_CAPA, LOGO_BRANCO } from './chrome'

/* ═══════════════════════ CAPA ═══════════════════════ */
/* capa_template: foto ocupando 81% da altura, faixa azul embaixo com o título
   à esquerda e o logo branco à direita. */
export function Capa({ titulo, carimbo }) {
  return (
    <div className="slide capa">
      <img className="cphoto" src={FOTO_CAPA} alt="" />
      <div className="cband">
        <div className="ct">{titulo}</div>
        <img className="clogo" src={LOGO_BRANCO} alt="Hapvida" />
      </div>
      <Banda carimbo={carimbo} marca="" />
    </div>
  )
}

/* ═══════════════════════ DIVISÓRIA ═══════════════════════ */
/* Não existe template oficial de divisória — as do deck consolidado eram
   montadas à mão. Esta é derivada do encerramento: mesmo azul, mesma flor.
   Se um dia aparecer um padrão oficial, é trocar aqui e mais nada. */
export function Divisoria({ titulo, carimbo }) {
  return (
    <div className="slide divi">
      <img className="dvlogo" src={LOGO_BRANCO} alt="Hapvida" />
      <div className="dvc">
        <img src={FLOR} alt="" width="44" height="44" />
        <h2>{titulo}</h2>
      </div>
      <Banda carimbo={carimbo} marca="" />
    </div>
  )
}

/* ═══════════════════════ ENCERRAMENTO ═══════════════════════ */
export function Encerramento({ carimbo }) {
  return (
    <div className="slide fim">
      <img className="flogo" src={LOGO_BRANCO} alt="Hapvida" />
      <Banda carimbo={carimbo} marca="" />
    </div>
  )
}

/* ═══════════════════════ ESTADOS DE FALTA ═══════════════════════ */
/**
 * Um bloco aponta para algo que não está mais lá.
 *
 * Regra de produto: NUNCA sumir em silêncio. Um slide feio e explicado é muito
 * melhor que um slide que desaparece — a contagem muda, a ordem muda, e você
 * só descobre no meio da reunião. Aqui a falha aparece e diz o que fazer.
 */
export function ProjetoAusente({ nome, projetoId, carimbo }) {
  return (
    <div className="slide">
      <div className="faltando">
        <b>Projeto não encontrado</b>
        <span>
          <b>{nome}</b> (id {projetoId}) não está mais em Atualizar Status, ou a
          leitura falhou. Pode ter sido apagado pelo SM. Remova este bloco do
          roteiro ou peça para o projeto ser recriado.
        </span>
      </div>
      <Banda carimbo={carimbo} marca="" />
    </div>
  )
}

export function InsumoAusente({ qual, carimbo }) {
  return (
    <div className="slide">
      <div className="faltando">
        <b>Análise do {qual} não está na bandeja</b>
        <span>
          Alguém precisa abrir o sistema <b>Atualizar {qual}</b>, importar a
          planilha e clicar em <b>Enviar para a Reunião</b>. Enquanto isso não
          acontecer, este bloco não tem o que mostrar.
        </span>
      </div>
      <Banda carimbo={carimbo} marca="" />
    </div>
  )
}

/**
 * reuniao/ReuniaoScreen.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A tela do módulo: abertura, montagem do roteiro e pré-visualização.
 *
 * ═══ O QUE ESTA TELA NÃO FAZ ═══
 * Não decide quantos slides um bloco vira (isso é do reuniaoModel), não fala
 * com o banco direto (reuniaoStore), não processa imagem (importarConteudo) e
 * não desenha slide (blocos/). Ela controla estado e navegação. Quando bater a
 * vontade de "calcular rapidinho" alguma coisa aqui, é sinal de que a conta
 * está faltando em outro arquivo.
 *
 * ═══ UMA REUNIÃO VIVA POR VEZ ═══
 * Decisão de produto, garantida por CHECK no banco. "Nova reunião" descarta a
 * anterior e apaga os anexos dela — irreversível, com aviso explícito.
 *
 * ═══ NADA DE DIÁLOGO NATIVO ═══
 * `alert`, `confirm` e `prompt` são suprimidos pelo navegador em algumas
 * configurações e falham em silêncio: o `confirm` volta false e a ação é
 * abortada sem explicação. Tudo aqui é modal e aviso da própria tela.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '../AuthContext'
import {
  criarBloco, roteiroPadrao, montarRoteiro, contarPaginas, carimbo as fazerCarimbo,
  hojeBR, ehEditavel, ehUnico, MODELOS_TABELA, MAX_COLUNAS_TABELA, TIPOS,
} from './reuniaoModel'
import {
  carregarRascunho, salvarRascunho, trocarReuniao, listarProjetosDeTodos,
  subirImportado, urlsImportados, limparPasta, auditarPublicacao, auditarExportacao,
} from './reuniaoStore'
import { lerInsumos, idadeTexto, estaVelho } from './reuniaoInsumos'
import { tratarArquivo, tratarColagem, descartar, QUALIDADE, DICA_BAIXA } from './importarConteudo'
import Slide from './blocos/Slide'
import ApresentarScreen, { PrintOnly } from './ApresentarScreen'
import './slides.css'

const novaReuniaoVazia = () => ({
  reuniaoId: `r${Date.now().toString(36)}`,
  titulo: 'RAS — Reunião de Acompanhamento Semanal',
  dataReuniao: hojeBR(),
  versao: 1, publicada: false, alterada: false,
  blocos: roteiroPadrao(), editadoPorNome: '',
})

export default function ReuniaoScreen({ onVoltar }) {
  const { user, profile } = useAuth()
  const usuario = useMemo(() => ({ id: user?.id, nome: profile?.name || profile?.email || '' }), [user, profile])

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tela, setTela] = useState('abrir')        // 'abrir' | 'montar'
  const [reuniao, setReuniao] = useState(null)
  const [pendente, setPendente] = useState(null)   // rascunho salvo, na tela de abertura
  const [sel, setSel] = useState(0)
  const [insumos, setInsumos] = useState({ ras: null, incidentes: null })
  const [urls, setUrls] = useState(new Map())
  const [modal, setModal] = useState(null)
  const [aviso, setAviso] = useState('')
  const [apresentando, setApresentando] = useState(false)
  const [imprimindo, setImprimindo] = useState(false)
  const historico = useRef([])

  /* ── carga inicial ── */
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [r, i] = await Promise.all([carregarRascunho(), lerInsumos()])
        if (!vivo) return
        setPendente(r); setInsumos(i)
      } catch (e) {
        if (vivo) setErro(e.message)
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [])

  /* ── URLs assinadas dos importados (expiram; resolvidas ao abrir) ── */
  useEffect(() => {
    const caminhos = (reuniao?.blocos || []).filter(b => b.tipo === 'importado' && b.caminho).map(b => b.caminho)
    if (!caminhos.length) return
    let vivo = true
    urlsImportados(caminhos).then(m => { if (vivo) setUrls(m) }).catch(e => console.warn(e.message))
    return () => { vivo = false }
  }, [reuniao?.blocos])

  /* ── autosave com debounce ── */
  const salvarT = useRef(null)
  const agendarSalvar = useCallback((r) => {
    clearTimeout(salvarT.current)
    salvarT.current = setTimeout(() => {
      salvarRascunho(r, usuario).catch(e => mostrar(`Não consegui salvar: ${e.message}`))
    }, 800)
  }, [usuario])

  const mostrar = (msg) => { setAviso(msg); setTimeout(() => setAviso(''), 4200) }

  /* ── mutação do roteiro (ponto único: histórico + alterada + autosave) ── */
  const mudar = useCallback((novosBlocos, novoSel) => {
    setReuniao(r => {
      if (!r) return r
      historico.current.push({ blocos: r.blocos, titulo: r.titulo, sel })
      if (historico.current.length > 40) historico.current.shift()
      const nova = { ...r, blocos: novosBlocos, alterada: r.publicada ? true : r.alterada }
      agendarSalvar(nova)
      return nova
    })
    if (novoSel != null) setSel(novoSel)
  }, [sel, agendarSalvar])

  const desfazer = () => {
    const h = historico.current.pop()
    if (!h) return mostrar('Nada para desfazer.')
    setReuniao(r => { const nova = { ...r, blocos: h.blocos, titulo: h.titulo }; agendarSalvar(nova); return nova })
    setSel(Math.min(h.sel, h.blocos.length - 1))
    mostrar('Desfeito.')
  }

  useEffect(() => {
    const tecla = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && tela === 'montar' && !modal && !apresentando) {
        if (e.target?.isContentEditable) return   // dentro da célula, o Ctrl+Z é do texto
        e.preventDefault(); desfazer()
      }
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })

  /* ── roteiro em páginas ── */
  const [projetosMap, setProjetosMap] = useState(new Map())
  const ctx = useMemo(() => ({ projetos: projetosMap, insumos }), [projetosMap, insumos])
  const paginas = useMemo(() => reuniao ? montarRoteiro(reuniao.blocos, ctx) : [], [reuniao, ctx])
  const carimbo = reuniao ? fazerCarimbo(reuniao) : ''
  const urlDe = useCallback((c) => urls.get(c), [urls])

  /* ── abertura ── */
  const retomar = () => { setReuniao(pendente); setSel(0); setTela('montar') }
  const criarNova = () => {
    if (!pendente) return fazerNova()
    setModal({
      tipo: 'confirmar', perigo: true, titulo: 'Excluir a reunião atual e começar outra?',
      ok: 'Excluir permanentemente', onOk: fazerNova,
      corpo: (
        <>
          <div className="perigo"><b>Esta ação é permanente e não pode ser desfeita.</b> Nem pelo Ctrl+Z.</div>
          Será excluída a reunião <b>{pendente.titulo}</b>:
          <ul className="lst">
            <li>{pendente.blocos.length} blocos</li>
            <li>{pendente.blocos.filter(b => b.tipo === 'importado').length} conteúdo(s) importado(s) — os arquivos são apagados</li>
            <li>{pendente.publicada ? `publicada v${pendente.versao}` : 'rascunho'} · última edição por {pendente.editadoPorNome}</li>
          </ul>
          Só existe <b>uma reunião viva por vez</b>. Para guardar esta, cancele e use <b>Baixar roteiro</b>.
        </>
      ),
    })
  }
  const fazerNova = async () => {
    const nova = novaReuniaoVazia()
    try {
      await trocarReuniao(pendente, nova, usuario)
      setPendente(nova); setReuniao(nova); setSel(0); setTela('montar')
      mostrar('Reunião nova criada. A anterior foi descartada.')
    } catch (e) { mostrar(`Não consegui criar: ${e.message}`) }
  }

  /* ── adicionar blocos ── */
  const inserir = (...novos) => {
    const base = novos.some(b => ehUnico(b.tipo))
      ? reuniao.blocos.filter(b => !novos.some(n => n.tipo === b.tipo && ehUnico(b.tipo)))
      : reuniao.blocos
    const i = Math.min(sel, base.length - 1)
    const out = base.slice()
    out.splice(i + 1, 0, ...novos)
    mudar(out, i + novos.length)
  }

  const abrirProjetos = async () => {
    setModal({ tipo: 'projetos', carregando: true, porSM: [], smAtivo: null, marcados: [] })
    try {
      const { porSM, semNomes } = await listarProjetosDeTodos()
      setModal(m => ({ ...m, carregando: false, porSM, semNomes, smAtivo: porSM[0]?.userId ?? null }))
    } catch (e) {
      setModal(null); mostrar(`Não consegui ler os projetos: ${e.message}`)
    }
  }
  const confirmarProjetos = () => {
    const escolhidos = modal.porSM.flatMap(g => g.projetos).filter(p => modal.marcados.includes(p.projectId))
    setProjetosMap(m => { const n = new Map(m); escolhidos.forEach(p => n.set(p.projectId, p.dados)); return n })
    inserir(...escolhidos.map(p => criarBloco('projeto', {
      projetoId: p.projectId, nome: p.nome, smNome: p.smNome,
      atualizadoEm: p.atualizado ? new Date(p.atualizado).toLocaleDateString('pt-BR') : '',
    })))
    setModal(null)
  }

  const abrirInsumo = (tipo) => setModal({ tipo: 'insumo', qual: tipo })
  const inserirInsumo = (tipo) => {
    const i = insumos[tipo]
    if (!i) return mostrar('Nada na bandeja para inserir.')
    inserir(criarBloco(tipo, {
      nome: tipo === 'ras' ? 'Dashboard Executivo' : 'Dashboard de Incidentes',
      enviadoPor: i.enviadoPorNome, enviadoEm: i.enviadoEm,
    }))
    setModal(null)
  }

  const abrirImportar = () => setModal({ tipo: 'importar', itens: [], ocupado: false })

  const receberArquivos = async (arquivos) => {
    setModal(m => ({ ...m, ocupado: true }))
    try {
      const novos = []
      for (const f of arquivos) novos.push(...await tratarArquivo(f))
      setModal(m => ({ ...m, ocupado: false, itens: [...(m.itens || []), ...novos] }))
    } catch (e) {
      setModal(m => ({ ...m, ocupado: false })); mostrar(e.message)
    }
  }

  const confirmarImportar = async () => {
    setModal(m => ({ ...m, ocupado: true }))
    try {
      const blocos = []
      for (const it of modal.itens) {
        const caminho = await subirImportado(reuniao.reuniaoId, it.blob, it.nome)
        blocos.push(criarBloco('importado', {
          nome: it.nome, caminho, largura: it.largura, altura: it.altura, origem: it.origem,
        }))
      }
      descartar(modal.itens)
      setModal(null)
      inserir(...blocos)
      mostrar(blocos.length > 1 ? `${blocos.length} slides importados.` : 'Conteúdo importado.')
    } catch (e) {
      setModal(m => ({ ...m, ocupado: false })); mostrar(`Falha ao subir: ${e.message}`)
    }
  }

  // Ctrl+V só faz sentido com o modal de importação aberto.
  useEffect(() => {
    if (modal?.tipo !== 'importar') return
    const colar = async (e) => {
      const itens = await tratarColagem(e)
      if (!itens.length) return
      e.preventDefault()
      setModal(m => ({ ...m, itens: [...(m.itens || []), ...itens] }))
    }
    addEventListener('paste', colar)
    return () => removeEventListener('paste', colar)
  }, [modal?.tipo])

  /* ── operações de bloco ── */
  const remover = (i) => {
    const nome = reuniao.blocos[i].nome
    mudar(reuniao.blocos.filter((_, k) => k !== i), Math.max(0, Math.min(sel, reuniao.blocos.length - 2)))
    mostrar(`"${nome}" removido — Ctrl+Z desfaz.`)
  }
  const mover = (i, d) => {
    const j = i + d
    if (j < 0 || j >= reuniao.blocos.length) return
    const out = reuniao.blocos.slice()
    const [b] = out.splice(i, 1); out.splice(j, 0, b)
    mudar(out, j)
  }
  const [arrastando, setArrastando] = useState(null)
  const soltar = (destino) => {
    if (arrastando == null || arrastando === destino) return
    const out = reuniao.blocos.slice()
    const [b] = out.splice(arrastando, 1); out.splice(destino, 0, b)
    mudar(out, destino); setArrastando(null)
  }

  const mudarTabela = (blocoId, tipo, i, j, valor) => {
    setReuniao(r => {
      const blocos = r.blocos.map(b => {
        if (b.id !== blocoId) return b
        if (tipo === 'coluna') { const c = b.colunas.slice(); c[i] = valor; return { ...b, colunas: c } }
        const linhas = b.linhas.map((l, k) => (k === i ? Object.assign(l.slice(), { [j]: valor }) : l))
        return { ...b, linhas }
      })
      const nova = { ...r, blocos, alterada: r.publicada ? true : r.alterada }
      agendarSalvar(nova)
      return nova
    })
  }
  const opTabela = (acao) => {
    const b = reuniao.blocos[sel]
    if (!b || b.tipo !== 'tabela') return
    let { colunas, linhas } = { colunas: b.colunas.slice(), linhas: b.linhas.map(l => l.slice()) }
    if (acao === '+linha') linhas.push(colunas.map(() => ''))
    if (acao === '-linha') { if (linhas.length <= 1) return mostrar('A tabela precisa de pelo menos uma linha.'); linhas.pop() }
    if (acao === '+coluna') {
      if (colunas.length >= MAX_COLUNAS_TABELA) return mostrar(`Máximo de ${MAX_COLUNAS_TABELA} colunas.`)
      colunas.push(''); linhas = linhas.map(l => [...l, ''])
    }
    if (acao === '-coluna') {
      if (colunas.length <= 1) return mostrar('A tabela precisa de pelo menos uma coluna.')
      colunas.pop(); linhas = linhas.map(l => l.slice(0, -1))
    }
    mudar(reuniao.blocos.map((x, k) => (k === sel ? { ...x, colunas, linhas } : x)))
  }

  /* ── publicar / exportar / roteiro portátil ── */
  const publicar = () => {
    setReuniao(r => {
      const nova = r.publicada && !r.alterada
        ? { ...r, publicada: false, alterada: false }
        : { ...r, publicada: true, alterada: false, versao: r.publicada && r.alterada ? r.versao + 1 : r.versao, editadoPorNome: usuario.nome }
      agendarSalvar(nova)
      if (nova.publicada) auditarPublicacao(nova, paginas.length).catch(() => {})
      return nova
    })
  }

  const exportarPdf = () => {
    setImprimindo(true)
    const fim = () => { setImprimindo(false); removeEventListener('afterprint', fim) }
    addEventListener('afterprint', fim)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      print(); auditarExportacao(reuniao, paginas.length).catch(() => {})
    }))
  }

  const baixarRoteiro = () => {
    const copia = { ...reuniao, blocos: reuniao.blocos }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 1)], { type: 'application/json' }))
    a.download = `reuniao_${reuniao.dataReuniao.replace(/\//g, '-')}.reuniao`
    a.click()
    mostrar('Roteiro baixado. Os conteúdos importados ficam no Storage, não no arquivo.')
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */

  if (carregando) return <div className="reu-carregando">Carregando reunião…</div>
  if (erro) return (
    <div className="reu-erro">
      <b>Não consegui abrir a Reunião</b>
      <p>{erro}</p>
      <button className="btn2" onClick={onVoltar}>Voltar ao início</button>
    </div>
  )

  if (apresentando) return (
    <ApresentarScreen paginas={paginas} carimbo={carimbo} urlImportado={urlDe}
                      onSair={() => setApresentando(false)}
                      onExportou={(n) => auditarExportacao(reuniao, n).catch(() => {})} />
  )

  /* ── tela de abertura ── */
  if (tela === 'abrir' || !reuniao) return (
    <div className="reu-page">
      <div className="reu-top">
        <b>Reunião</b>
        <span className="spacer" />
        <button className="btn2" onClick={onVoltar}>Voltar ao início</button>
      </div>
      <h2>Reunião</h2>
      <div className="sub">Uma reunião viva por vez. A nova substitui a anterior.</div>
      <div className="open-grid">
        <button className={`op${pendente ? '' : ' dis'}`} disabled={!pendente} onClick={retomar}>
          <b>{pendente ? 'Retomar reunião' : 'Nenhuma reunião em andamento'}</b>
          {pendente && (
            <span>{pendente.titulo}<br />{pendente.blocos.length} blocos ·{' '}
              {pendente.publicada ? (pendente.alterada ? `alterada após v${pendente.versao}` : `publicada v${pendente.versao}`) : 'rascunho'}
            </span>
          )}
          {pendente && <span className="tagl">editado por {pendente.editadoPorNome || '—'}</span>}
        </button>
        <button className="op" onClick={criarNova}>
          <b>Nova reunião</b>
          <span>Começa do zero com a estrutura padrão: capa, divisórias e encerramento.
            {pendente && ' Descarta a reunião atual e apaga os conteúdos importados dela.'}</span>
          <span className="tagl">estrutura padrão</span>
        </button>
      </div>
      {aviso && <div className="reu-toast">{aviso}</div>}
      {modal && <Modal modal={modal} setModal={setModal} />}
    </div>
  )

  /* ── tela de montagem ── */
  const blocoSel = reuniao.blocos[sel]
  const paginasDoSel = blocoSel ? paginas.filter(p => p.blocoIndex === sel) : []

  return (
    <div className="reu-wrap">
      <div className="reu-top">
        <b title={reuniao.titulo}>{reuniao.titulo}</b>
        <span className={`pill ${reuniao.publicada ? (reuniao.alterada ? 'alt' : 'pub') : 'rasc'}`}>
          {reuniao.publicada ? (reuniao.alterada ? `Alterada após v${reuniao.versao}` : `Publicada · v${reuniao.versao}`) : 'Rascunho'}
        </span>
        <span className="spacer" />
        <button className="btn2" onClick={desfazer} title="Ctrl+Z">↶ Desfazer</button>
        <button className="btn2" onClick={() => setModal({ tipo: 'reuniao', titulo: reuniao.titulo, data: reuniao.dataReuniao })}>Editar reunião</button>
        <button className="btn2" onClick={() => setTela('abrir')}>Reuniões</button>
        <button className="btn2" onClick={baixarRoteiro}>Baixar roteiro</button>
        <button className="btn2" onClick={publicar}>
          {reuniao.publicada ? (reuniao.alterada ? `Publicar v${reuniao.versao + 1}` : 'Reabrir') : 'Publicar'}
        </button>
        <button className="btn2" onClick={() => setApresentando(true)}>Apresentar</button>
        <button className="btn2 pri" onClick={exportarPdf}>Exportar PDF</button>
      </div>

      <div className="reu-corpo">
        <aside className="rail">
          <div className="rail-h"><b>Roteiro</b><span>{reuniao.blocos.length} blocos · {paginas.length} slides</span></div>
          <div className="list">
            {reuniao.blocos.map((b, i) => {
              const n = contarPaginas(b, ctx)
              const tag = TIPOS[b.tipo]?.tag
              return (
                <div key={b.id} className={`item${i === sel ? ' sel' : ''}`} draggable
                     onDragStart={() => setArrastando(i)}
                     onDragOver={(e) => e.preventDefault()}
                     onDrop={() => soltar(i)}
                     onClick={() => setSel(i)}>
                  <span className="grip">⣿</span>
                  <span className="txt">
                    <span className="nm">{b.nome}</span>
                    <span className="sb">
                      <span className={`tag ${tag ? 't-' + b.tipo : 't-est'}`}>{tag || 'Estrutura'}</span>
                      {n} slide{n > 1 ? 's' : ''}
                      {b.smNome ? ` · ${b.smNome}` : ''}
                      {b.enviadoPor ? ` · ${b.enviadoPor}` : ''}
                    </span>
                  </span>
                  <span className="mvs">
                    <button className="mv" disabled={i === 0} onClick={(e) => { e.stopPropagation(); mover(i, -1) }} title="Subir">▲</button>
                    <button className="mv" disabled={i === reuniao.blocos.length - 1} onClick={(e) => { e.stopPropagation(); mover(i, 1) }} title="Descer">▼</button>
                  </span>
                  {ehEditavel(b.tipo) && (
                    <button className="x" title="Renomear"
                            onClick={(e) => { e.stopPropagation(); setModal({ tipo: 'renomear', indice: i, valor: b.tipo === 'capa' ? b.titulo : b.nome }) }}>✎</button>
                  )}
                  <button className="x" title="Remover" onClick={(e) => { e.stopPropagation(); remover(i) }}>×</button>
                </div>
              )
            })}
          </div>
          <div className="add">
            <button onClick={abrirProjetos}>+ Projetos</button>
            <button onClick={() => abrirInsumo('ras')}>+ RAS</button>
            <button onClick={() => abrirInsumo('incidentes')}>+ Incidentes</button>
            <button onClick={() => setModal({ tipo: 'divisoria', valor: '' })}>+ Divisória</button>
            <button onClick={() => setModal({ tipo: 'tabela', valor: '' })}>+ Tabela</button>
            <button onClick={abrirImportar}>+ Importar conteúdo</button>
          </div>
        </aside>

        <main className="stage">
          {paginasDoSel.length === 0 && <div className="empty">Roteiro vazio. Use os botões à esquerda.</div>}
          {paginasDoSel.map((p, i) => (
            <React.Fragment key={p.chave}>
              <div className="pagelab">
                {blocoSel.nome}{paginasDoSel.length > 1 ? ` — página ${i + 1} de ${paginasDoSel.length}` : ''}
              </div>
              <Slide pagina={p} carimbo={carimbo} urlImportado={urlDe}
                     editavel={blocoSel.tipo === 'tabela'} onMudarTabela={mudarTabela} />
            </React.Fragment>
          ))}
          {blocoSel?.tipo === 'tabela' && (
            <div className="tblbar">
              <button onClick={() => opTabela('+linha')}>+ Linha</button>
              <button onClick={() => opTabela('-linha')}>− Linha</button>
              <span className="sepb" />
              <button onClick={() => opTabela('+coluna')}>+ Coluna</button>
              <button onClick={() => opTabela('-coluna')}>− Coluna</button>
              <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Clique em qualquer célula para escrever</span>
            </div>
          )}
        </main>
      </div>

      {aviso && <div className="reu-toast">{aviso}</div>}
      <PrintOnly aberto={imprimindo} paginas={paginas} carimbo={carimbo} urlImportado={urlDe} />

      {modal && (
        <Modal modal={modal} setModal={setModal}
               insumos={insumos} reuniao={reuniao}
               onRenomear={(i, v) => { const b = reuniao.blocos[i]
                 mudar(reuniao.blocos.map((x, k) => k === i ? (b.tipo === 'capa' ? { ...x, titulo: v } : { ...x, nome: v }) : x)) }}
               onDivisoria={(v) => inserir(criarBloco('divisoria', { nome: v }))}
               onTabela={(nome, colunas) => inserir(criarBloco('tabela', { nome, colunas }))}
               onReuniao={(t, d) => setReuniao(r => { const nova = { ...r, titulo: t, dataReuniao: d || r.dataReuniao }; agendarSalvar(nova); return nova })}
               onProjetos={confirmarProjetos}
               onInsumo={inserirInsumo}
               onArquivos={receberArquivos}
               onImportar={confirmarImportar} />
      )}
    </div>
  )
}

/* ═══════════════════════ MODAIS ═══════════════════════ */

function Modal({ modal: m, setModal, insumos, onRenomear, onDivisoria, onTabela, onReuniao,
                 onProjetos, onInsumo, onArquivos, onImportar }) {
  const [v, setV] = useState(m.valor ?? '')
  const [t2, setT2] = useState(m.titulo ?? '')
  const [d2, setD2] = useState(m.data ?? '')
  const fechar = () => setModal(null)

  const rodape = (acao, rotulo, ativo = true, perigo = false) => (
    <div className="mf">
      <button className="btn2" onClick={fechar}>Cancelar</button>
      <button className={`btn2 ${perigo ? 'dang' : 'pri'}`} disabled={!ativo} onClick={acao}>{rotulo}</button>
    </div>
  )

  let conteudo = null

  if (m.tipo === 'confirmar') conteudo = (
    <>
      <div className="mh"><b>{m.titulo}</b></div>
      <div className="mb">{m.corpo}</div>
      {rodape(() => { fechar(); m.onOk?.() }, m.ok || 'Confirmar', true, m.perigo)}
    </>
  )

  if (m.tipo === 'renomear') conteudo = (
    <>
      <div className="mh"><b>Renomear</b></div>
      <div className="mb"><input className="inp" autoFocus value={v} onChange={e => setV(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { onRenomear(m.indice, v.trim()); fechar() } }} /></div>
      {rodape(() => { onRenomear(m.indice, v.trim()); fechar() }, 'Salvar', !!v.trim())}
    </>
  )

  if (m.tipo === 'divisoria') conteudo = (
    <>
      <div className="mh"><b>Nova divisória</b></div>
      <div className="mb">
        <div className="sub">Slide azul de abertura de seção.</div>
        <input className="inp" autoFocus value={v} onChange={e => setV(e.target.value)}
               placeholder="Ex.: Report Executivo dos Projetos" />
        <div className="sug">
          {['Visão Macro dos Projetos', 'Report Executivo de Incidentes', 'Report Executivo dos Projetos']
            .map(s => <button key={s} onClick={() => setV(s)}>{s}</button>)}
        </div>
      </div>
      {rodape(() => { onDivisoria(v.trim()); fechar() }, 'Adicionar', !!v.trim())}
    </>
  )

  if (m.tipo === 'tabela') conteudo = (
    <>
      <div className="mh"><b>Nova tabela</b></div>
      <div className="mb">
        <div className="sub">Serve para Pontos de Atenção, Encaminhamentos, riscos, decisões.</div>
        <input className="inp" autoFocus value={v} onChange={e => setV(e.target.value)} placeholder="Ex.: Pontos de Atenção" />
        <div className="sub" style={{ marginTop: 11 }}>Modelos:</div>
        <div className="sug">
          {MODELOS_TABELA.map(mod => (
            <button key={mod.nome} onClick={() => { onTabela(mod.nome, mod.colunas); fechar() }}>{mod.nome}</button>
          ))}
        </div>
      </div>
      {rodape(() => { onTabela(v.trim(), ['', '', '']); fechar() }, 'Adicionar', !!v.trim())}
    </>
  )

  if (m.tipo === 'reuniao') conteudo = (
    <>
      <div className="mh"><b>Dados da reunião</b></div>
      <div className="mb">
        <div className="fl">Título</div>
        <input className="inp" autoFocus value={t2} onChange={e => setT2(e.target.value)} />
        <div className="fl" style={{ marginTop: 12 }}>Data</div>
        <input className="inp" value={d2} onChange={e => setD2(e.target.value)} placeholder="dd/mm/aaaa" />
        <div className="sub" style={{ marginTop: 10 }}>A data vai no carimbo do rodapé de todos os slides.</div>
      </div>
      {rodape(() => { onReuniao(t2.trim(), d2.trim()); fechar() }, 'Salvar', !!t2.trim())}
    </>
  )

  if (m.tipo === 'projetos') {
    const grupo = m.porSM?.find(g => g.userId === m.smAtivo)
    conteudo = (
      <>
        <div className="mh"><b>Adicionar projetos ao roteiro</b></div>
        <div className="mb">
          {m.carregando ? <div className="sub">Carregando projetos…</div> : (
            <>
              {m.semNomes && <div className="warnbox">Não consegui ler o nome dos SMs — os projetos aparecem sem dono.</div>}
              <div className="pick">
                <div className="sms">
                  {m.porSM.map(g => (
                    <button key={g.userId || 'x'} className={g.userId === m.smAtivo ? 'cur' : ''}
                            onClick={() => setModal(x => ({ ...x, smAtivo: g.userId }))}>
                      {g.smNome || 'Sem dono'}<small>{g.projetos.length} projetos</small>
                    </button>
                  ))}
                </div>
                <div>
                  {(grupo?.projetos || []).map(p => (
                    <label key={p.projectId} className={`pr${m.marcados.includes(p.projectId) ? ' ck' : ''}`}>
                      <input type="checkbox" checked={m.marcados.includes(p.projectId)}
                             onChange={e => setModal(x => ({ ...x,
                               marcados: e.target.checked ? [...x.marcados, p.projectId] : x.marcados.filter(k => k !== p.projectId) }))} />
                      <span><b>{p.nome}</b>
                        <span>{p.atualizado ? `atualizado ${new Date(p.atualizado).toLocaleDateString('pt-BR')}` : ''}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="mf">
          <span style={{ flex: 1, fontSize: 12, color: '#64748b' }}>{m.marcados.length} selecionado(s)</span>
          <button className="btn2" onClick={fechar}>Cancelar</button>
          <button className="btn2 pri" disabled={!m.marcados.length} onClick={onProjetos}>Adicionar</button>
        </div>
      </>
    )
  }

  if (m.tipo === 'insumo') {
    const nome = m.qual === 'ras' ? 'RAS' : 'Incidentes'
    const i = insumos?.[m.qual]
    conteudo = i ? (
      <>
        <div className="mh"><b>Bloco {nome}</b></div>
        <div className="mb">
          <div className={`bandeja${estaVelho(i.enviadoEm) ? ' old' : ''}`}>
            <div className="bh">
              <span className="bt">Na bandeja</span>
              {estaVelho(i.enviadoEm) && <span className="bvelho">enviado {idadeTexto(i.enviadoEm)}</span>}
            </div>
            <div className="bn">{i.arquivo}</div>
            <div className="bm">Enviado por <b>{i.enviadoPorNome}</b> · gera <b>{i.slides} slides</b></div>
            <div className="kk">
              {(i.resumo?.kpis || []).map(([rot, val]) => <div key={rot}><b>{val}</b>{rot}</div>)}
            </div>
            {estaVelho(i.enviadoEm) && (
              <div className="bdica">A análise não se atualiza sozinha. Se a base mudou, reenvie pelo sistema {nome} antes de inserir.</div>
            )}
          </div>
        </div>
        <div className="mf">
          <button className="btn2" onClick={fechar}>Cancelar</button>
          <button className="btn2 pri" onClick={() => onInsumo(m.qual)}>Inserir {i.slides} slides</button>
        </div>
      </>
    ) : (
      <>
        <div className="mh"><b>Bloco {nome}</b></div>
        <div className="mb">
          <div className="vaziob">
            <b>Nada na bandeja</b><br />
            Ninguém enviou a análise do {nome} ainda. A Reunião não importa planilha — ela usa a análise
            gerada pelo sistema <b>Atualizar {nome}</b>, para que o PPTX e o PDF nunca mostrem números diferentes.
          </div>
          <div className="passos">
            <div><span>1</span>Abra o sistema <b>Atualizar {nome}</b></div>
            <div><span>2</span>Importe {m.qual === 'ras' ? 'as duas planilhas' : 'a base do Azure'}</div>
            <div><span>3</span>Clique em <b>Enviar para a Reunião</b></div>
            <div><span>4</span>Volte aqui e use <b>+ {nome}</b></div>
          </div>
        </div>
        <div className="mf"><button className="btn2" onClick={fechar}>Fechar</button></div>
      </>
    )
  }

  if (m.tipo === 'importar') conteudo = (
    <>
      <div className="mh"><b>Importar conteúdo</b></div>
      <div className="mb">
        <label className="drop">
          <b>Cole, arraste ou escolha</b>
          <span>Recorte da tela com <b>Ctrl+V</b> · ou PNG/JPG/PDF</span>
          <input type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
                 onChange={e => { onArquivos([...e.target.files]); e.target.value = '' }} />
        </label>
        {m.ocupado && <div className="sub" style={{ marginTop: 10 }}>Processando…</div>}
        {(m.itens || []).map((it, i) => {
          const q = QUALIDADE[it.qualidade]
          return (
            <div className="ipc" key={i}>
              <img src={it.previa} alt="" />
              <div className="ipi">
                <b>{it.nome}</b>
                <div className="ipm">{it.largura}×{it.altura}px · {it.origem}</div>
                <div className="ipm">{[it.cortou && 'bordas recortadas', it.ampliou && 'ampliada e reforçada'].filter(Boolean).join(' · ') || 'sem ajuste necessário'}</div>
                <span className={`qb ${q.classe}`}>Qualidade {q.rotulo}</span>
                {it.qualidade === 'baixa' && <div className="qdica">{DICA_BAIXA}</div>}
              </div>
              <button className="x" onClick={() => setModal(x => ({ ...x, itens: x.itens.filter((_, k) => k !== i) }))}>×</button>
            </div>
          )
        })}
      </div>
      <div className="mf">
        <span style={{ flex: 1, fontSize: 12, color: '#64748b' }}>{(m.itens || []).length} slide(s)</span>
        <button className="btn2" onClick={() => { descartar(m.itens); fechar() }}>Cancelar</button>
        <button className="btn2 pri" disabled={!(m.itens || []).length || m.ocupado} onClick={onImportar}>Adicionar ao roteiro</button>
      </div>
    </>
  )

  return (
    <div className="mask" onClick={e => { if (e.target.classList.contains('mask')) fechar() }}>
      <div className={`modal${m.tipo === 'projetos' || m.tipo === 'importar' ? '' : ' sm'}`}>{conteudo}</div>
    </div>
  )
}

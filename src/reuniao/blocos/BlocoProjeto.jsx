/**
 * reuniao/blocos/BlocoProjeto.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O slide de Gantt de um projeto, em HTML.
 *
 * ═══ GEOMETRIA: POR QUE ELE PARECE O PPTX ═══
 * O slide do PPTX tem 13,333″ × 7,5″. O slide da Reunião tem 960 × 540 px.
 * A conta fecha em 72 px por polegada — e, por consequência, 1pt de fonte = 1px.
 * Então as coordenadas do gerador OOXML valem aqui SEM conversão: onde o PPTX
 * põe uma caixa em x=4.87, este componente põe em 4.87 * 72 = 350.6px.
 *
 * Isso não é coincidência aproveitada por preguiça — é o que garante que o PDF
 * da reunião e o PPTX avulso mostrem a mesma coisa no mesmo lugar. As constantes
 * abaixo foram copiadas de `gerarSlideXml` no App.jsx.
 *
 * ═══ O QUE VEM DE FORA ═══
 * Todo cálculo é do ganttCore.js — cores, timeline, posição das datas, faixas,
 * legenda, resumo de pacote. Este arquivo só desenha. Se aparecer regra aqui,
 * é bug: a barra vai parar num lugar na tela do Status e em outro no PDF.
 *
 * A quebra em páginas vem do statusPaginacao.js; o componente recebe as
 * `unidades` da SUA página já decididas e não questiona.
 */

import React from 'react'
import {
  STATUS_GERAL, faseCor, faseLabel, statusCor, ddmm,
  calcPacoteInfo, legendaDoProjeto, buildTimeline, dateToFrac,
} from '../../ganttCore'
import { Banda } from './chrome'

/* ═══════════════════════ GEOMETRIA (polegadas → px) ═══════════════════════ */

const IN = 72                       // 960px / 13,333"
const px = (v) => v * IN

const X0 = 4.87, X1 = 13.18         // faixa horizontal do cronograma
const COLS = [                      // [x, largura, rótulo]
  [0.14, 0.67, 'Lecom'],
  [0.81, 2.37, 'Marcos/Demanda'],
  [3.18, 1.00, 'Status'],
  [4.18, 0.69, 'Dt Início'],
]
const HY = 2.34, HH = 0.57          // cabeçalho da grade
const BODY_TOP = 2.91, BODY_BOTTOM = 5.92
const BAR_H = 0.14                  // altura da barra de fase

const fx  = (f) => X0 + f * (X1 - X0)
const cor = (c) => c || '#999999'

/** Versão clara da cor: a parte da barra ainda não executada. */
function clarear(hex, k = 0.55) {
  const h = String(hex).replace('#', '')
  if (h.length !== 6) return '#D9D9D9'
  const n = parseInt(h, 16)
  const m = (v) => Math.round(v + (255 - v) * k)
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`
}

/** Preto ou branco sobre a cor, pelo brilho percebido. */
function textoSobre(hex) {
  const h = String(hex).replace('#', '')
  if (h.length !== 6) return '#1F2937'
  const n = parseInt(h, 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#1F2937' : '#FFFFFF'
}

const caixa = (x, y, w, h, extra = {}) => ({
  position: 'absolute', left: px(x), top: px(y), width: px(w), height: px(h), ...extra,
})

/* ═══════════════════════ BARRAS DE UMA DEMANDA ═══════════════════════ */

function Fases({ raia, cells, topo, altura }) {
  const dX = (d) => { const f = dateToFrac(d, cells); return f == null ? null : fx(f) }

  // Despriorizada: uma barra cinza cobrindo o intervalo, sem fases.
  if (raia.despriorizado) {
    const ini = raia.fases.reduce((a, f) => (f.inicio && (!a || f.inicio < a) ? f.inicio : a), null)
    const fim = raia.fases.reduce((a, f) => (f.fim && f.fim > a ? f.fim : a), '')
    const xa = dX(ini) ?? X0, xb = dX(fim) ?? X1
    if (xb <= xa) return null
    return (
      <div style={caixa(xa, topo + (altura - BAR_H) / 2, xb - xa, BAR_H, {
        background: '#D9D9D9', borderRadius: px(BAR_H) / 2, color: '#64748B',
        fontSize: 7.5, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap',
      })}>Despriorizado</div>
    )
  }

  // Uma fase por faixa, na ordem definida pelo usuário (setas ⬆⬇ no editor).
  const n = Math.max(raia.fases.length, 1)
  const gap = n > 1 ? 0.02 : 0
  const alturaTotal = n * BAR_H + (n - 1) * gap
  const topoFaixas = topo + Math.max(0, (altura - alturaTotal) / 2)

  return raia.fases.map((f, i) => {
    const y = topoFaixas + i * (BAR_H + gap)
    const rawCor = faseCor(f)
    const frac = Math.max(0, Math.min(1, (Number(f.pct) || 0) / 100))

    // ── Sem data ainda: barra cinza no mês vigente ──
    if (f.aDefinir) {
      const hoje = new Date()
      const doMes = cells.filter(c => !c.futuro && c.start instanceof Date
        && c.start.getMonth() === hoje.getMonth() && c.start.getFullYear() === hoje.getFullYear())
      const ref = doMes.length ? doMes : cells.filter(c => !c.futuro).slice(-2)
      const ax = ref.length ? fx(ref[0].f0) : X0 + (X1 - X0) * 0.72
      const aw = ref.length ? Math.max(fx(ref[ref.length - 1].f1) - ax, 0.6) : (X1 - X0) * 0.22
      const rotulo = faseLabel(f) ? `${faseLabel(f)} · A definir` : 'A definir'
      return (
        <div key={i} style={caixa(ax, y, aw, BAR_H, {
          background: '#D9D9D9', borderRadius: px(BAR_H) / 2, color: '#64748B',
          fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center',
          justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
        })}>{rotulo}</div>
      )
    }

    const fimEfetivo = f.fimRepactuado || f.fim

    // ── Entrega: marco em estrela, sem barra e sem % ──
    if (f.fase === 'Entrega') {
      const ex = dX(fimEfetivo)
      if (ex == null) return null
      const s = BAR_H * 1.25
      const texto = f.fimRepactuado ? `${ddmm(f.fim)}→${ddmm(f.fimRepactuado)}` : ddmm(fimEfetivo)
      return (
        <React.Fragment key={i}>
          <div style={caixa(ex - s / 2, y + (BAR_H - s) / 2, s, s, {
            background: cor(rawCor),
            clipPath: 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
          })} />
          <div style={caixa(ex + s / 2 + 0.02, y, 1.6, BAR_H, {
            fontSize: 7, fontWeight: 700, color: '#1F2937',
            display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
          })}>{texto}</div>
        </React.Fragment>
      )
    }

    const xa = dX(f.inicio), xb = dX(fimEfetivo)
    if (xa == null || xb == null) return null

    // Trimestre comprimido é coluna única: a barra ocupa a coluna inteira, senão
    // vira um risco de 2px que não comunica nada.
    const fr0 = dateToFrac(f.inicio, cells), fr1 = dateToFrac(fimEfetivo, cells)
    const cel = (fr) => fr == null ? null : (cells.find(c => fr >= c.f0 && fr < c.f1) || cells[cells.length - 1])
    const c0 = cel(fr0), c1 = cel(fr1)
    const iniComp = !!c0?.futuro, fimComp = !!c1?.futuro

    let barX, barW
    if (iniComp && fimComp && c0 === c1) { barX = fx(c0.f0); barW = fx(c0.f1) - fx(c0.f0) }
    else if (iniComp || fimComp)         { barX = iniComp ? fx(c0.f0) : xa; barW = (fimComp ? fx(c1.f1) : xb) - barX }
    else                                  { barX = xa; barW = Math.max(xb - xa, 0) }

    const xd = barX + barW * frac
    const dataTexto = f.fimRepactuado ? `${ddmm(f.fim)}→${ddmm(f.fimRepactuado)}` : ddmm(fimEfetivo)
    const pctTexto = `${f.pct || 0}%`
    // Calibri bold ≈ 0,5 × tamanho da fonte por caractere (7pt).
    const larg = (t) => t.length * 7 * 0.5 / 72
    const cabe = larg(pctTexto) + larg(dataTexto) + 0.08 < barW

    const xbOriginal = f.fimRepactuado ? dX(f.fim) : null

    return (
      <React.Fragment key={i}>
        <div style={caixa(barX, y, barW, BAR_H, { background: clarear(rawCor), borderRadius: px(BAR_H) / 2 })} />
        {frac > 0.01 && (
          <div style={caixa(barX, y, barW * frac, BAR_H, { background: cor(rawCor), borderRadius: px(BAR_H) / 2 })} />
        )}
        {/* marcador laranja: onde terminava antes da repactuação */}
        {xbOriginal != null && xbOriginal < xb && (
          <div style={caixa(xbOriginal - 0.01, y, 0.02, BAR_H, { background: '#F47B20' })} />
        )}
        {cabe ? (
          <>
            <div style={caixa(barX + 0.03, y, Math.max(0.3, xd - barX), BAR_H, {
              fontSize: 7, fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center',
              color: (barX + 0.03 + larg(pctTexto) / 2) < xd ? textoSobre(rawCor) : '#1F2937',
            })}>{pctTexto}</div>
            <div style={caixa(barX, y, barW, BAR_H, {
              fontSize: 7, fontWeight: 700, whiteSpace: 'nowrap', display: 'flex',
              alignItems: 'center', justifyContent: 'flex-end', paddingRight: px(0.03),
              color: (barX + barW - 0.03 - larg(dataTexto) / 2) < xd ? textoSobre(rawCor) : '#1F2937',
            })}>{dataTexto}</div>
          </>
        ) : (
          <div style={caixa(barX + barW + 0.03, y, 1.4, BAR_H, {
            fontSize: 7, fontWeight: 700, color: '#1F2937', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center',
          })}>{`${pctTexto} ${dataTexto}`}</div>
        )}
      </React.Fragment>
    )
  })
}

/* ═══════════════════════ SLIDE ═══════════════════════ */

export function BlocoProjeto({ dados, unidades, pagina, totalPaginas, carimbo }) {
  const { projeto = {}, raias = [], nFuturos = 1, nPassados = 0 } = dados || {}

  // Mesma origem de tempo do gerador de PPTX: início do trimestre corrente.
  const hoje = new Date()
  const timeline = buildTimeline(hoje.getFullYear(), Math.floor(hoje.getMonth() / 3) * 3 + 1, nFuturos, nPassados)
  const cells = timeline.cells
  const dX = (d) => { const f = dateToFrac(d, cells); return f == null ? null : fx(f) }

  // Legenda é do PROJETO inteiro, não da página — senão cada slide mostra uma.
  const legenda = legendaDoProjeto(raias)

  // Altura das linhas: mesma conta do gerador, para a página encher igual.
  const rowH = Math.min(0.42, (BODY_BOTTOM - BODY_TOP) / Math.max(unidades.length, 7))
  const alturaDe = (u) => {
    if (u.kind === 'pac') return rowH
    if (u.r.despriorizado) return rowH
    const n = Math.max((u.r.fases || []).length, 1)
    if (n <= 1) return rowH
    return Math.max(rowH, n * BAR_H + (n - 1) * 0.02 + 0.06)
  }

  // Faixas de mês do cabeçalho: agrupa quinzenas do mesmo mês.
  const vigentes = cells.filter(c => !c.futuro)
  const meses = []
  vigentes.forEach(c => {
    const ult = meses[meses.length - 1]
    if (ult && ult.label === c.mesLabel) ult.b = c.f1
    else meses.push({ label: c.mesLabel, a: c.f0, b: c.f1 })
  })

  const hojeX = dX(projeto.atualizadoEm)
  const titulo = (projeto.nome || 'Projeto') + (totalPaginas > 1 ? ` (cont. ${pagina}/${totalPaginas})` : '')

  let y = BODY_TOP

  return (
    <div className="slide">
      {/* título */}
      <div style={caixa(0.27, 0.18, 0.09, 0.42, { background: '#F47B20' })} />
      <div style={caixa(0.45, 0.12, 9, 0.55, {
        fontSize: 26, fontWeight: 700, color: '#003B82',
        display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
      })}>{titulo}</div>

      {/* topo: resumo, equipe, status geral */}
      <div style={caixa(0.14, 0.78, 3, 0.26, { fontSize: 13, fontWeight: 700, color: '#003B82' })}>Resumo do Projeto</div>
      <div style={caixa(0.14, 1.06, 6.8, 0.78, { background: '#F2F2F2', border: '1px solid #E2E8F0', borderRadius: 6 })} />
      <div style={caixa(0.26, 1.09, 6.55, 0.72, { fontSize: 8.5, color: '#1E293B', overflow: 'hidden', lineHeight: 1.3 })}>
        <b>Lecom: </b>{projeto.resumoLecom || ''}<br /><b>Descrição: </b>{projeto.resumoDesc || ''}
      </div>

      <div style={caixa(7.01, 0.78, 3, 0.26, { fontSize: 13, fontWeight: 700, color: '#003B82' })}>Equipe do Projeto</div>
      <div style={caixa(7.01, 1.06, 3.5, 0.78, { background: '#F2F2F2', border: '1px solid #E2E8F0', borderRadius: 6 })} />
      <div style={caixa(7.12, 1.09, 1.7, 0.72, { fontSize: 8, color: '#1E293B', lineHeight: 1.5, overflow: 'hidden' })}>
        <b>Área Cliente: </b>{projeto.areaCliente || ''}<br /><b>Diretor: </b>{projeto.dirCliente || ''}<br /><b>Líder: </b>{projeto.lidCliente || ''}
      </div>
      <div style={caixa(8.7, 1.09, 1.75, 0.72, { fontSize: 8, color: '#1E293B', lineHeight: 1.5, overflow: 'hidden' })}>
        <b>Área Executora: </b>{projeto.areaExec || ''}<br /><b>Diretor: </b>{projeto.dirExec || ''}<br /><b>Líder: </b>{projeto.lidExec || ''}
      </div>

      <div style={caixa(10.58, 0.78, 2.6, 0.26, { fontSize: 13, fontWeight: 700, color: '#003B82' })}>Status Geral</div>
      <div style={caixa(10.58, 1.06, 2.59, 0.78, { background: '#F2F2F2', border: '1px solid #E2E8F0', borderRadius: 6 })} />
      {Object.entries(STATUS_GERAL).map(([rotulo, c], i) => (
        <React.Fragment key={rotulo}>
          <div style={caixa(10.72, 1.16 + i * 0.21, 0.14, 0.14, { background: c, borderRadius: '50%' })} />
          <div style={caixa(10.92, 1.13 + i * 0.21, 1.3, 0.2, { fontSize: 9, color: '#334155', display: 'flex', alignItems: 'center' })}>{rotulo}</div>
        </React.Fragment>
      ))}
      <div style={caixa(12.45, 1.2, 0.55, 0.55, {
        background: STATUS_GERAL[projeto.statusGeral] || '#999999', borderRadius: '50%',
      })} />

      {/* cronograma + legenda */}
      <div style={caixa(0.1, 2.0, 3, 0.26, { fontSize: 13, fontWeight: 700, color: '#003B82' })}>Cronograma de Execução</div>
      {(() => {
        const largura = legenda.reduce((s, it) => s + 0.14 + it.label.length * 0.066 + 0.12, 0)
        let lx = Math.max(3.4, Math.min(6.5, X1 - largura))
        return legenda.map((it) => {
          const el = (
            <React.Fragment key={it.label}>
              <div style={caixa(it.estrela ? lx - 0.02 : lx, it.estrela ? 2.03 : 2.07,
                it.estrela ? 0.16 : 0.11, it.estrela ? 0.16 : 0.11, {
                background: it.cor,
                ...(it.estrela ? { clipPath: 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' } : {}),
              })} />
              <div style={caixa(lx + 0.14, 2.0, Math.max(0.4, it.label.length * 0.066 + 0.1), 0.22, {
                fontSize: 7, color: '#334155', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
              })}>{it.label}</div>
            </React.Fragment>
          )
          lx += 0.14 + it.label.length * 0.066 + 0.12
          return el
        })
      })()}

      {/* cabeçalho da grade */}
      {COLS.map(([x, w, rotulo]) => (
        <div key={rotulo} style={caixa(x, HY, w, HH, {
          background: '#2F5597', border: '1px solid #D9D9D9', color: '#fff', fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap',
        })}>{rotulo}</div>
      ))}
      {cells.filter(c => c.futuro).map((c, i) => (
        <div key={`q${i}`} style={caixa(fx(c.f0), HY, fx(c.f1) - fx(c.f0), HH, {
          background: '#2F5597', border: '1px solid #D9D9D9', color: '#fff', fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        })}>{c.label}</div>
      ))}
      {meses.map((m, i) => (
        <div key={`m${i}`} style={caixa(fx(m.a), HY + 0.19, fx(m.b) - fx(m.a), 0.19, {
          background: '#595959', border: '1px solid #D9D9D9', color: '#fff', fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        })}>{m.label}</div>
      ))}
      {vigentes.map((c, i) => (
        <div key={`d${i}`} style={caixa(fx(c.f0), HY + 0.38, fx(c.f1) - fx(c.f0), 0.19, {
          background: '#BFBFBF', border: '1px solid #D9D9D9', color: '#fff', fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        })}>{c.label}</div>
      ))}

      {/* linhas */}
      {unidades.map((u, k) => {
        const h = alturaDe(u)
        const ry = y
        y += h

        if (u.kind === 'pac') {
          const pacRaias = (u.pac.raiaIds || []).map(id => raias.find(r => r.id === id)).filter(Boolean)
          const info = calcPacoteInfo(u.pac, pacRaias)
          const sc = statusCor(info.status)
          const xa = dX(info.minInicio), xb = dX(info.maxFim)
          const frac = Math.max(0, Math.min(1, info.pctMedia / 100))
          return (
            <React.Fragment key={`p${k}`}>
              <div style={caixa(0.14, ry, X0 - 0.14, h, {
                background: '#EEF4FF', border: '1px solid #D9D9D9', fontSize: 9, fontWeight: 700,
                color: '#1F2A44', display: 'flex', alignItems: 'center', paddingLeft: px(0.08), overflow: 'hidden',
              })}>{u.pac.nome || 'Pacote'}</div>
              <div style={caixa(X0, ry, X1 - X0, h, { background: '#EEF4FF', border: '1px solid #D9D9D9' })} />
              {xa != null && xb != null && xb > xa && (
                <>
                  <div style={caixa(xa, ry + (h - BAR_H) / 2, xb - xa, BAR_H, { background: clarear(sc, 0.7), borderRadius: px(BAR_H) / 2 })} />
                  {frac > 0.01 && <div style={caixa(xa, ry + (h - BAR_H) / 2, (xb - xa) * frac, BAR_H, { background: sc, borderRadius: px(BAR_H) / 2 })} />}
                  <div style={caixa(xa, ry + (h - BAR_H) / 2, xb - xa, BAR_H, {
                    fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    whiteSpace: 'nowrap', color: frac > 0.5 ? textoSobre(sc) : '#1E293B',
                  })}>{`${info.pctMedia}%  ${ddmm(info.maxFim)}`}</div>
                </>
              )}
            </React.Fragment>
          )
        }

        const r = u.r
        const solta = !u.pacId && unidades.some(x => x.kind === 'pac')
        const fundoRot = solta ? '#EEF4FF' : '#F2F2F2'
        const st = r.despriorizado ? 'Despriorizado' : (r.statusDemanda || 'A iniciar')
        const stCor = r.despriorizado ? '#7F7F7F' : statusCor(st)
        const dtIni = ddmm(r.fases?.[0]?.inicio || '')

        return (
          <React.Fragment key={`r${k}`}>
            {COLS.map(([cx, cw], ci) => (
              <div key={ci} style={caixa(cx, ry, cw, h, {
                background: fundoRot, border: '1px solid #D9D9D9', overflow: 'hidden',
                fontSize: 9, display: 'flex', alignItems: 'center',
                justifyContent: ci === 1 ? 'flex-start' : 'center',
                padding: ci === 1 ? `0 ${px(0.05)}px` : 0,
                fontWeight: ci === 1 ? 700 : (ci === 2 ? 700 : 400),
                color: ci === 2 ? stCor : (ci === 1 ? '#1F2A44' : '#404040'),
                lineHeight: 1.15,
              })}>
                {ci === 0 ? (r.lecom || '') : ci === 1 ? (r.nome || '') : ci === 2 ? st : dtIni}
              </div>
            ))}
            {cells.map((c, i) => (
              <div key={`c${i}`} style={caixa(fx(c.f0), ry, fx(c.f1) - fx(c.f0), h, {
                background: solta ? (c.futuro ? '#EEF4FF' : '#F0F6FF') : (c.futuro ? '#F8FAFC' : '#FFFFFF'),
                border: '1px solid #D9D9D9',
              })} />
            ))}
            <Fases raia={r} cells={cells} topo={ry} altura={h} />
          </React.Fragment>
        )
      })}

      {/* linha do hoje */}
      {hojeX != null && (
        <>
          <div style={caixa(hojeX, HY, 0, BODY_BOTTOM - HY, { borderLeft: '1.5px dashed #ED7D31', zIndex: 5 })} />
          <div style={caixa(hojeX - 0.07, HY - 0.14, 0.14, 0.14, { background: '#ED7D31', transform: 'rotate(45deg)' })} />
        </>
      )}

      {/* pontos de atenção */}
      <div style={caixa(0.1, 6.0, 3, 0.26, { fontSize: 13, fontWeight: 700, color: '#003B82' })}>Pontos de Atenção</div>
      <div style={caixa(0.14, 6.28, 13.04, 0.78, { background: '#F2F2F2', border: '1px solid #CBD5E1', borderRadius: 6 })} />
      <div style={caixa(0.3, 6.34, 12.7, 0.66, {
        fontSize: 9, color: '#1E293B', overflow: 'hidden', whiteSpace: 'pre-wrap', lineHeight: 1.35,
      })}>{projeto.pontosAtencao || ''}</div>

      <Banda carimbo={carimbo} />
    </div>
  )
}

export default BlocoProjeto

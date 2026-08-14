/**
 * reuniao/importarConteudo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Transforma o que o usuário cola, arrasta ou escolhe numa imagem pronta para
 * virar slide.
 *
 * ═══ O QUE DÁ E O QUE NÃO DÁ ═══
 * Não existe recuperar detalhe que não foi capturado. Se o print saiu com
 * 500px de largura, a informação não está no arquivo — ampliar só aumenta o
 * borrão. Este módulo faz o que de fato ajuda, e MEDE o resto em vez de
 * fingir que resolveu:
 *
 *   1. Recorte de bordas — todo print vem com faixa branca em volta. Sem ela,
 *      o conteúdo ocupa o slide inteiro em vez de encolher no meio. É o maior
 *      ganho visual dos três, e é de graça.
 *   2. Ampliação com reforço de nitidez — ampliar sempre amacia; a máscara
 *      devolve a definição perdida NA AMPLIAÇÃO. Não inventa detalhe.
 *   3. PDF rasterizado grande — PDF é vetor, então aqui o ganho é real:
 *      renderiza entre 2× e 3,5× para chegar perto de 1920px.
 *
 * E devolve um selo de qualidade. Quando dá "baixa", a tela avisa que vai
 * borrar na projeção e ensina o caminho certo — exportar o slide do PowerPoint
 * como PNG, ou salvar em PDF e importar o PDF.
 *
 * REGRA PARA O TIME: para conteúdo externo, PDF é sempre melhor que print.
 *
 * DEPENDÊNCIA: `npm install pdfjs-dist`
 * Importado sob demanda — quem nunca sobe PDF não paga o bundle.
 */

/** Largura ideal: 2× os 960px do slide, que é o que o PDF em 16:9 aproveita. */
export const ALVO_LARGURA = 1920

/** Abaixo disso não vale ampliar: já é miniatura, ampliar só piora. */
const MINIMO_PARA_AMPLIAR = 380

/** Teto de ampliação. Acima de 2,2× o resultado vira mancha. */
const FATOR_MAXIMO = 2.2

/* ═══════════════════════ 1. RECORTE DE BORDAS ═══════════════════════ */

/**
 * Remove a moldura uniforme em volta do conteúdo.
 * Toma a cor do pixel (0,0) como referência e anda de fora para dentro.
 * Amostra de 2 em 2 pixels: dobra a velocidade e não muda o resultado em
 * bordas de print, que são sempre chapadas.
 */
function recortarBordas(cv) {
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const { width: w, height: h } = cv
  const d = ctx.getImageData(0, 0, w, h).data
  const at = (i, j) => ((j * w + i) << 2)
  const ref = [d[0], d[1], d[2]]
  const TOL = 14                                  // JPEG não tem branco perfeito

  const igual = (i, j) => {
    const k = at(i, j)
    return Math.abs(d[k] - ref[0]) < TOL && Math.abs(d[k + 1] - ref[1]) < TOL && Math.abs(d[k + 2] - ref[2]) < TOL
  }
  const linhaVazia = (j) => { for (let i = 0; i < w; i += 2) if (!igual(i, j)) return false; return true }
  const colVazia   = (i) => { for (let j = 0; j < h; j += 2) if (!igual(i, j)) return false; return true }

  let t = 0, b = h - 1, l = 0, r = w - 1
  while (t < b && linhaVazia(t)) t++
  while (b > t && linhaVazia(b)) b--
  while (l < r && colVazia(l)) l++
  while (r > l && colVazia(r)) r--

  const nw = r - l + 1, nh = b - t + 1
  // Recorte que come mais de 60% é suspeito — imagem de fundo claro com pouco
  // conteúdo, por exemplo. Melhor não mexer do que mutilar.
  if (nw < w * 0.4 || nh < h * 0.4) return { canvas: cv, cortou: false }
  if (nw === w && nh === h) return { canvas: cv, cortou: false }

  const out = document.createElement('canvas')
  out.width = nw; out.height = nh
  out.getContext('2d').drawImage(cv, l, t, nw, nh, 0, 0, nw, nh)
  return { canvas: out, cortou: true }
}

/* ═══════════════════════ 2. AMPLIAÇÃO E NITIDEZ ═══════════════════════ */

/** Máscara de nitidez 3×3. Só faz sentido logo depois de ampliar. */
function aplicarNitidez(cv, forca = 0.55) {
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const { width: w, height: h } = cv
  if (w * h > 9e6) return cv                      // acima de ~9MP trava a aba
  const src = ctx.getImageData(0, 0, w, h)
  const a = src.data
  const out = ctx.createImageData(w, h)
  const b = out.data
  const centro = 1 + 4 * forca, lado = -forca
  const linha = w << 2

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) << 2
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1) {
        b[k] = a[k]; b[k + 1] = a[k + 1]; b[k + 2] = a[k + 2]; b[k + 3] = a[k + 3]
        continue
      }
      for (let p = 0; p < 3; p++) {
        const v = centro * a[k + p] + lado * (a[k - 4 + p] + a[k + 4 + p] + a[k - linha + p] + a[k + linha + p])
        b[k + p] = v < 0 ? 0 : v > 255 ? 255 : v
      }
      b[k + 3] = a[k + 3]
    }
  }
  ctx.putImageData(out, 0, 0)
  return cv
}

function ampliar(cv, fator) {
  const out = document.createElement('canvas')
  out.width  = Math.round(cv.width * fator)
  out.height = Math.round(cv.height * fator)
  const ctx = out.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(cv, 0, 0, out.width, out.height)
  return aplicarNitidez(out)
}

/* ═══════════════════════ 3. QUALIDADE ═══════════════════════ */

export const QUALIDADE = {
  alta:  { rotulo: 'Ótima', classe: 'q-ok' },
  media: { rotulo: 'Boa',   classe: 'q-md' },
  baixa: { rotulo: 'Baixa', classe: 'q-bx' },
}

const avaliar = (largura) => (largura >= 1500 ? 'alta' : largura >= 1000 ? 'media' : 'baixa')

export const DICA_BAIXA =
  'Vai sair borrada na projeção. Melhor caminho: no PowerPoint, Arquivo → Exportar → ' +
  'Alterar Tipo de Arquivo → PNG; ou salve o slide em PDF e importe o PDF.'

/* ═══════════════════════ PIPELINE ═══════════════════════ */

function carregarImagem(blob) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(blob)
    const im = new Image()
    im.onload = () => { ok({ img: im, url }) }
    im.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não consegui ler essa imagem.')) }
    im.src = url
  })
}

/**
 * Processa uma imagem: recorta, amplia se precisar, mede.
 * @returns {Promise<{blob, previa, largura, altura, larguraOriginal, cortou, ampliou, qualidade, nome, origem}>}
 */
export async function tratarImagem(blob, nome, origem = 'imagem') {
  const { img, url } = await carregarImagem(blob)
  const base = document.createElement('canvas')
  base.width = img.naturalWidth
  base.height = img.naturalHeight
  base.getContext('2d').drawImage(img, 0, 0)
  URL.revokeObjectURL(url)

  const larguraOriginal = base.width
  let { canvas, cortou } = recortarBordas(base)

  let ampliou = false
  if (canvas.width < ALVO_LARGURA * 0.92 && canvas.width >= MINIMO_PARA_AMPLIAR) {
    canvas = ampliar(canvas, Math.min(FATOR_MAXIMO, ALVO_LARGURA / canvas.width))
    ampliou = true
  }

  // PNG de propósito: é print de texto. JPEG traria artefato em cima de letra.
  const saida = await new Promise(r => canvas.toBlob(r, 'image/png'))
  return {
    blob: saida,
    previa: URL.createObjectURL(saida),
    largura: canvas.width, altura: canvas.height, larguraOriginal,
    cortou, ampliou, qualidade: avaliar(canvas.width),
    nome, origem,
  }
}

/**
 * Cada página do PDF vira um slide.
 * A escala sai da largura real da página: A4 paisagem e 16:9 têm larguras bem
 * diferentes, e escala fixa produziria resultados desiguais.
 */
export async function tratarPdf(file, nome) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
  ).toString()

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out = []
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i)
    const base = pg.getViewport({ scale: 1 })
    const escala = Math.min(3.5, Math.max(2, ALVO_LARGURA / base.width))
    const vp = pg.getViewport({ scale: escala })
    const cv = document.createElement('canvas')
    cv.width = vp.width; cv.height = vp.height
    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'))
    const rotulo = doc.numPages > 1 ? `${nome} — p.${i}` : nome
    out.push(await tratarImagem(blob, rotulo, 'PDF'))
  }
  return out
}

/**
 * Porta de entrada única: aceita imagem ou PDF e devolve sempre uma lista.
 * @returns {Promise<Array>} um item por slide
 */
export async function tratarArquivo(file) {
  if (!file) return []
  const nome = String(file.name || 'Conteúdo').replace(/\.[^.]+$/, '')
  if (file.type === 'application/pdf') return tratarPdf(file, nome)
  if (file.type.startsWith('image/'))   return [await tratarImagem(file, nome, 'imagem')]
  throw new Error('Formato não suportado. Use PNG, JPG ou PDF.')
}

/**
 * Imagem vinda do Ctrl+V. O clipboard não traz nome de arquivo, então rotula
 * como recorte — é o caso mais comum e o mais rápido de usar.
 */
export async function tratarColagem(evento) {
  const itens = [...(evento.clipboardData?.items || [])].filter(i => i.type.startsWith('image/'))
  if (!itens.length) return []
  const out = []
  for (const it of itens) {
    const f = it.getAsFile()
    if (f) out.push(await tratarImagem(f, 'Recorte de tela', 'recorte'))
  }
  return out
}

/** Libera as prévias. Sem isto, montar um roteiro grande vaza memória. */
export function descartar(itens) {
  ;(itens || []).forEach(i => { if (i?.previa) { try { URL.revokeObjectURL(i.previa) } catch { /* já liberada */ } } })
}

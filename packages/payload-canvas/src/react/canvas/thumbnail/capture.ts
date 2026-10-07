// Takes a picture of rendered blocks, with no dependency: the element is copied into an SVG
// `<foreignObject>` together with the page's CSS, its fonts and images inlined as data URLs, and
// the SVG is drawn onto a canvas. Runs inside the thumbnail iframe (same origin as the admin).

import {
  codePoints,
  cssUrls,
  declaration,
  escapeXml,
  familyNames,
  fontFaceBlocks,
  parseUnicodeRange,
  rangesCover,
  replaceUrls,
  rewriteRootSelectors,
  THUMB_BODY_ATTR,
  THUMB_HTML_ATTR,
} from './css'

export type CaptureOptions = {
  /** Width of the picture in pixels. */
  outputWidth: number
  /** The element is cut at this height (CSS pixels). */
  maxHeight: number
}

export type Capture = { url: string; width: number; height: number }

const XHTML = 'http://www.w3.org/1999/xhtml'
/** Embedded images are this much sharper than the picture needs, for high-density screens. */
const IMAGE_DENSITY = 1.5
/** Time for an SVG image to apply its embedded fonts after it decoded. */
const FONT_SETTLE_MS = 80

/** Fetched resources as data URLs, by URL (and width for images). Kept for the life of the iframe. */
const resources = new Map<string, Promise<string | null>>()

function cached(key: string, load: () => Promise<string | null>): Promise<string | null> {
  let entry = resources.get(key)
  if (!entry) {
    entry = load().catch(() => null)
    resources.set(key, entry)
  }
  return entry
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read the file')))
    reader.readAsDataURL(blob)
  })
}

async function fetchBlob(url: string): Promise<Blob | null> {
  const sameOrigin = new URL(url, window.location.href).origin === window.location.origin
  const res = await fetch(url, { credentials: sameOrigin ? 'include' : 'omit', mode: 'cors' })
  return res.ok ? res.blob() : null
}

/** A file (font, poster) as a data URL. */
function fileDataUrl(url: string): Promise<string | null> {
  return cached(url, async () => {
    const blob = await fetchBlob(url)
    return blob ? blobToDataUrl(blob) : null
  })
}

/** An image as a data URL, at most `width` pixels wide. SVG images stay as they are. */
function imageDataUrl(url: string, width: number): Promise<string | null> {
  const target = Math.max(16, Math.ceil(width))
  return cached(`${url}\u0000${target}`, async () => {
    if (url.startsWith('data:')) return url
    const blob = await fetchBlob(url)
    if (!blob) return null
    if (blob.type.includes('svg')) return blobToDataUrl(blob)
    const bitmap = await createImageBitmap(blob)
    try {
      const scale = Math.min(1, target / bitmap.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/webp', 0.82)
    } finally {
      bitmap.close()
    }
  })
}

const absolute = (ref: string, base: string) => {
  try {
    return new URL(ref, base).href
  } catch {
    return ref
  }
}

/** The text with every `url(…)` replaced by a data URL from `load`. Null when one failed. */
async function inlineUrls(css: string, base: string, load: (url: string) => Promise<string | null>): Promise<string | null> {
  const refs = cssUrls(css).filter((ref) => !ref.startsWith('data:'))
  const map = new Map<string, string>()
  for (const ref of refs) {
    const data = await load(absolute(ref, base))
    if (!data) return null
    map.set(ref, data)
  }
  return replaceUrls(css, map)
}

type FontNeeds = { families: ReadonlySet<string>; codes: ReadonlySet<number> }

/** An `@font-face` rule the picture needs (a used family, a used character), with its files inlined. */
async function fontFace(block: string, family: string, range: string | null, base: string, needs: FontNeeds): Promise<string> {
  const name = familyNames(family)[0]
  if (!name || !needs.families.has(name) || !rangesCover(parseUnicodeRange(range), needs.codes)) return ''
  return (await inlineUrls(block, base, fileDataUrl)) ?? ''
}

/** The rules as text, with `html`/`body` selectors moved to the stand-ins and fonts inlined. */
async function rulesText(rules: CSSRuleList, base: string, needs: FontNeeds): Promise<string> {
  const out: string[] = []
  for (const rule of rules) {
    if (rule instanceof CSSFontFaceRule) {
      const block = `@font-face{${rule.style.cssText}}`
      out.push(await fontFace(block, rule.style.getPropertyValue('font-family'), rule.style.getPropertyValue('unicode-range'), base, needs))
    } else if (rule instanceof CSSStyleRule) {
      const text = rule.cssText
      out.push(text.startsWith(rule.selectorText) ? rewriteRootSelectors(rule.selectorText) + text.slice(rule.selectorText.length) : text)
    } else if (rule instanceof CSSImportRule) {
      if (rule.styleSheet) out.push(await sheetText(rule.styleSheet, needs))
    } else if (rule instanceof CSSGroupingRule) {
      // @media, @supports, @layer blocks, @container: the same treatment inside.
      const head = rule.cssText.slice(0, rule.cssText.indexOf('{'))
      out.push(`${head}{${await rulesText(rule.cssRules, base, needs)}}`)
    } else {
      out.push(rule.cssText)
    }
  }
  return out.join('\n')
}

async function sheetText(sheet: CSSStyleSheet, needs: FontNeeds): Promise<string> {
  const base = sheet.href ?? document.baseURI
  let rules: CSSRuleList | null = null
  try {
    rules = sheet.cssRules
  } catch {
    rules = null
  }
  if (rules) return rulesText(rules, base, needs)
  // A cross-origin sheet (Google Fonts) cannot be read as rules: load its text. Keep its font faces only.
  if (!sheet.href) return ''
  const text = await cached(`text\u0000${sheet.href}`, async () => {
    const res = await fetch(sheet.href as string, { mode: 'cors', credentials: 'omit' })
    return res.ok ? res.text() : null
  })
  if (!text) return ''
  const faces = await Promise.all(
    fontFaceBlocks(text).map((block) => fontFace(block, declaration(block, 'font-family') ?? '', declaration(block, 'unicode-range'), base, needs)),
  )
  return faces.join('\n')
}

/** A box in place of an element a picture cannot show (video, embed, iframe). */
function standIn(el: Element, style: CSSStyleDeclaration, background: string): HTMLElement {
  const rect = el.getBoundingClientRect()
  const box = document.createElement('div')
  const className = el.getAttribute('class')
  if (className) box.setAttribute('class', className)
  const display = style.display === 'inline' ? 'inline-block' : style.display
  box.setAttribute(
    'style',
    `display:${display};width:${rect.width}px;height:${rect.height}px;background:${background};background-size:cover;background-position:center;border-radius:${style.borderRadius}`,
  )
  return box
}

/**
 * Copies `root` for the picture: images and backgrounds as data URLs, videos and embeds as boxes,
 * form values as attributes. Returns the copy, the font families it uses and its characters.
 */
async function prepareCopy(root: HTMLElement, imageScale: number): Promise<{ copy: HTMLElement; needs: FontNeeds }> {
  const copy = root.cloneNode(true) as HTMLElement
  const originals = [root, ...root.querySelectorAll('*')]
  const copies = [copy, ...copy.querySelectorAll('*')]
  const families = new Set<string>()
  const jobs: Promise<void>[] = []

  for (let i = 0; i < originals.length; i++) {
    const el = originals[i]
    const twin = copies[i] as HTMLElement | undefined
    if (!twin) continue
    const tag = el.localName
    if (tag === 'script' || tag === 'noscript' || tag === 'style' || tag === 'template' || tag === 'link') {
      twin.remove()
      continue
    }
    const style = getComputedStyle(el)
    if (style.display === 'none') continue
    for (const name of familyNames(style.fontFamily)) families.add(name)

    if (el instanceof HTMLImageElement) {
      const src = el.currentSrc || el.src
      for (const name of ['srcset', 'sizes', 'loading', 'decoding', 'fetchpriority']) twin.removeAttribute(name)
      if (src) {
        const width = el.getBoundingClientRect().width * imageScale
        jobs.push(
          imageDataUrl(src, width).then((url) => {
            if (url) twin.setAttribute('src', url)
            else twin.removeAttribute('src')
          }),
        )
      }
    } else if (el instanceof HTMLVideoElement || tag === 'iframe' || tag === 'embed' || tag === 'object') {
      const poster = el instanceof HTMLVideoElement ? el.poster : ''
      if (poster) {
        jobs.push(
          imageDataUrl(poster, el.getBoundingClientRect().width * imageScale).then((url) => {
            twin.replaceWith(standIn(el, style, url ? `#1c1c1c url("${url}")` : '#1c1c1c'))
          }),
        )
      } else {
        twin.replaceWith(standIn(el, style, '#1c1c1c'))
      }
      continue
    } else if (el instanceof HTMLCanvasElement) {
      try {
        const img = document.createElement('img')
        img.src = el.toDataURL()
        img.setAttribute('style', `width:${el.getBoundingClientRect().width}px;height:${el.getBoundingClientRect().height}px`)
        twin.replaceWith(img)
      } catch {
        twin.replaceWith(standIn(el, style, '#1c1c1c'))
      }
      continue
    } else if (tag === 'source' && el.parentElement?.localName === 'picture') {
      twin.remove()
      continue
    } else if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') twin.toggleAttribute('checked', el.checked)
      else twin.setAttribute('value', el.value)
    } else if (el instanceof HTMLTextAreaElement) {
      twin.textContent = el.value
    } else if (el instanceof HTMLSelectElement) {
      const options = twin.querySelectorAll('option')
      options.forEach((option, index) => option.toggleAttribute('selected', index === el.selectedIndex))
    }

    const background = style.backgroundImage
    if (background && background.includes('url(')) {
      const width = el.getBoundingClientRect().width * imageScale
      jobs.push(
        inlineUrls(background, document.baseURI, (url) => imageDataUrl(url, width)).then((value) => {
          twin.style.backgroundImage = value ?? 'none'
        }),
      )
    }
  }
  await Promise.all(jobs)
  return { copy, needs: { families, codes: codePoints(root.textContent ?? '') } }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  return img.decode().then(() => img)
}

/**
 * A picture of `root` (its full width, cut at `maxHeight`), `outputWidth` pixels wide, as a WebP
 * data URL (PNG where WebP is missing). When the browser refuses to read the canvas, the picture
 * is the SVG itself.
 */
export async function captureElement(root: HTMLElement, options: CaptureOptions): Promise<Capture> {
  await document.fonts.ready
  const width = Math.max(1, Math.ceil(root.getBoundingClientRect().width))
  const height = Math.max(1, Math.min(Math.ceil(root.scrollHeight), options.maxHeight))
  const scale = options.outputWidth / width
  const { copy, needs } = await prepareCopy(root, scale * IMAGE_DENSITY)
  const css = (await Promise.all([...document.styleSheets].map((sheet) => sheetText(sheet, needs)))).join('\n')

  const htmlClass = document.documentElement.getAttribute('class') ?? ''
  const bodyClass = document.body.getAttribute('class') ?? ''
  const content = new XMLSerializer().serializeToString(copy)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="${XHTML}" ${THUMB_HTML_ATTR}="" class="${escapeXml(htmlClass)}" style="width:${width}px;height:${height}px;overflow:hidden">` +
    `<style>${escapeXml(css)}</style>` +
    `<div ${THUMB_BODY_ATTR}="" class="${escapeXml(bodyClass)}" style="margin:0;min-height:${height}px">${content}</div>` +
    `</div></foreignObject></svg>`
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  const image = await loadImage(svgUrl)
  // Embedded fonts may apply a moment after the image decoded.
  await new Promise((resolve) => setTimeout(resolve, FONT_SETTLE_MS))
  const outWidth = Math.round(options.outputWidth)
  const outHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = outWidth
  canvas.height = outHeight
  const context = canvas.getContext('2d')
  if (!context) return { url: svgUrl, width: outWidth, height: outHeight }
  context.fillStyle = '#fff'
  context.fillRect(0, 0, outWidth, outHeight)
  context.drawImage(image, 0, 0, outWidth, outHeight)
  try {
    const webp = canvas.toDataURL('image/webp', 0.85)
    return { url: webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'), width: outWidth, height: outHeight }
  } catch {
    return { url: svgUrl, width: outWidth, height: outHeight }
  }
}

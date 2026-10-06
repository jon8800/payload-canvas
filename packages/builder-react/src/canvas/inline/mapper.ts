// The canvas's automatic mapping: after a block renders, find the elements that show its props.
//
// Text: the smallest element of the block whose text equals a text, textarea or richText prop
// (whitespace normalized; rich text compared without whitespace) gets `data-builder-text-auto`
// with the prop path. Inline editing then treats it like an `editableText` mark. A value that
// shows in more than one visible element, or an element that matches two props, gets no mark.
// Images: `<img>`, `<video>` (file and poster) and background images whose URL is a URL of an
// upload prop's media document (any image size, `next/image` URLs too).
//
// Cost: a block is mapped again only when its data (the block object, which `shareStructure`
// keeps for unchanged blocks) or its DOM (a MutationObserver) changed. Unchanged blocks cost one
// map lookup per pass. DOM-only changes map at most once a second per block. A block being edited
// inline is skipped until editing ends.

import type { Block, BlockDefinition, Layout } from '@payload-toolkit/builder/core'
import type { CanvasImageKind, CanvasImageTarget } from '@payload-toolkit/builder/protocol'

import { EDITABLE_IMAGE_ATTRIBUTE, EDITABLE_TEXT_ATTRIBUTE } from '../../render/editable'
import { blockCandidates, compactText, cssUrls, normalizeText, srcsetUrls, urlKey, type TextCandidate } from './candidates'

/** The attribute the mapping puts on an element that shows a text prop. Its value is the prop path. */
export const AUTO_TEXT_ATTRIBUTE = 'data-builder-text-auto'

/** Explicit or automatic text marks. */
export const TEXT_MARK_SELECTOR = `[${EDITABLE_TEXT_ATTRIBUTE}], [${AUTO_TEXT_ATTRIBUTE}]`

/** Stands for a nested block in an element's text: an element around a child block never matches. */
const NESTED = '\u0000'
/** Elements whose text is not content. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'svg', 'IFRAME', 'VIDEO', 'AUDIO', 'CANVAS'])
/**
 * Rich text is edited by a Lexical editor that renders its own paragraphs into the element, so the
 * element must be a container, never a paragraph or an inline element.
 */
const RICH_CONTAINERS = new Set(['DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'BLOCKQUOTE', 'FIGCAPTION', 'TD'])
/** Blocks with more own elements than this skip text mapping (a list of hundreds of rows). */
const MAX_ELEMENTS = 4000
/**
 * A block whose DOM changes by itself (a ticker, a typing effect, a carousel) maps again at most
 * this often. Data changes map at once, and a double-click or hover maps a block at once too.
 */
const DOM_REMAP_MS = 1000
/** Mapping time per animation frame, in ms. The rest of the blocks map in the next frame. */
const FRAME_BUDGET_MS = 8
/** At most this many elements per block are checked for class-set background images. */
const MAX_STYLE_CHECKS = 600

type ImageEntry = { element: Element; path: string; kind: CanvasImageKind }
/** `at`: when the block was mapped (performance.now()). */
type Entry = { element: HTMLElement; block: Block | null; images: ImageEntry[]; at: number }

export type MapperStats = {
  /** Mapping passes that mapped at least one block. */
  passes: number
  /** Blocks mapped in total. */
  blocks: number
  /** Time spent mapping, in ms. */
  ms: number
  /** The slowest single block, in ms. */
  slowestBlockMs: number
  /** The last pass that mapped blocks: how many and how long. */
  last: { blocks: number; ms: number }
  /** Every pass, also the ones that found nothing to map: how many and their total time, in ms. */
  checks: { count: number; ms: number }
}

export type CanvasMapper = {
  /** Maps the blocks whose data or DOM changed, in the next animation frame. */
  schedule(): void
  /** Maps one block now when it is out of date. */
  ensure(blockEl: HTMLElement): void
  /** The upload props shown under a point (iframe viewport coordinates), or null. */
  imageTarget(x: number, y: number): CanvasImageTarget | null
  /** Maps every block again (the canvas width changed: other elements may show). */
  invalidate(): void
  dispose(): void
  stats: MapperStats
}

export type MapperOptions = {
  root: () => HTMLElement | null
  /** The layout on screen (bindings resolved, documents loaded). */
  shown: () => Layout | null
  /** The stored block (its bindings say which props show document data). */
  stored: (id: string) => Block | null
  definition: (type: string) => BlockDefinition | undefined
  /** True for the block being edited inline: its DOM is the user's, not React's. */
  skip: (id: string) => boolean
}

function indexBlocks(layout: Layout | null): Map<string, Block> {
  const index = new Map<string, Block>()
  const walk = (blocks: Block[]) => {
    for (const block of blocks) {
      index.set(block.id, block)
      for (const children of Object.values(block.slots ?? {})) walk(children)
    }
  }
  if (layout) walk(layout.blocks)
  return index
}

/** The block's own elements (the block element first), without nested blocks and their content. */
function ownElements(blockEl: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [blockEl]
  const walker = blockEl.ownerDocument.createTreeWalker(blockEl, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => ((node as Element).hasAttribute('data-block-id') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node as HTMLElement)
  return out
}

const visible = (el: Element) => el.getClientRects().length > 0

/** Keeps only the elements that contain no other element of the list (the smallest ones). */
function innermost(elements: Element[]): Element[] {
  return elements.filter((el) => !elements.some((other) => other !== el && el.contains(other)))
}

/** For rich text: the deepest container of each chain of matching elements. */
function richContainers(elements: Element[]): Element[] {
  return innermost(elements.filter((el) => RICH_CONTAINERS.has(el.tagName)))
}

/** The text of each element (line breaks for `<br>`), computed once for the whole block. */
function elementTexts(blockEl: HTMLElement): Map<Element, string> {
  const texts = new Map<Element, string>()
  const walk = (el: Element): string => {
    let out = ''
    for (let child = el.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) out += (child as Text).data
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as Element
        if (element.tagName === 'BR') out += '\n'
        else if (SKIP_TAGS.has(element.tagName) || element.hasAttribute('data-builder-placeholder')) continue
        else if (element.hasAttribute('data-block-id')) out += NESTED
        else out += walk(element)
      }
    }
    texts.set(el, out)
    return out
  }
  walk(blockEl)
  return texts
}

/**
 * Image URLs an element shows, by how it shows them. Each kind lists URL groups, most specific
 * first: the file on screen (`currentSrc`), then `src`, then the other candidates (`srcset`,
 * `<source>` elements). A `<video>` with a desktop and a mobile source shows one of them.
 */
function elementImageUrls(el: Element): Array<[CanvasImageKind, string[][]]> {
  const found: Array<[CanvasImageKind, string[][]]> = []
  if (el.tagName === 'IMG') {
    const img = el as HTMLImageElement
    const rest = srcsetUrls(img.getAttribute('srcset') ?? '')
    if (img.parentElement?.tagName === 'PICTURE') {
      for (const source of img.parentElement.querySelectorAll('source')) rest.push(...srcsetUrls(source.getAttribute('srcset') ?? ''))
    }
    found.push(['image', [[img.currentSrc], [img.getAttribute('src') ?? ''], rest]])
  } else if (el.tagName === 'VIDEO') {
    const video = el as HTMLVideoElement
    const sources = [...video.querySelectorAll('source')]
    // The source the browser picks: the first one whose `media` matches (the file may not have loaded yet).
    const view = el.ownerDocument.defaultView
    const picked = sources.find((source) => {
      const media = source.getAttribute('media')
      return !media || Boolean(view?.matchMedia(media).matches)
    })
    const all = sources.map((source) => source.getAttribute('src') ?? '')
    found.push(['video', [[video.currentSrc], [video.getAttribute('src') ?? ''], [picked?.getAttribute('src') ?? ''], all]])
    const poster = video.getAttribute('poster')
    if (poster) found.push(['poster', [[poster]]])
  }
  const background = (el as HTMLElement).style?.backgroundImage
  if (background && background !== 'none') found.push(['background', [cssUrls(background)]])
  return found
}

function imageKindOf(el: Element): CanvasImageKind {
  if (el.tagName === 'VIDEO') return 'video'
  if (el.tagName === 'IMG' || el.tagName === 'PICTURE') return 'image'
  return 'background'
}

/** True when `el` is a marked element, inside one or around one. */
function nearMark(el: Element, marks: Element[]): boolean {
  return marks.some((mark) => mark.contains(el) || el.contains(mark))
}

/** Puts `data-builder-text-auto` on the one visible element that shows each text candidate. */
function mapTexts(blockEl: HTMLElement, candidates: TextCandidate[], marks: Element[]) {
  const plain = new Map<string, TextCandidate>()
  const rich = new Map<string, TextCandidate>()
  let longest = 0
  for (const candidate of candidates) {
    ;(candidate.kind === 'rich' ? rich : plain).set(candidate.key, candidate)
    longest = Math.max(longest, candidate.key.length)
  }
  const matches = new Map<TextCandidate, Element[]>()
  for (const [el, raw] of elementTexts(blockEl)) {
    // Far longer than every value (React adds no whitespace of its own): a container, skip it early.
    if (raw.length === 0 || raw.length > longest * 4 + 256 || raw.includes(NESTED)) continue
    const text = normalizeText(raw)
    if (!text) continue
    const hits = [plain.get(text), rich.size > 0 ? rich.get(compactText(text)) : undefined]
    for (const hit of hits) {
      if (!hit) continue
      const list = matches.get(hit) ?? []
      list.push(el)
      matches.set(hit, list)
    }
  }
  const chosen = new Map<Element, TextCandidate[]>()
  for (const [candidate, elements] of matches) {
    const allowed = elements.filter((el) => !nearMark(el, marks))
    const picks = (candidate.kind === 'rich' ? richContainers(allowed) : innermost(allowed)).filter(visible)
    // The value shows twice (or in a hidden copy and a visible one at once): do not guess.
    if (picks.length !== 1) continue
    const list = chosen.get(picks[0]) ?? []
    list.push(candidate)
    chosen.set(picks[0], list)
  }
  for (const [el, list] of chosen) if (list.length === 1) el.setAttribute(AUTO_TEXT_ATTRIBUTE, list[0].path)
}

export function createCanvasMapper(options: MapperOptions): CanvasMapper {
  const entries = new Map<string, Entry>()
  const dirty = new Set<string>()
  const stats: MapperStats = { passes: 0, blocks: 0, ms: 0, slowestBlockMs: 0, last: { blocks: 0, ms: 0 }, checks: { count: 0, ms: 0 } }
  let frame = 0
  let indexFor: Layout | null = null
  let index = new Map<string, Block>()
  let observer: MutationObserver | null = null
  let laterTimer = 0
  let observed: HTMLElement | null = null

  const blockOf = (id: string): Block | null => {
    const layout = options.shown()
    if (layout !== indexFor) {
      indexFor = layout
      index = indexBlocks(layout)
    }
    return index.get(id) ?? null
  }

  const fresh = (el: HTMLElement, id: string) => {
    const entry = entries.get(id)
    return Boolean(entry && entry.element === el && entry.block === blockOf(id) && !dirty.has(id))
  }

  function mapBlock(blockEl: HTMLElement, block: Block | null): Entry {
    const entry: Entry = { element: blockEl, block, images: [], at: performance.now() }
    const own = ownElements(blockEl)
    for (const el of own) if (el.hasAttribute(AUTO_TEXT_ATTRIBUTE)) el.removeAttribute(AUTO_TEXT_ATTRIBUTE)
    if (!block) return entry
    const definition = options.definition(block.type)
    const stored = options.stored(block.id)
    const source = stored?.bindings ? { ...block, bindings: stored.bindings } : block
    const { texts, images } = blockCandidates(source, definition, blockEl.ownerDocument.baseURI)

    // Explicit marks win: their elements, the elements around and inside them, and their paths.
    const textMarks = own.filter((el) => el.hasAttribute(EDITABLE_TEXT_ATTRIBUTE))
    const imageMarks = own.filter((el) => el.hasAttribute(EDITABLE_IMAGE_ATTRIBUTE))

    const markedTexts = new Set(textMarks.map((el) => el.getAttribute(EDITABLE_TEXT_ATTRIBUTE)))
    const textCandidates = texts.filter((text) => !markedTexts.has(text.path))
    if (textCandidates.length > 0 && own.length <= MAX_ELEMENTS) mapTexts(blockEl, textCandidates, textMarks)

    for (const el of imageMarks) entry.images.push({ element: el, path: el.getAttribute(EDITABLE_IMAGE_ATTRIBUTE) ?? '', kind: imageKindOf(el) })
    const markedImages = new Set(imageMarks.map((el) => el.getAttribute(EDITABLE_IMAGE_ATTRIBUTE)))
    const byUrl = new Map<string, Set<string>>()
    for (const image of images) {
      if (markedImages.has(image.path)) continue
      for (const url of image.urls) {
        const paths = byUrl.get(url) ?? new Set<string>()
        paths.add(image.path)
        byUrl.set(url, paths)
      }
    }
    if (byUrl.size === 0) return entry
    const base = blockEl.ownerDocument.baseURI
    const found = new Set<string>()
    // The first URL group that names an upload decides. Two uploads in one group (the same file in
    // two props): do not guess.
    const match = (el: Element, kind: CanvasImageKind, groups: string[][]) => {
      for (const urls of groups) {
        const paths = new Set<string>()
        for (const url of urls) {
          const key = url ? urlKey(url, base) : null
          for (const path of (key && byUrl.get(key)) || []) paths.add(path)
        }
        if (paths.size === 0) continue
        if (paths.size > 1) return
        const [path] = paths
        entry.images.push({ element: el, path, kind })
        found.add(path)
        return
      }
    }
    const candidates = own.filter((el) => !nearMark(el, imageMarks))
    for (const el of candidates) for (const [kind, groups] of elementImageUrls(el)) match(el, kind, groups)
    // Uploads not found yet may be backgrounds set by CSS classes (`bg-[url(…)]`).
    if (images.some((image) => !markedImages.has(image.path) && !found.has(image.path))) {
      const view = blockEl.ownerDocument.defaultView
      for (const el of candidates.slice(0, MAX_STYLE_CHECKS)) {
        if ((el as HTMLElement).style?.backgroundImage) continue
        const background = view?.getComputedStyle(el).backgroundImage
        if (background && background !== 'none') match(el, 'background', [cssUrls(background)])
      }
    }
    return entry
  }

  function remap(el: HTMLElement, id: string) {
    const started = performance.now()
    entries.set(id, mapBlock(el, blockOf(id)))
    dirty.delete(id)
    const ms = performance.now() - started
    stats.blocks++
    stats.ms += ms
    stats.slowestBlockMs = Math.max(stats.slowestBlockMs, ms)
    return ms
  }

  function connect(root: HTMLElement) {
    if (observed === root) return
    observer?.disconnect()
    observed = root
    observer = new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target
        const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
        const id = el?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
        if (id) dirty.add(id)
      }
      schedule()
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
  }

  function run() {
    frame = 0
    const root = options.root()
    if (!root) return
    const started = performance.now()
    connect(root)
    const seen = new Set<string>()
    let mapped = 0
    let ms = 0
    let sliced = false
    let later = false
    for (const el of root.querySelectorAll<HTMLElement>('[data-block-id]')) {
      const id = el.dataset.blockId
      // Repeated collection list items share their block's id: the first element is the block.
      if (!id || seen.has(id)) continue
      seen.add(id)
      if (fresh(el, id) || options.skip(id)) continue
      // Only its DOM changed, and it was mapped a moment ago: map it a little later.
      const entry = entries.get(id)
      if (entry && entry.element === el && entry.block === blockOf(id) && started - entry.at < DOM_REMAP_MS) {
        later = true
        continue
      }
      // A long page maps in slices, so no frame waits long for it.
      if (ms > FRAME_BUDGET_MS) {
        sliced = true
        break
      }
      ms += remap(el, id)
      mapped++
    }
    // Blocks no longer on the page. After a cut pass, the next one finishes the rest.
    if (sliced) schedule()
    else for (const id of entries.keys()) if (!seen.has(id)) entries.delete(id)
    if (later && !laterTimer) {
      laterTimer = window.setTimeout(() => {
        laterTimer = 0
        schedule()
      }, DOM_REMAP_MS)
    }
    stats.checks.count++
    stats.checks.ms += performance.now() - started
    if (mapped === 0) return
    stats.passes++
    stats.last = { blocks: mapped, ms }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(run)
  }

  function ensure(blockEl: HTMLElement) {
    const id = blockEl.dataset.blockId
    if (!id || options.skip(id) || fresh(blockEl, id)) return
    remap(blockEl, id)
  }

  return {
    stats,
    schedule,
    ensure,
    imageTarget(x, y) {
      const root = options.root()
      const top = root?.ownerDocument.elementFromPoint(x, y)
      const blockEl = top?.closest<HTMLElement>('[data-block-id]')
      const id = blockEl?.dataset.blockId
      if (!top || !blockEl || !id || !root?.contains(blockEl) || blockEl.closest('[data-builder-repeat]')) return null
      // Text on top of an image (a hero heading over its photo): the text wins.
      const text = top.closest(TEXT_MARK_SELECTOR)
      if (text && text.closest('[data-block-id]') === blockEl) return null
      ensure(blockEl)
      const entry = entries.get(id)
      if (!entry || entry.element !== blockEl) return null
      const hits: Array<ImageEntry & { rect: DOMRect }> = []
      for (const image of entry.images) {
        const rect = image.element.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) continue
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
        hits.push({ ...image, rect })
      }
      if (hits.length === 0) return null
      // The smallest box first; for equal boxes the later element, which paints on top.
      hits.sort((a, b) => {
        const area = a.rect.width * a.rect.height - b.rect.width * b.rect.height
        if (Math.abs(area) > 1) return area
        if (a.element === b.element) return 0
        return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1
      })
      const seen = new Set<string>()
      const spots = hits.flatMap((hit) => {
        const key = `${hit.path}\u0000${hit.kind}`
        if (seen.has(key)) return []
        seen.add(key)
        const { left, top: y0, width, height } = hit.rect
        return [{ path: hit.path, kind: hit.kind, rect: { x: left, y: y0, width, height } }]
      })
      return { id, spots }
    },
    invalidate() {
      for (const id of entries.keys()) dirty.add(id)
      schedule()
    },
    dispose() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      window.clearTimeout(laterTimer)
      laterTimer = 0
      observer?.disconnect()
      observer = null
      observed = null
      entries.clear()
    },
  }
}

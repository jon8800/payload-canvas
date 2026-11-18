// Photos in rich text: Payload's resized copies in one `<img>`, so a page never loads a multi-MB
// original for a photo in a text column, and the photo never switches to a crop at some widths.

import type { ReactNode } from 'react'

/** The class on every rich text photo. Sites style it, or set `--builder-richtext-image-radius`. */
export const RICHTEXT_IMAGE_CLASS = 'builder-richtext-image'

/**
 * `:where()` has no specificity, so any rule of the site wins over these defaults. The radius is 0
 * until a site sets the custom property.
 */
export const RICHTEXT_IMAGE_CSS = `:where(.${RICHTEXT_IMAGE_CLASS}){max-width:100%;height:auto;border-radius:var(--builder-richtext-image-radius,0)}`

/**
 * A text column is rarely wider than 768 px. `auto` lets browsers that support it (lazy images
 * only) use the width the photo really has on the page.
 */
export const RICHTEXT_IMAGE_SIZES = 'auto, (min-width: 1024px) 768px, 100vw'

/** A heavy original (a PNG, or over 600 KB) stays out of the srcset when a copy exists. */
const LIGHT_ORIGINAL_BYTES = 600 * 1024

/** At this width a copy is large enough for any text column, so the original adds nothing. */
const LARGE_COPY_WIDTH = 1920

type Doc = Record<string, unknown>
type Candidate = { url: string; width: number; height: number }

const asString = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)
const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

function isDoc(value: unknown): value is Doc {
  return typeof value === 'object' && value !== null
}

/** True when two boxes have the same shape. A size with its own crop (a 16:9 `hero`) does not. */
function sameShape(a: Candidate, b: Candidate): boolean {
  return Math.abs(b.height / b.width - a.height / a.width) < 0.01
}

/**
 * Payload can reuse a file name after an edit. `?v=<id>-<updatedAt>` gives each version of the
 * photo its own URL, so no browser or CDN cache shows the old photo.
 */
function versioned(doc: Doc, url: string): string {
  const id = doc.id
  const updatedAt = asString(doc.updatedAt)
  if ((typeof id !== 'string' && typeof id !== 'number') || id === '' || !updatedAt) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(`${id}-${updatedAt}`)}`
}

/** A srcset entry ends at a space or a comma, so a URL must not contain either. */
const srcSetURL = (url: string): string => url.replaceAll(' ', '%20').replaceAll(',', '%2C')

/**
 * The original joins the srcset only when it is light and no copy is large enough already. A PNG
 * or a camera file can be several MB, and a retina screen would pick it for a wide column.
 */
function originalFits(doc: Doc, largestCopyWidth: number): boolean {
  if (!largestCopyWidth) return true
  if (doc.mimeType === 'image/png') return false
  if ((asNumber(doc.filesize) ?? 0) > LIGHT_ORIGINAL_BYTES) return false
  return largestCopyWidth < LARGE_COPY_WIDTH
}

/**
 * Payload's resized copies with the original's shape, smallest first, then the original when it
 * is light. Cropped sizes never join: a srcset must not switch crops between screen widths.
 */
export function richTextImageCandidates(doc: Doc): Candidate[] {
  const url = asString(doc.url)
  const width = asNumber(doc.width)
  const height = asNumber(doc.height)
  if (!url || !width || !height) return []
  const original = { url, width, height }
  const byWidth = new Map<number, Candidate>()
  for (const size of Object.values(isDoc(doc.sizes) ? doc.sizes : {})) {
    if (!isDoc(size)) continue
    const copy = { url: asString(size.url) ?? '', width: asNumber(size.width) ?? 0, height: asNumber(size.height) ?? 0 }
    if (!copy.url || !copy.width || !copy.height) continue
    // A copy as wide as the original adds nothing (Payload keeps a copy at full width when it
    // cannot make it smaller).
    if (copy.width >= width || !sameShape(original, copy)) continue
    byWidth.set(copy.width, { ...copy, url: versioned(doc, copy.url) })
  }
  if (originalFits(doc, Math.max(0, ...byWidth.keys()))) byWidth.set(width, { ...original, url: versioned(doc, url) })
  return [...byWidth.values()].toSorted((a, b) => a.width - b.width)
}

type UploadNode = { value?: unknown; fields?: { alt?: unknown } | null }

/** True for an image upload. A doc loaded without `mimeType` counts when it has a size. */
function isImage(doc: Doc): boolean {
  const mimeType = asString(doc.mimeType)
  if (mimeType) return mimeType.startsWith('image/')
  return asNumber(doc.width) !== undefined && asNumber(doc.height) !== undefined
}

/**
 * One rich text photo as a plain `<img>`. `src` is the widest file in the srcset, so a left-out
 * original is never downloaded, also by browsers without srcset.
 */
export function RichTextImage({ doc, alt }: { doc: Doc; alt: string }) {
  const list = richTextImageCandidates(doc)
  const widest = list.at(-1)
  const src = widest?.url ?? versioned(doc, asString(doc.url) ?? '')
  const srcSet = list.length > 1 ? list.map((c) => `${srcSetURL(c.url)} ${c.width}w`).join(', ') : undefined
  return (
    <>
      {/* React puts this once in the page's head, however many photos the page has. */}
      <style href={RICHTEXT_IMAGE_CLASS} precedence="default">
        {RICHTEXT_IMAGE_CSS}
      </style>
      <img
        alt={alt}
        className={RICHTEXT_IMAGE_CLASS}
        decoding="async"
        height={asNumber(doc.height)}
        loading="lazy"
        sizes={srcSet ? RICHTEXT_IMAGE_SIZES : undefined}
        src={src}
        srcSet={srcSet}
        width={asNumber(doc.width)}
      />
    </>
  )
}

type UploadArgs = { node: unknown }
type UploadConverter = (args: UploadArgs) => ReactNode

/**
 * The rich text converter for upload nodes. Photos render with `RichTextImage`. Other files keep
 * Payload's default output (a link to the file). An upload that is only an id renders nothing: the
 * document was not loaded, and the renderer never fetches it.
 */
export function uploadConverter(fallback: unknown): UploadConverter {
  return function renderUpload(args) {
    const node = args.node as UploadNode
    const doc = node.value
    if (!isDoc(doc) || !asString(doc.url)) return null
    if (!isImage(doc)) return typeof fallback === 'function' && asString(doc.mimeType) ? (fallback as UploadConverter)(args) : null
    const alt = asString(node.fields?.alt) ?? asString(doc.alt) ?? ''
    return <RichTextImage doc={doc} alt={alt} />
  }
}

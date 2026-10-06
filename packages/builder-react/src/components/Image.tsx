import { editableImage } from '../render/editable'
import type { BlockComponentProps } from '../render/types'
import { PlaceholderBox } from './placeholder'

export function isDoc(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string'
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined
const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

type Size = { url: string; width: number }

/**
 * `srcset` from Payload's image sizes (`doc.sizes`) plus the original. Only sizes with the
 * original's aspect ratio count (a square crop would distort the image). Undefined when there
 * is nothing to choose from.
 */
export function srcSetOf(doc: Record<string, unknown>): string | undefined {
  const width = asNumber(doc.width)
  const height = asNumber(doc.height)
  const sizes = doc.sizes
  if (!width || !height || typeof sizes !== 'object' || sizes === null) return undefined
  const ratio = width / height
  const found: Size[] = []
  for (const size of Object.values(sizes as Record<string, unknown>)) {
    if (typeof size !== 'object' || size === null) continue
    const s = size as Record<string, unknown>
    const url = asString(s.url)
    const w = asNumber(s.width)
    const h = asNumber(s.height)
    if (!url || !w || !h || w >= width) continue
    if (Math.abs(w / h - ratio) / ratio > 0.02) continue
    found.push({ url, width: w })
  }
  if (found.length === 0) return undefined
  const unique = new Map([...found, { url: doc.url as string, width }].map((s) => [s.width, s]))
  return [...unique.values()]
    .toSorted((a, b) => a.width - b.width)
    .map((s) => `${s.url.replaceAll(' ', '%20').replaceAll(',', '%2C')} ${s.width}w`)
    .join(', ')
}

export function Image({ props, className, attributes, mode }: BlockComponentProps) {
  const doc = props.image
  if (!isDoc(doc)) {
    // The upload is not loaded (or not set). Nothing on the site, a placeholder in the editor.
    if (mode !== 'canvas') return null
    return <PlaceholderBox attributes={{ ...attributes, ...editableImage(mode, 'image') }} className={className} label="Image" />
  }
  const srcSet = srcSetOf(doc)
  return (
    <img
      {...attributes}
      {...editableImage(mode, 'image')}
      className={className}
      src={doc.url as string}
      // `sizes="auto"` lets the browser use the rendered width (lazy images); 100vw elsewhere.
      {...(srcSet ? { srcSet, sizes: 'auto, 100vw' } : {})}
      alt={asString(props.alt) ?? asString(doc.alt) ?? ''}
      width={asNumber(doc.width)}
      height={asNumber(doc.height)}
      loading="lazy"
    />
  )
}

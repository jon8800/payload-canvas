import type { BlockComponentProps } from '../render/types'
import { PlaceholderBox } from './placeholder'

export function isDoc(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string'
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined
const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

export function Image({ props, className, attributes, mode }: BlockComponentProps) {
  const doc = props.image
  if (!isDoc(doc)) {
    // The upload is not loaded (or not set). Nothing on the site, a placeholder in the editor.
    if (mode !== 'canvas') return null
    return <PlaceholderBox attributes={attributes} className={className} label="Image" />
  }
  return (
    <img
      {...attributes}
      className={className}
      src={doc.url as string}
      alt={asString(props.alt) ?? asString(doc.alt) ?? ''}
      width={asNumber(doc.width)}
      height={asNumber(doc.height)}
      loading="lazy"
    />
  )
}

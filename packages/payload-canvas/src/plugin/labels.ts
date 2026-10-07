import type { CollectionConfig } from 'payload'

/** A static label as plain text: a string, or the "en" (else first) entry of a localized label. */
export function labelText(label: unknown): string | undefined {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const first = (label as Record<string, unknown>).en ?? Object.values(label)[0]
    if (typeof first === 'string') return first
  }
  return undefined
}

/** A collection's plural label as plain text (static labels only), else its slug in words ("blog-posts" -> "Blog posts"). */
export function collectionLabel(collection: Pick<CollectionConfig, 'slug' | 'labels'>): string {
  const label = labelText(collection.labels?.plural)
  if (label) return label
  const words = collection.slug.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

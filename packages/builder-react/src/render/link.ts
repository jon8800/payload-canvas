import type { LinkValue, ResolveLink } from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads a stored link group. Anything that is not an object becomes an empty link. */
export function toLinkValue(value: unknown): LinkValue {
  if (!isRecord(value)) return {}
  const reference = isRecord(value.reference) && typeof value.reference.relationTo === 'string'
    ? { relationTo: value.reference.relationTo, value: value.reference.value }
    : null
  return {
    type: value.type === 'url' || value.type === 'reference' ? value.type : null,
    url: typeof value.url === 'string' ? value.url : null,
    reference,
    newTab: value.newTab === true,
  }
}

/**
 * The default link resolver. URL links use the URL. Reference links use `/${slug}` when the
 * document is loaded and has a slug. Everything else has no href.
 */
export const defaultResolveLink: ResolveLink = (link) => {
  const type = link.type ?? (link.url ? 'url' : link.reference ? 'reference' : 'url')
  if (type === 'url') {
    const url = link.url?.trim()
    return url ? url : null
  }
  const doc = link.reference?.value
  if (!isRecord(doc) || typeof doc.slug !== 'string' || !doc.slug) return null
  return `/${doc.slug.replace(/^\/+/, '')}`
}

export type LinkAttributes = { href: string; target?: '_blank'; rel?: string }

/** `<a>` attributes for a link group, or `null` when it has no href. */
export function linkAttributes(value: unknown, resolveLink: ResolveLink): LinkAttributes | null {
  const link = toLinkValue(value)
  const href = resolveLink(link)
  if (!href) return null
  return link.newTab ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href }
}

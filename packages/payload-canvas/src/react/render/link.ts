import { isRecord } from './fields'
import type { LinkValue, ResolvedLink, ResolveLink } from './types'

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

/** Resolves a stored link group into plain data. RenderLayout calls it for every link group. */
export function resolveLinkValue(value: unknown, resolveLink: ResolveLink): ResolvedLink {
  const link = toLinkValue(value)
  const href = resolveLink(link) || null
  if (!href) return { ...link, href: null }
  return link.newTab ? { ...link, href, target: '_blank', rel: 'noopener noreferrer' } : { ...link, href }
}

export type LinkAttributes = { href: string; target?: '_blank'; rel?: string }

/** `<a>` attributes of a resolved link group (a block component's link prop), or `null` without an href. */
export function linkAttributes(value: unknown): LinkAttributes | null {
  if (!isRecord(value) || typeof value.href !== 'string' || !value.href) return null
  const attributes: LinkAttributes = { href: value.href }
  if (value.target === '_blank') attributes.target = '_blank'
  if (typeof value.rel === 'string' && value.rel) attributes.rel = value.rel
  return attributes
}

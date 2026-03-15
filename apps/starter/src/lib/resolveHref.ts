export type LinkReference = {
  relationTo?: string
  value?: { slug?: string } | string
}

export function resolveHref(
  type: 'internal' | 'external' | undefined,
  url: string | undefined,
  reference: LinkReference | undefined,
): string {
  if (type === 'external') return url || '#'

  if (!reference?.value || typeof reference.value === 'string') return '#'

  const slug = reference.value.slug
  if (!slug) return '#'

  if (reference.relationTo === 'posts') return `/blog/${slug}`
  return `/${slug}`
}

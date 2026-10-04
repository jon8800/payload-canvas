const collectionPrefixMap: Record<string, string> = {
  pages: '',
  posts: '/blog',
  'template-parts': '',
}

type Props = {
  collection: string
  slug: string
  req?: unknown
}

/**
 * The draft preview URL of a document. The preview route checks the admin session, so the URL
 * carries no secret.
 */
export function generatePreviewPath({ collection, slug }: Props): string {
  if (!slug) return ''

  const encodedSlug = encodeURIComponent(slug)
  const prefix = collectionPrefixMap[collection] || ''

  // Template parts always preview on homepage since they appear site-wide
  const path =
    collection === 'template-parts'
      ? '/'
      : slug === 'home'
        ? '/'
        : `${prefix}/${encodedSlug}`

  const params = new URLSearchParams({
    slug: encodedSlug,
    collection,
    path,
  })

  return `/next/preview?${params.toString()}`
}

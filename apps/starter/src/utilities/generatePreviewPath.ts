const collectionPrefixMap: Record<string, string> = {
  pages: '',
  posts: '/blog',
  'template-parts': '',
}

type Props = {
  collection: string
  slug: string
  req?: any
}

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
    previewSecret: process.env.PREVIEW_SECRET || '',
  })

  return `/next/preview?${params.toString()}`
}

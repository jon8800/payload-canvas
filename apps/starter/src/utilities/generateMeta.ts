import type { Metadata } from 'next'

import { mergeOpenGraph } from './mergeOpenGraph'
import { getServerSideURL } from './getURL'

type MetaImage = {
  url?: string | null
  sizes?: { og?: { url?: string | null } }
}

type MetaDoc = {
  meta?: {
    title?: string | null
    description?: string | null
    image?: MetaImage | string | number | null
  }
  slug?: string | string[] | null
}

const getImageURL = (image?: MetaDoc['meta'] extends infer T ? (T extends { image?: infer I } ? I : never) : never) => {
  const serverUrl = getServerSideURL()

  let url = serverUrl + '/og-image.webp'

  if (image && typeof image === 'object' && 'url' in image) {
    const img = image as MetaImage
    const ogUrl = img.sizes?.og?.url

    url = ogUrl ? serverUrl + ogUrl : serverUrl + (img.url ?? '')
  }

  return url
}

export const generateMeta = async (args: { doc: MetaDoc | null }): Promise<Metadata> => {
  const { doc } = args

  const ogImage = getImageURL(doc?.meta?.image)

  const title = doc?.meta?.title
    ? doc?.meta?.title + ' | Payload Starter'
    : 'Payload Starter'

  return {
    description: doc?.meta?.description,
    openGraph: mergeOpenGraph({
      description: doc?.meta?.description || '',
      images: ogImage
        ? [
            {
              url: ogImage,
            },
          ]
        : undefined,
      title,
      url: Array.isArray(doc?.slug) ? doc?.slug.join('/') : '/',
    }),
    title,
  }
}

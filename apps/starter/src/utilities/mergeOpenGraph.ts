import type { Metadata } from 'next'

// No default image: the starter ships none, and a broken og:image is worse than no image.
const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
}

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return { ...defaultOpenGraph, ...og }
}

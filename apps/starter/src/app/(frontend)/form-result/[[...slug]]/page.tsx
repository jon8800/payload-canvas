// A page with the result of a form sent without JavaScript (forms/submit/route.ts). proxy.ts
// rewrites only addresses with `?form-result=` here, so the site's pages stay static. The page
// renders as usual; the form the result belongs to shows its confirmation or its problems.
import type { Metadata } from 'next'
import { readFormResult } from 'payload-canvas/forms'
import { FormResultProvider } from '@/components/blocks/FormResult'
import HomePage, { generateMetadata as homeMetadata } from '../../page'
import SlugPage, { generateMetadata as slugMetadata } from '../../[...slug]/page'
import BlogPost, { generateMetadata as blogMetadata } from '../../blog/[slug]/page'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const isPost = (slug: string[]) => slug.length === 2 && slug[0] === 'blog'

export default async function FormResultPage({ params, searchParams }: Props) {
  const { slug = [] } = await params
  const result = readFormResult(await searchParams)
  return (
    <FormResultProvider result={result}>
      {slug.length === 0 ? <HomePage /> : isPost(slug) ? <BlogPost params={Promise.resolve({ slug: slug[1]! })} /> : <SlugPage params={Promise.resolve({ slug })} />}
    </FormResultProvider>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug = [] } = await params
  const meta = slug.length === 0 ? await homeMetadata() : isPost(slug) ? await blogMetadata({ params: Promise.resolve({ slug: slug[1]! }) }) : await slugMetadata({ params: Promise.resolve({ slug }) })
  // A result view is not a page of its own.
  return { ...meta, robots: { index: false, follow: false } }
}

import { Suspense } from 'react'
import Link from 'next/link'
import { draftMode, headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { SiteFrame } from '@/components/BuilderContent'

/**
 * How a site page answers a missing document.
 *
 * Next 16 limitation: Next cannot server-render `notFound()` thrown by a page. Its not-found
 * boundary works only in the browser, so the server sends an empty error document
 * (`<html id="__next_error__">`) and the browser then renders `(frontend)/not-found.tsx`.
 * `app/global-not-found.tsx` does not help: it covers only URLs that match no route, and the
 * `[...slug]` catch-all matches every URL.
 * - `true` (chosen): `notFound()` at once. Real HTTP 404 status for crawlers, link checkers and
 *   monitoring; the styled page (site header and footer) needs JavaScript.
 * - `false`: the page renders the 404 content itself and throws `notFound()` inside a Suspense
 *   boundary. Complete HTML without JavaScript and `noindex`, but HTTP status 200 (a soft 404).
 */
const SITE_404_STATUS = true

/** The 404 body inside the site frame (header part, footer part). Server-rendered. */
export async function NotFoundContent({ pathname }: { pathname?: string }) {
  const { isEnabled: draft } = await draftMode()
  const path = pathname ?? ((await headers()).get('x-pathname') || '/')

  return (
    <SiteFrame pathname={path} draft={draft}>
      <section className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Error 404</p>
        <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">This page does not exist</h1>
        <p className="text-lg text-muted-foreground">The link may be old, or the address may have a typo.</p>
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Go to the home page
        </Link>
      </section>
    </SiteFrame>
  )
}

function NotFoundSignal(): null {
  notFound()
}

/** What a site page returns for a missing document. See `SITE_404_STATUS`. */
export function MissingPage({ pathname }: { pathname: string }) {
  if (SITE_404_STATUS) notFound()
  return (
    <>
      <NotFoundContent pathname={pathname} />
      <Suspense fallback={null}>
        <NotFoundSignal />
      </Suspense>
    </>
  )
}

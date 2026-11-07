import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { LOCALE_HEADER, localeOfPath } from '@/lib/locales'
import { findRedirect, redirectTable } from '@/lib/redirects'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Redirects from the redirects collection, kept in memory (see lib/redirects.ts).
  const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || request.nextUrl.origin
  const table = await redirectTable(serverURL)
  const redirect = table ? findRedirect(table, pathname) : null
  if (redirect) return NextResponse.redirect(new URL(redirect.to, request.url), redirect.status)

  // Pass the path on the request (not the response) so server components can read it via headers()
  const requestHeaders = new Headers(request.headers)
  // Translation demo (BUILDER_I18N_DEMO=1): /de/about renders /about in German.
  const locale = localeOfPath(pathname)
  if (locale) {
    const path = pathname.slice(locale.length + 1) || '/'
    requestHeaders.set('x-pathname', path)
    requestHeaders.set(LOCALE_HEADER, locale)
    const url = request.nextUrl.clone()
    url.pathname = path
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  }
  requestHeaders.delete(LOCALE_HEADER)
  requestHeaders.set('x-pathname', pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!admin|api|_next/static|_next/image|favicon).*)'],
}

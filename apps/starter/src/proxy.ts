import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { LOCALE_HEADER, localeOfPath } from '@/lib/locales'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Check for redirects via Payload REST API
  const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || request.nextUrl.origin
  try {
    const redirectRes = await fetch(
      `${serverURL}/api/redirects?where[from][equals]=${encodeURIComponent(pathname)}&limit=1`,
      { next: { revalidate: 60 } },
    )
    if (redirectRes.ok) {
      const { docs } = await redirectRes.json()
      if (docs?.[0]) {
        const redirect = docs[0]
        const to =
          redirect.to?.url ||
          (redirect.to?.reference?.value?.slug
            ? (redirect.to.reference.relationTo === 'posts' ? '/blog/' : '/') +
              redirect.to.reference.value.slug
            : null)
        if (to) {
          return NextResponse.redirect(
            new URL(to, request.url),
            redirect.type === '301' ? 301 : 302,
          )
        }
      }
    }
  } catch {
    // Redirect lookup failed -- continue without redirect
  }

  // Check regex redirects if no exact match found
  try {
    const regexRes = await fetch(
      `${serverURL}/api/redirects?where[isRegex][equals]=true&limit=100`,
      { next: { revalidate: 60 } },
    )
    if (regexRes.ok) {
      const { docs } = await regexRes.json()
      for (const redirect of docs || []) {
        try {
          const regex = new RegExp(redirect.from)
          if (regex.test(pathname)) {
            const to = redirect.to?.url || pathname.replace(regex, redirect.to?.url || '')
            if (to && to !== pathname) {
              return NextResponse.redirect(
                new URL(to, request.url),
                redirect.type === '301' ? 301 : 302,
              )
            }
          }
        } catch {
          // Invalid regex -- skip
        }
      }
    }
  } catch {
    // Regex redirect lookup failed -- continue
  }

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

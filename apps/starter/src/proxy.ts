import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  const response = NextResponse.next()
  response.headers.set('x-pathname', pathname)
  return response
}

export const config = {
  matcher: ['/((?!admin|api|_next/static|_next/image|favicon).*)'],
}

// Redirects for the proxy (`src/proxy.ts`), kept in memory. Without it every page view asked the
// REST API twice. Next ignores `fetch` caching options in the proxy, so the proxy keeps the
// table itself: it loads every redirect at once, uses the table for a minute, then loads it again
// in the background while requests keep using the old one. A changed redirect applies within
// about a minute. No server imports: the proxy bundles this file.

/** The search parameter that fills in a new redirect's "From" field: `/admin/collections/redirects/create?from=/old` (src/admin/redirects/FromField.tsx). */
export const FROM_PARAM = 'from'

/** A document of the redirects plugin's collection (depth 1), with the starter's `isRegex` field. */
export type RedirectDoc = {
  from?: string | null
  to?: {
    url?: string | null
    reference?: { relationTo?: string; value?: { slug?: string | null } | string | number | null } | null
  } | null
  type?: string | null
  isRegex?: boolean | null
}

export type RedirectTable = {
  /** Plain redirects by their `from` path. */
  exact: Map<string, RedirectDoc>
  /** Regex redirects, in the collection's order. */
  patterns: Array<{ regex: RegExp; redirect: RedirectDoc }>
}

/** Where a plain redirect goes: its URL, or the path of the page or post it references. */
function targetOf(redirect: RedirectDoc): string | null {
  if (redirect.to?.url) return redirect.to.url
  const reference = redirect.to?.reference
  const value = reference?.value
  const slug = typeof value === 'object' && value !== null ? value.slug : null
  if (!slug) return null
  return (reference?.relationTo === 'posts' ? '/blog/' : '/') + slug
}

export function buildRedirectTable(docs: readonly RedirectDoc[]): RedirectTable {
  const table: RedirectTable = { exact: new Map(), patterns: [] }
  for (const redirect of docs) {
    if (!redirect.from) continue
    if (!redirect.isRegex) {
      if (!table.exact.has(redirect.from)) table.exact.set(redirect.from, redirect)
      continue
    }
    try {
      table.patterns.push({ regex: new RegExp(redirect.from), redirect })
    } catch {
      // An invalid pattern never matches.
    }
  }
  return table
}

const status = (redirect: RedirectDoc) => (redirect.type === '301' ? 301 : 302)

/** The redirect for a path: a plain one first, then the first regex that matches. */
export function findRedirect(table: RedirectTable, pathname: string): { to: string; status: 301 | 302 } | null {
  const exact = table.exact.get(pathname)
  const exactTarget = exact ? targetOf(exact) : null
  if (exact && exactTarget) return { to: exactTarget, status: status(exact) }
  for (const { regex, redirect } of table.patterns) {
    if (!regex.test(pathname)) continue
    const to = redirect.to?.url || pathname.replace(regex, '')
    if (to && to !== pathname) return { to, status: status(redirect) }
  }
  return null
}

const FRESH_MS = 60_000
/** After a failed load, wait this long before the next try. */
const RETRY_MS = 10_000

let table: RedirectTable | null = null
let nextLoadAt = 0
let loading: Promise<RedirectTable | null> | null = null

async function load(serverURL: string): Promise<RedirectTable | null> {
  try {
    const res = await fetch(`${serverURL}/api/redirects?pagination=false&depth=1`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { docs } = (await res.json()) as { docs?: RedirectDoc[] }
    table = buildRedirectTable(docs ?? [])
    nextLoadAt = Date.now() + FRESH_MS
  } catch {
    // Keep the last table (or none) and try again soon.
    nextLoadAt = Date.now() + RETRY_MS
  }
  return table
}

/**
 * The redirect table. Fresh: at once. Stale: the old table at once, and a new one loads in the
 * background. Only the first request of a process (or one after failed loads) waits for it.
 */
export async function redirectTable(serverURL: string): Promise<RedirectTable | null> {
  if (Date.now() < nextLoadAt) return table
  loading ??= load(serverURL).finally(() => {
    loading = null
  })
  return table ?? loading
}

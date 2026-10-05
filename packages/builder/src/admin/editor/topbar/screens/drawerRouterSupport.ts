// Decides whether the drawer router (DrawerRouter.tsx) can work, and which link clicks it takes.
// Pure: no Next and no React imports, so the tests run in Node.

/** The Next contexts the drawer router must provide. `NavigationPromisesContext` is optional: only development builds read it. */
export const REQUIRED_CONTEXTS = ['AppRouterContext', 'PathnameContext', 'SearchParamsContext', 'PathParamsContext'] as const

export type RouterSupport = { ok: true } | { ok: false; reason: string }

const REACT_CONTEXT = Symbol.for('react.context')

/** True for an object made by React's `createContext`. */
export function isReactContext(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { $$typeof?: unknown }).$$typeof === REACT_CONTEXT
}

/**
 * Whether the drawer router can run with these exports of Next's internal modules. Not ok when a
 * context is missing or is no longer a React context, or when `disabled` (the development flag).
 */
export function routerSupport(exports: Record<string, unknown>, disabled = false): RouterSupport {
  if (disabled) return { ok: false, reason: 'the development flag turned it off' }
  const missing = REQUIRED_CONTEXTS.filter((name) => !isReactContext(exports[name]))
  if (missing.length > 0) return { ok: false, reason: `Next no longer exports ${missing.join(', ')}` }
  return { ok: true }
}

/**
 * True when Next's hooks, called inside the drawer router, return the drawer's values. False
 * means Next reads its route from somewhere else now, and screen navigation would leave the page.
 */
export function hooksFollow(
  expected: { pathname: string; search: string; push: unknown },
  actual: { pathname: string | null; search: string | null; push: unknown },
): boolean {
  return actual.pathname === expected.pathname && actual.search === new URLSearchParams(expected.search).toString() && actual.push === expected.push
}

export type LinkClick = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }
export type LinkTarget = { href: string | null; target: string; download: boolean }

/**
 * The href of a link click the drawer takes over, or null to leave the click alone: a click with
 * a modifier key or another button (new tab), a link that opens another window, a download, a
 * link on the page itself (`#…`), or a link to another site.
 */
export function drawerLinkHref(click: LinkClick, link: LinkTarget | null, origin: string): string | null {
  if (!link?.href || click.defaultPrevented || click.button !== 0) return null
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null
  if (link.download || (link.target !== '' && link.target !== '_self')) return null
  if (link.href.startsWith('#')) return null
  let url: URL
  try {
    url = new URL(link.href, `${origin}/`)
  } catch {
    return null
  }
  return url.origin === origin ? link.href : null
}

const DEV_FLAG = 'payload-builder:drawer-router'

/**
 * Development only: `localStorage['payload-builder:drawer-router'] = 'off'` turns the drawer
 * router off, to check the fallback (the screens open as normal admin pages).
 */
export function disabledByDevFlag(): boolean {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DEV_FLAG) === 'off'
  } catch {
    return false
  }
}

const UNDEFINED_LOCALE = /([?&])locale=undefined(&|$)/

/** A URL without the `locale=undefined` that Payload's API screen adds when the app has no locales. */
export function withoutUndefinedLocale(url: string): string {
  return url.replace(UNDEFINED_LOCALE, (_, before: string, after: string) => (after ? before : ''))
}

'use client'

// A router for Payload screens shown inside a builder drawer.
//
// Payload's Versions, Version and API screens navigate with Next's router: a version row is a
// link, pagination and the comparison select push new search params, Restore pushes the edit
// view. In the drawer, each of these would leave the builder. This provider gives the screens a
// router of their own, so a navigation changes what the drawer shows instead of the page.
//
// Next has no public API for this (Next 16.3: `<Link onNavigate>` is per link, and Payload's
// screens call `useRouter`, `usePathname` and `useSearchParams` themselves). So this file
// overrides the contexts those hooks read, the way Storybook's Next.js integration mocks the
// router. The Next internals used, verified with Next 16.3.8
// (`next/dist/client/components/navigation.js`):
//
// - `next/dist/shared/lib/app-router-context.shared-runtime`: `AppRouterContext` (`useRouter`)
// - `next/dist/shared/lib/hooks-client-context.shared-runtime`: `PathnameContext` (`usePathname`),
//   `SearchParamsContext` (`useSearchParams`), `PathParamsContext` (`useParams`), and
//   `NavigationPromisesContext` (development builds read the route from it first; optional)
//
// Only this file imports them. It fails safe: a missing context, hooks that no longer read the
// drawer's values (a probe checks on every screen), or an error while a screen renders makes
// `onUnavailable` fire, and the screen opens as a normal admin page. If Next deletes one of the
// modules outright, the build fails here, in this one file. A capture-phase click listener also
// keeps plain link clicks in the drawer, as a second line of defence.

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import * as appRouterModule from 'next/dist/shared/lib/app-router-context.shared-runtime'
import * as hooksModule from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Component, useEffect, useMemo, useRef, type Context, type ReactNode } from 'react'

import { disabledByDevFlag, drawerLinkHref, hooksFollow, isReactContext, routerSupport, type RouterSupport } from './drawerRouterSupport'

export type DrawerNavigation = { kind: 'push' | 'replace'; href: string } | { kind: 'back' } | { kind: 'refresh' }

// Read through a plain record: an export that Next removes is `undefined` here, not a crash.
const internals: Record<string, unknown> = { ...appRouterModule, ...hooksModule }
const contexts = internals as {
  AppRouterContext: Context<AppRouterInstance | null>
  PathnameContext: Context<string | null>
  SearchParamsContext: Context<URLSearchParams | null>
  PathParamsContext: Context<Record<string, string | string[]> | null>
  NavigationPromisesContext?: Context<null>
}
const withPromises = isReactContext(internals.NavigationPromisesContext)

/** Set when the probe found that Next's hooks ignore the override: later screens open as pages at once. */
let broken: string | null = null

/** Whether screens can open in the drawer now. */
export function drawerRouterSupport(): RouterSupport {
  if (broken) return { ok: false, reason: broken }
  return routerSupport(internals, disabledByDevFlag())
}

let warned = false

/** One console warning in development when the screens fall back to admin pages. */
export function warnDrawerFallback(reason: string) {
  if (warned || process.env.NODE_ENV === 'production') return
  warned = true
  console.warn(`[builder] Versions and API screens open as admin pages, not in a drawer: ${reason}. See DrawerRouter.tsx.`)
}

export function DrawerRouter({
  pathname,
  search,
  segments,
  onNavigate,
  onUnavailable,
  children,
}: {
  /** The admin path the screen believes it is on, e.g. `/admin/collections/pages/3/versions`. */
  pathname: string
  /** Its search string, e.g. `?page=2`. */
  search: string
  /** Route params of that path (`segments` of Payload's catch-all admin route). */
  segments: string[]
  onNavigate: (navigation: DrawerNavigation) => void
  /** The override does not work (see the top of this file): open the screen as a page instead. */
  onUnavailable: (reason: string) => void
  children: ReactNode
}) {
  const router = useMemo<AppRouterInstance>(
    () => ({
      back: () => onNavigate({ kind: 'back' }),
      forward: () => {},
      refresh: () => onNavigate({ kind: 'refresh' }),
      push: (href) => onNavigate({ kind: 'push', href }),
      replace: (href) => onNavigate({ kind: 'replace', href }),
      prefetch: () => {},
      // `useRouter` replaces it with the id of the page around the drawer.
      bfcacheId: '',
    }),
    [onNavigate],
  )
  const searchParams = useMemo(() => new URLSearchParams(search), [search])
  const params = useMemo(() => ({ segments }), [segments])

  // Plain link clicks stay in the drawer even if Next's `<Link>` stops using the router above.
  const screen = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = screen.current
    if (!el) return
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      const link = anchor ? { href: anchor.getAttribute('href'), target: anchor.getAttribute('target') ?? '', download: anchor.hasAttribute('download') } : null
      const href = drawerLinkHref(event, link, window.location.origin)
      if (!href) return
      event.preventDefault()
      event.stopPropagation()
      onNavigate({ kind: 'push', href })
    }
    el.addEventListener('click', onClick, true)
    return () => el.removeEventListener('click', onClick, true)
  }, [onNavigate])

  const support = drawerRouterSupport()
  const unavailable = support.ok ? null : support.reason
  useEffect(() => {
    if (unavailable) onUnavailable(unavailable)
  }, [unavailable, onUnavailable])
  if (unavailable) return null

  const { AppRouterContext, PathnameContext, SearchParamsContext, PathParamsContext, NavigationPromisesContext } = contexts
  const probed = (
    <Probe pathname={pathname} search={search} push={router.push} onUnavailable={onUnavailable}>
      {children}
    </Probe>
  )
  return (
    <div ref={screen} className="builder-screen-drawer__screen">
      <Boundary onError={onUnavailable}>
        <AppRouterContext value={router}>
          <PathnameContext value={pathname}>
            <SearchParamsContext value={searchParams}>
              <PathParamsContext value={params}>
                {/* In development Next reads the path from these promises first: none here. */}
                {withPromises && NavigationPromisesContext ? <NavigationPromisesContext value={null}>{probed}</NavigationPromisesContext> : probed}
              </PathParamsContext>
            </SearchParamsContext>
          </PathnameContext>
        </AppRouterContext>
      </Boundary>
    </div>
  )
}

/**
 * Lets `intercept` take some `router.push` / `router.replace` calls of the screens inside (it
 * returns true when it took one). The other calls go to the page's own router. The settings
 * drawer uses it: the "Go back" of Payload's "Document locked" dialog pushes the collection list,
 * which would leave the builder. Without the context (a Next upgrade) the calls are not taken.
 */
export function RouterIntercept({ intercept, children }: { intercept: (href: string) => boolean; children: ReactNode }) {
  const router = useRouter()
  const wrapped = useMemo<AppRouterInstance>(
    () => ({
      ...router,
      push: (href, options) => {
        if (!intercept(href)) router.push(href, options)
      },
      replace: (href, options) => {
        if (!intercept(href)) router.replace(href, options)
      },
    }),
    [router, intercept],
  )
  if (!isReactContext(internals.AppRouterContext)) return children
  const { AppRouterContext } = contexts
  return <AppRouterContext value={wrapped}>{children}</AppRouterContext>
}

/** Renders the screen only when Next's hooks return the drawer's values. */
function Probe({
  pathname,
  search,
  push,
  onUnavailable,
  children,
}: {
  pathname: string
  search: string
  push: AppRouterInstance['push']
  onUnavailable: (reason: string) => void
  children: ReactNode
}) {
  const router = useRouter()
  const actualPath = usePathname()
  const actualSearch = useSearchParams()
  const ok = hooksFollow({ pathname, search, push }, { pathname: actualPath, search: actualSearch?.toString() ?? null, push: router.push })
  useEffect(() => {
    if (ok) return
    broken = 'Next’s navigation hooks no longer read the overridden contexts'
    onUnavailable(broken)
  }, [ok, onUnavailable])
  return ok ? children : null
}

/** A screen (or the override) threw: open it as a page instead. */
class Boundary extends Component<{ onError: (reason: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(`the screen threw: ${error instanceof Error ? error.message : String(error)}`)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

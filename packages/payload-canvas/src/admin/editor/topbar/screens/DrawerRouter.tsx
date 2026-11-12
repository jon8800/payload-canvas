'use client'

// A router for Payload screens shown inside a builder drawer.
//
// Payload's Versions, Version and API screens navigate with the admin router: a version row is a
// link, pagination and the comparison select push new search params, Restore pushes the edit
// view. In the drawer, each of these would leave the builder. This provider gives the screens a
// router of their own, so a navigation changes what the drawer shows instead of the page.
//
// Payload 4's admin UI reads its router from `RouterAdapterContext` (`@payloadcms/ui`): its
// `useRouter`, `usePathname`, `useSearchParams` and `useParams` hooks and `PayloadLink` all read
// that one context. This file provides that context again inside the drawer, with the drawer's
// path and a router that calls `onNavigate`.
//
// It fails safe: a missing context, hooks that do not read the drawer's values (a probe checks on
// every screen), or an error while a screen renders makes `onUnavailable` fire, and the screen
// opens as a normal admin page. A capture-phase click listener also keeps plain link clicks in
// the drawer (the Link of the page's adapter navigates on its own).

import { RouterAdapterContext, usePathname, useRouter, useSearchParams, type RouterAdapterContextValue } from '@payloadcms/ui'
import { Component, use, useEffect, useMemo, useRef, type ReactNode } from 'react'

import { disabledByDevFlag, drawerLinkHref, hooksFollow, isReactContext, routerSupport, type RouterSupport } from './drawerRouterSupport'

export type DrawerNavigation = { kind: 'push' | 'replace'; href: string } | { kind: 'back' } | { kind: 'refresh' }

type AdapterRouter = RouterAdapterContextValue['router']

/** Set when the probe found that the hooks ignore the override: later screens open as pages at once. */
let broken: string | null = null

/** Whether screens can open in the drawer now. */
export function drawerRouterSupport(): RouterSupport {
  if (broken) return { ok: false, reason: broken }
  return routerSupport({ RouterAdapterContext }, disabledByDevFlag())
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
  // The page's adapter: the drawer keeps its Link component.
  const page = use(RouterAdapterContext) as RouterAdapterContextValue | null
  const router = useMemo<AdapterRouter>(
    () => ({
      back: () => onNavigate({ kind: 'back' }),
      refresh: () => onNavigate({ kind: 'refresh' }),
      push: (href) => onNavigate({ kind: 'push', href }),
      replace: (href) => onNavigate({ kind: 'replace', href }),
    }),
    [onNavigate],
  )
  const value = useMemo<RouterAdapterContextValue | null>(
    () => (page ? { Link: page.Link, params: { segments }, pathname, router, searchParams: new URLSearchParams(search) } : null),
    [page, segments, pathname, router, search],
  )

  // Plain link clicks stay in the drawer: the Link component of the page's adapter navigates itself.
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
  const unavailable = !support.ok ? support.reason : value ? null : 'the admin router adapter is missing'
  useEffect(() => {
    if (unavailable) onUnavailable(unavailable)
  }, [unavailable, onUnavailable])
  if (unavailable || !value) return null

  return (
    <div ref={screen} className="builder-screen-drawer__screen">
      <Boundary onError={onUnavailable}>
        <RouterAdapterContext value={value}>
          <Probe pathname={pathname} search={search} push={router.push} onUnavailable={onUnavailable}>
            {children}
          </Probe>
        </RouterAdapterContext>
      </Boundary>
    </div>
  )
}

/**
 * Lets `intercept` take some `router.push` / `router.replace` calls of the screens inside (it
 * returns true when it took one). The other calls go to the page's own router. The settings
 * drawer uses it: the "Go back" of Payload's "Document locked" dialog pushes the collection list,
 * which would leave the builder. Without the adapter context the calls are not taken.
 */
export function RouterIntercept({ intercept, children }: { intercept: (href: string) => boolean; children: ReactNode }) {
  const page = use(RouterAdapterContext) as RouterAdapterContextValue | null
  const value = useMemo<RouterAdapterContextValue | null>(() => {
    if (!page) return null
    const { router } = page
    return {
      ...page,
      router: {
        ...router,
        push: (href, options) => {
          if (!intercept(href)) router.push(href, options)
        },
        replace: (href, options) => {
          if (!intercept(href)) router.replace(href, options)
        },
      },
    }
  }, [page, intercept])
  if (!value || !isReactContext(RouterAdapterContext)) return children
  return <RouterAdapterContext value={value}>{children}</RouterAdapterContext>
}

/** Renders the screen only when the admin router hooks return the drawer's values. */
function Probe({
  pathname,
  search,
  push,
  onUnavailable,
  children,
}: {
  pathname: string
  search: string
  push: AdapterRouter['push']
  onUnavailable: (reason: string) => void
  children: ReactNode
}) {
  const router = useRouter()
  const actualPath = usePathname()
  const actualSearch = useSearchParams()
  const ok = hooksFollow({ pathname, search, push }, { pathname: actualPath, search: actualSearch?.toString() ?? null, push: router.push })
  useEffect(() => {
    if (ok) return
    broken = 'the admin router hooks no longer read the overridden context'
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

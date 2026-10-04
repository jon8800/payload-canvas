'use client'

// A router for Payload screens shown inside a builder drawer.
//
// Payload's Versions, Version and API screens navigate with Next's router: a version row is a
// link, pagination and the comparison select push new search params, Restore pushes the edit
// view. In the drawer, each of these would leave the builder. This provider gives the screens a
// router of their own, so a navigation changes what the drawer shows instead of the page.
//
// Next has no public API for this. `useRouter`, `usePathname`, `useSearchParams` and `useParams`
// read the contexts below, which Next ships as shared runtime modules for exactly this kind of
// override (Storybook's Next.js integration mocks the router the same way). Only this file
// imports them, so a Next upgrade that moves them breaks one file.

import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  NavigationPromisesContext,
  PathnameContext,
  PathParamsContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import { useMemo, type ReactNode } from 'react'

export type DrawerNavigation = { kind: 'push' | 'replace'; href: string } | { kind: 'back' } | { kind: 'refresh' }

export function DrawerRouter({
  pathname,
  search,
  segments,
  onNavigate,
  children,
}: {
  /** The admin path the screen believes it is on, e.g. `/admin/collections/pages/3/versions`. */
  pathname: string
  /** Its search string, e.g. `?page=2`. */
  search: string
  /** Route params of that path (`segments` of Payload's catch-all admin route). */
  segments: string[]
  onNavigate: (navigation: DrawerNavigation) => void
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
  return (
    <AppRouterContext value={router}>
      <PathnameContext value={pathname}>
        <SearchParamsContext value={searchParams}>
          <PathParamsContext value={params}>
            {/* In development Next reads the path from these promises first: none here. */}
            <NavigationPromisesContext value={null}>{children}</NavigationPromisesContext>
          </PathParamsContext>
        </SearchParamsContext>
      </PathnameContext>
    </AppRouterContext>
  )
}

'use client'

// Payload's Versions, Version (compare and restore) and API screens, in a drawer over the builder.
//
// Payload renders them on the server through its public `renderDocument` server function: the
// same one its document drawer uses, with `paramsOverride` set to the screen's admin path. The
// screens navigate inside the drawer (DrawerRouter.tsx). Back returns to the last screen. If the
// drawer router cannot work (a Next upgrade), the screen opens as a normal admin page instead.
//
// Restore goes through the builder, not through Payload's Restore button: the live session owns
// the layout, so it must reset the session for every editor (live/document.ts). The drawer hides
// Payload's button and shows its own in the header.

import { ConfirmationModal, Drawer, Gutter, ShimmerEffect, useConfig, useDrawerSlug, useModal, useServerFunctions } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'

import { Icon } from '../../icons'
import { useRuntime } from '../../runtime'
import { useEditor } from '../../store'
import { useModalA11y } from '../../ui/modalA11y'
import { useValue } from '../../valueStore'
import type { DocumentScreen } from '../document'
import { DrawerRouter, drawerRouterSupport, warnDrawerFallback, type DrawerNavigation } from './DrawerRouter'
import { withoutUndefinedLocale } from './drawerRouterSupport'
import './screens.scss'

/** A screen below the document's admin path: `['versions']`, `['versions', id]` or `['api']`. */
type Route = { path: string[]; search: string }

const RESTORE_SLUG = 'builder-restore-version'

/**
 * Payload's API screen builds its URL with `locale=${code}`, and an app without localization has
 * no locale code: the URL shows `locale=undefined`. Payload offers no way to leave it out, so the
 * drawer cleans the shown link, and the copy button's text right after Payload copies it.
 */
function useCleanApiUrl(body: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = body.current
    if (!enabled || !el) return
    const clean = () => {
      for (const link of el.querySelectorAll<HTMLAnchorElement>('a[href*="locale=undefined"]')) {
        const href = withoutUndefinedLocale(link.getAttribute('href') ?? '')
        link.setAttribute('href', href)
        if (link.textContent?.includes('locale=undefined')) link.textContent = withoutUndefinedLocale(link.textContent)
      }
    }
    clean()
    const observer = new MutationObserver(clean)
    observer.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href'] })
    // The copy button next to the URL copies Payload's own value: copy the clean link after it.
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const box = target?.closest('button') ? target.closest('[class*="api-url"]') : null
      const link = box?.querySelector<HTMLAnchorElement>('a[href]')
      if (!link) return
      const url = link.getAttribute('href') ?? ''
      window.setTimeout(() => void navigator.clipboard?.writeText(url).catch(() => {}), 0)
    }
    el.addEventListener('click', onClick)
    return () => {
      observer.disconnect()
      el.removeEventListener('click', onClick)
    }
  }, [body, enabled])
}

function titleOf(route: Route | undefined): string {
  if (!route) return ''
  if (route.path[0] === 'api') return 'API'
  if (route.path[0] === 'versions' && route.path[1]) return 'Version'
  return 'Versions'
}

/** Opens on `runtime.doc.openScreen(…)`. Mounted once, in the top bar. */
export function ScreenDrawer() {
  const runtime = useRuntime()
  const meta = useValue(runtime.doc.meta)
  const busy = useValue(runtime.doc.busy)
  const { collection, id } = meta
  const slug = useDrawerSlug('builder-screen')
  const { openModal, closeModal, modalState } = useModal()
  const isOpen = Boolean(modalState[slug]?.isOpen)
  useModalA11y(RESTORE_SLUG, { alert: true })
  const { renderDocument } = useServerFunctions()
  const router = useRouter()
  const {
    config: { routes, localization },
  } = useConfig()
  // The locale the canvas shows: the API screen opens with it (localized apps only).
  const locale = useEditor(runtime.store, (state) => state.locale)
  const admin = routes.admin === '/' ? '' : routes.admin
  const docPath = `${admin}/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`

  // The screens visited since the drawer opened. The last one shows. A copy of the last route
  // loads it again (router.refresh()).
  const [history, setHistory] = useState<Route[]>([])
  const current = history.at(-1)
  const [shown, setShown] = useState<{ route: Route; node: ReactNode } | null>(null)
  const [failedRoute, setFailedRoute] = useState<Route | null>(null)
  const failed = current !== undefined && failedRoute === current
  const loading = current !== undefined && !failed && shown?.route !== current
  const reload = useCallback(() => setHistory((list) => [...list.slice(0, -1), ...list.slice(-1).map((route) => ({ ...route }))]), [])

  // Payload's list writes its query into the page URL (history.replaceState, `?limit=10`). The
  // builder's own URL comes back when the drawer closes.
  const pageUrl = useRef<string | null>(null)

  // Leaves the builder for another page. The builder's own URL goes back first, so the browser's
  // Back button returns to the builder.
  const leave = useCallback(
    (url: URL) => {
      const restore = pageUrl.current
      pageUrl.current = null
      if (restore !== null && `${window.location.pathname}${window.location.search}` !== restore) window.history.replaceState(window.history.state, '', restore)
      closeModal(slug)
      if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}`)
      else window.location.assign(url.href)
    },
    [closeModal, slug, router],
  )
  // The drawer router does not work: the screen opens as a normal admin page.
  const fallBack = useCallback(
    (reason: string, route: Route) => {
      warnDrawerFallback(reason)
      leave(new URL(`${docPath}/${route.path.map(encodeURIComponent).join('/')}${route.search}`, window.location.origin))
    },
    [docPath, leave],
  )

  const open = useEffectEvent((screen: DocumentScreen) => {
    const support = drawerRouterSupport()
    if (!support.ok) {
      fallBack(support.reason, { path: [screen], search: '' })
      return
    }
    pageUrl.current ??= `${window.location.pathname}${window.location.search}`
    const known = localization && locale && localization.localeCodes.includes(locale)
    setHistory([{ path: [screen], search: screen === 'api' && known ? `?${new URLSearchParams({ locale })}` : '' }])
    openModal(slug)
  })
  useEffect(() => {
    const url = pageUrl.current
    if (isOpen || url === null) return
    pageUrl.current = null
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(window.history.state, '', url)
  }, [isOpen])
  useEffect(() => runtime.doc.screenRequest.subscribe(() => {
    const request = runtime.doc.screenRequest.get()
    if (request) open(request.screen)
  }), [runtime])

  // Closed: forget the screens, so the next open starts fresh.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (!isOpen) {
      setHistory([])
      setShown(null)
    }
  }

  useEffect(() => {
    if (!current) return
    let stale = false
    // Numeric ids go to Payload as numbers (the app's ID type can be `number`).
    const docID = /^\d+$/.test(id) ? Number(id) : id
    void renderDocument({
      collectionSlug: collection,
      docID,
      drawerSlug: slug,
      disableActions: true,
      paramsOverride: { segments: ['collections', collection, id, ...current.path] },
      searchParams: Object.fromEntries(new URLSearchParams(current.search)),
      redirectAfterDelete: false,
      redirectAfterDuplicate: false,
      redirectAfterRestore: false,
    }).then((result) => {
      if (stale) return
      if (!result?.Document) {
        setFailedRoute(current)
        return
      }
      setShown({ route: current, node: result.Document })
    })
    return () => {
      stale = true
    }
  }, [current, collection, id, slug, renderDocument])

  const shownRoute = shown?.route
  const navigate = useCallback(
    (navigation: DrawerNavigation) => {
      if (navigation.kind === 'back') {
        setHistory((list) => (list.length > 1 ? list.slice(0, -1) : list))
        return
      }
      if (navigation.kind === 'refresh') {
        reload()
        return
      }
      const here = shownRoute ? `${docPath}/${shownRoute.path.join('/')}${shownRoute.search}` : docPath
      const url = new URL(navigation.href, new URL(here, window.location.origin))
      const prefix = `${docPath}/`
      if (url.origin === window.location.origin && url.pathname.startsWith(prefix)) {
        const route = { path: url.pathname.slice(prefix.length).split('/').filter(Boolean).map(decodeURIComponent), search: url.search }
        setHistory((list) => (navigation.kind === 'push' ? [...list, route] : [...list.slice(0, -1), route]))
        return
      }
      // The document's edit view: the builder already is that view.
      if (url.pathname === docPath) {
        closeModal(slug)
        return
      }
      leave(url)
    },
    [shownRoute, docPath, closeModal, slug, leave, reload],
  )
  const onUnavailable = useCallback((reason: string) => fallBack(reason, shownRoute ?? { path: ['versions'], search: '' }), [fallBack, shownRoute])

  const versionId = current?.path[0] === 'versions' ? current.path[1] : undefined
  const canRestore = Boolean(versionId) && meta.canUpdate
  const segments = useMemo(() => ['collections', collection, id, ...(shownRoute?.path ?? [])], [collection, id, shownRoute])
  const body = useRef<HTMLDivElement>(null)
  useCleanApiUrl(body, !localization && shownRoute?.path[0] === 'api')

  return (
    <Drawer slug={slug} className="builder-screen-drawer" gutter={false} Header={null}>
      <Gutter className="builder-screen-drawer__header">
        <div className="builder-screen-drawer__bar">
          {history.length > 1 && (
            <button type="button" className="builder-screen-drawer__icon-button" aria-label="Back" onClick={() => navigate({ kind: 'back' })}>
              <Icon name="back" />
            </button>
          )}
          <h2 className="builder-screen-drawer__title">{titleOf(current)}</h2>
          {canRestore && (
            <button type="button" className="builder-screen-drawer__restore" disabled={busy !== null} onClick={() => openModal(RESTORE_SLUG)}>
              <Icon name="undo" size={14} />
              {busy === 'restore' ? 'Restoring…' : meta.drafts ? 'Restore as draft' : 'Restore this version'}
            </button>
          )}
          <button type="button" className="builder-screen-drawer__icon-button" aria-label="Close" onClick={() => closeModal(slug)}>
            <Icon name="close" />
          </button>
        </div>
      </Gutter>
      <div ref={body} className="builder-screen-drawer__body" aria-busy={loading}>
        {failed ? (
          <Gutter>
            <p className="builder-screen-drawer__error">
              This screen did not load.{' '}
              <button type="button" className="builder-screen-drawer__link" onClick={reload}>
                Try again
              </button>
            </p>
          </Gutter>
        ) : shown ? (
          <DrawerRouter
            pathname={`${docPath}/${shown.route.path.join('/')}`}
            search={shown.route.search}
            segments={segments}
            onNavigate={navigate}
            onUnavailable={onUnavailable}
          >
            {shown.node}
          </DrawerRouter>
        ) : (
          <Gutter className="builder-screen-drawer__loading">
            <ShimmerEffect height="40px" />
            <ShimmerEffect height="240px" />
          </Gutter>
        )}
      </div>
      {versionId && (
        <ConfirmationModal
          modalSlug={RESTORE_SLUG}
          heading="Restore this version?"
          body={
            meta.drafts
              ? 'The page goes back to this version for everyone editing it. It becomes the draft: the site keeps the published version until you publish.'
              : 'The page goes back to this version for everyone editing it.'
          }
          confirmLabel="Restore"
          confirmingLabel="Restoring…"
          onConfirm={async () => {
            if (await runtime.doc.restore(versionId)) closeModal(slug)
          }}
        />
      )}
    </Drawer>
  )
}

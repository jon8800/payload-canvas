'use client'

import { getTranslation } from '@payloadcms/translations'
import { useAuth, useConfig, useEntityVisibility, useRouteTransition, useTranslation } from '@payloadcms/ui'
import { Command } from 'cmdk'
import { FileText, History, LayoutDashboard, type LucideIcon, Plus, Search, UserRound, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

// @feature:nav
import { NAV_GROUPS, NAV_ICONS } from '../nav/config'
// @end:nav
import { SEARCH_STARTERS } from './config'
import { matchPages, MIN_QUERY_LENGTH, normaliseQuery, type AdminPageEntry, type AdminSearchGroup, type AdminSearchResponse } from './shared'
import './search.scss'

/**
 * The admin search: Ctrl+K (Cmd+K on a Mac) from any admin screen, or the Search button in the
 * header. Pages and "New <thing>" actions are matched here, from the config the sidebar uses.
 * Documents come from `/api/admin-search` (server.ts), one request per pause in typing, which
 * searches every collection at once with the user's own read access.
 *
 * Mounted in the header's actions slot (`admin.components.actions`), so it is on every admin
 * screen that has Payload's header. The full-screen page builder has its own top bar instead.
 */

/** The sidebar's groups and icons, so a page sits under the same name in both places. */
const GROUPS: Array<{ label: string; slugs: string[] }> = [
  // @feature:nav
  ...NAV_GROUPS,
  // @end:nav
]
const ICONS: Record<string, LucideIcon> = {
  // @feature:nav
  ...NAV_ICONS,
  // @end:nav
}

const DEBOUNCE_MS = 140
const RECENT_KEY = 'admin-search:recent'
const RECENT_LIMIT = 5
const PAGE_LIMIT = 5
const ACTION_LIMIT = 3

type RecentItem = { href: string; title: string; subtitle?: string; group: string }
type PageEntry = AdminPageEntry & { icon: LucideIcon; slug?: string }

function readRecent(): RecentItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? (parsed as RecentItem[]).slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

function rememberRecent(item: RecentItem) {
  try {
    const next = [item, ...readRecent().filter((recent) => recent.href !== item.href)].slice(0, RECENT_LIMIT)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Private mode or a full quota: recent items are a convenience, not a requirement.
  }
}

/** Payload's default labels are Title Case. "Template Part" becomes "template part", and "MCP API Key" becomes "MCP API key". */
function lowerCase(label: string): string {
  return label.replace(/\b([A-Z])(?=[a-z])/g, (letter) => letter.toLowerCase())
}

/** Every page the user may open, and every "New <thing>" the user may create. */
function usePageEntries(): { pages: PageEntry[]; actions: PageEntry[] } {
  const { config } = useConfig()
  const { isEntityVisible } = useEntityVisibility()
  const { permissions } = useAuth()
  const { i18n } = useTranslation()

  return useMemo(() => {
    const adminRoute = config.routes.admin
    const href = (path: '' | `/${string}`) => formatAdminURL({ adminRoute, path })
    // A label as text. A label that is a React element (rare) falls back to the slug.
    const text = (label: Parameters<typeof getTranslation>[0], fallback: string) => {
      const value = getTranslation(label, i18n)
      return typeof value === 'string' ? value : fallback
    }
    // `admin.group` is a string or one string per language (or `false`).
    const sectionOf = (slug: string, group: unknown, fallback: string) =>
      GROUPS.find((item) => item.slugs.includes(slug))?.label ??
      (group ? getTranslation(group as string | Record<string, string>, i18n) : fallback)

    const pages: PageEntry[] = [{ label: i18n.t('general:dashboard'), href: href(''), icon: LayoutDashboard }]
    const actions: PageEntry[] = []

    for (const collection of config.collections) {
      const { slug } = collection
      if (!isEntityVisible({ collectionSlug: slug }) || !permissions?.collections?.[slug]?.read) continue
      const label = text(collection.labels.plural, slug)
      const section = sectionOf(slug, collection.admin?.group, i18n.t('general:collections'))
      const icon = ICONS[slug] ?? FileText
      pages.push({ label, href: href(`/collections/${slug}`), section, icon, slug })
      if (permissions.collections[slug]?.create) {
        actions.push({
          label: `New ${lowerCase(text(collection.labels.singular, slug))}`,
          href: href(`/collections/${slug}/create`),
          section: `${section} ${label} create add`,
          icon: Plus,
        })
      }
    }
    for (const global of config.globals) {
      const { slug } = global
      if (!isEntityVisible({ globalSlug: slug }) || !permissions?.globals?.[slug]?.read) continue
      pages.push({
        label: text(global.label, slug),
        href: href(`/globals/${slug}`),
        section: sectionOf(slug, global.admin?.group, i18n.t('general:globals')),
        icon: ICONS[slug] ?? FileText,
        slug,
      })
    }
    pages.push({ label: i18n.t('authentication:account'), href: href('/account'), section: 'Profile password', icon: UserRound })
    return { pages, actions }
  }, [config, isEntityVisible, permissions, i18n])
}

/**
 * Navigates the way a link click would, so Payload's "leave without saving" guard still has its
 * say. The guard listens for anchor clicks on the document and stops the event when it holds the
 * user back. A click it lets through reaches the anchor, where the router takes over.
 */
function useNavigate() {
  const router = useRouter()
  const { startRouteTransition } = useRouteTransition()
  return (href: string) => {
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.hidden = true
    anchor.addEventListener('click', (event) => {
      event.preventDefault()
      startRouteTransition(() => router.push(href))
    })
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  }
}

type Fetched = { query: string; groups: AdminSearchGroup[]; error?: boolean }

/** Server results for the query, one request per pause in typing. The last answer stays up while the next loads. */
function useDocumentSearch(query: string) {
  const { config } = useConfig()
  const [fetched, setFetched] = useState<Fetched | null>(null)
  const cache = useRef(new Map<string, AdminSearchGroup[]>())
  const endpoint = `${config.serverURL}${config.routes.api}/admin-search`

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) return
    const cached = cache.current.get(query)
    if (cached) {
      setFetched({ query, groups: cached })
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`, { credentials: 'include', signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = (await response.json()) as AdminSearchResponse
        cache.current.set(query, body.groups)
        setFetched({ query, groups: body.groups })
      } catch (error) {
        if (controller.signal.aborted) return
        setFetched({ query, groups: [], error: true })
        console.warn('Admin search failed', error)
      }
    }, DEBOUNCE_MS)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, endpoint])

  const searching = query.length >= MIN_QUERY_LENGTH
  const current = searching && fetched?.query === query ? fetched : null
  return {
    groups: searching ? (fetched?.groups ?? []) : [],
    loading: searching && !current,
    error: Boolean(current?.error),
  }
}

/**
 * Key presses one search has already answered. Next keeps recently visited pages mounted (hidden),
 * so more than one search may be listening. Without this, two listeners would open and shut it in
 * the same keystroke.
 */
const answered = new WeakSet<KeyboardEvent>()

const subscribe = () => () => {}
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export function AdminSearch() {
  const [open, setOpen] = useState(false)
  // The server cannot know the platform. It renders "Ctrl" and a Mac swaps in "⌘" after hydration.
  const mac = useSyncExternalStore(subscribe, isMac, () => false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // The rich text editor takes Ctrl+K for links and marks the event as handled.
      if (event.defaultPrevented || event.altKey || event.shiftKey) return
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
      if (answered.has(event)) return
      answered.add(event)
      event.preventDefault()
      setOpen((current) => !current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      {/* Shaped like a search field on wide screens, so it is found without being explained. An icon button on phones. */}
      <button
        aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
        aria-label="Search"
        className="admin-search-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search aria-hidden="true" size={15} strokeWidth={1.75} />
        <span className="admin-search-trigger__label">Search</span>
        <kbd className="admin-search-trigger__keys">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      {open ? <Palette onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function Palette({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('')
  const query = normaliseQuery(input)
  const { pages, actions } = usePageEntries()
  const { groups, loading, error } = useDocumentSearch(query)
  const navigate = useNavigate()
  const [recent] = useState(readRecent)

  // cmdk labels the input but not the dialog it wraps it in, so a screen reader would announce an
  // unnamed dialog. There is no prop for it, so set it here.
  useEffect(() => {
    document.querySelector('.admin-search__dialog')?.setAttribute('aria-label', 'Search the admin')
  }, [])

  const matchedPages = query ? matchPages(pages, query, PAGE_LIMIT) : []
  const matchedActions = query ? matchPages(actions, query, ACTION_LIMIT) : []
  const starters = [
    pages[0],
    ...SEARCH_STARTERS.map((slug) => pages.find((page) => page.slug === slug)).filter((page): page is PageEntry => Boolean(page)),
  ]

  function go(href: string, remember?: RecentItem) {
    if (remember) rememberRecent(remember)
    onClose()
    // After the dialog has gone, so a "leave without saving" prompt is not under it.
    window.setTimeout(() => navigate(href), 0)
  }

  const nothingFound =
    query.length >= MIN_QUERY_LENGTH && !loading && !error && !groups.length && !matchedPages.length && !matchedActions.length

  return (
    <Command.Dialog
      className="admin-search"
      contentClassName="admin-search__dialog"
      label="Search the admin"
      loop
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      open
      overlayClassName="admin-search__overlay"
      shouldFilter={false}
      // cmdk's Vim keys claim Ctrl+K for "move up", which would stop Ctrl+K closing the search.
      vimBindings={false}
    >
      <div className="admin-search__field">
        <Search aria-hidden="true" className="admin-search__field-icon" size={18} strokeWidth={1.75} />
        <Command.Input
          className="admin-search__input"
          onValueChange={setInput}
          placeholder="Search pages, posts, media, settings…"
          value={input}
        />
        <button aria-label="Close search" className="admin-search__close" onClick={onClose} type="button">
          <kbd className="admin-search__close-key">Esc</kbd>
          <X aria-hidden="true" className="admin-search__close-icon" size={18} strokeWidth={1.75} />
        </button>
        <span aria-hidden="true" className="admin-search__progress" data-active={loading || undefined} />
      </div>

      <Command.List className="admin-search__list">
        {!query ? (
          <>
            {recent.length ? (
              <Command.Group heading="Recent">
                {recent.map((item) => (
                  <Row
                    icon={ICONS[item.group] ?? History}
                    key={`recent:${item.href}`}
                    onSelect={() => go(item.href, item)}
                    subtitle={item.subtitle}
                    title={item.title}
                    value={`recent:${item.href}`}
                  />
                ))}
              </Command.Group>
            ) : null}
            <Command.Group heading="Go to">
              {starters.map((page) => (
                <Row icon={page.icon} key={page.href} onSelect={() => go(page.href)} title={page.label} value={page.href} />
              ))}
            </Command.Group>
            <p className="admin-search__hint">Search by title, name or email, or type a page like “theme”.</p>
          </>
        ) : null}

        {matchedPages.length ? (
          <Command.Group heading="Go to">
            {matchedPages.map((page) => (
              <Row
                icon={page.icon}
                key={page.href}
                onSelect={() => go(page.href)}
                subtitle={page.section}
                title={page.label}
                value={page.href}
              />
            ))}
          </Command.Group>
        ) : null}

        {groups.map((group) => (
          <Command.Group heading={group.label} key={group.slug}>
            {group.hits.map((hit) => (
              <Row
                icon={ICONS[group.slug] ?? FileText}
                key={hit.href}
                onSelect={() => go(hit.href, { href: hit.href, title: hit.title, subtitle: hit.subtitle, group: group.slug })}
                subtitle={hit.subtitle}
                title={hit.title}
                value={hit.href}
              />
            ))}
          </Command.Group>
        ))}

        {matchedActions.length ? (
          <Command.Group heading="Create">
            {matchedActions.map((action) => (
              <Row icon={Plus} key={action.href} onSelect={() => go(action.href)} title={action.label} value={action.href} />
            ))}
          </Command.Group>
        ) : null}

        {error ? (
          <p className="admin-search__status" role="alert">
            Search is not answering. Check your connection, then type again.
          </p>
        ) : null}
        {nothingFound ? (
          <p className="admin-search__status">
            Nothing matches “{query}”.
            <span>Try part of a title, a name or an email.</span>
          </p>
        ) : null}
      </Command.List>

      <footer aria-hidden="true" className="admin-search__footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> to move
        </span>
        <span>
          <kbd>Enter</kbd> to open
        </span>
        <span>
          <kbd>Esc</kbd> to close
        </span>
      </footer>
    </Command.Dialog>
  )
}

function Row({
  icon: Icon,
  onSelect,
  subtitle,
  title,
  value,
}: {
  icon: LucideIcon
  onSelect: () => void
  subtitle?: string
  title: string
  value: string
}) {
  return (
    <Command.Item className="admin-search__item" onSelect={onSelect} value={value}>
      <Icon aria-hidden="true" className="admin-search__item-icon" size={16} strokeWidth={1.75} />
      <span className="admin-search__item-text">
        <span className="admin-search__item-title">{title}</span>
        {subtitle ? <span className="admin-search__item-subtitle">{subtitle}</span> : null}
      </span>
    </Command.Item>
  )
}

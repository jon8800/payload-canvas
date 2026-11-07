'use client'

// Site navigation. Links render twice: an inline list (wide screens) and a <details> disclosure
// (small screens). CSS shows one of them, and `display: none` hides the other from screen readers.
// <details> opens and closes without JavaScript, so the menu works before (and without) hydration.
// JavaScript adds: Escape closes, a click outside closes, and the current page link gets
// aria-current. An optional button (`ctaLabel` and `cta`) is the last row of the panel. Inner classes come from MENU_CLASS_MAP, which the block definition lists in `classes`.
// An item with `children` (one level) is a dropdown: a <details> in the inline list, beside the
// item's own link or in its place, and a nested list in the panel. Escape, a click outside and
// focus leaving close an open dropdown; opening one closes the others.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { MENU_CLASS_MAP as C } from '../../blocks'
import { editableText } from '../render/editable'
import { linkAttributes, type LinkAttributes } from '../render/link'
import type { RenderMode } from '../render/types'
import type { BlockComponentProps } from '../render/types'
import { asText, PlaceholderText } from './placeholder'

type Collapse = 'md' | 'lg' | 'never'
/** `path` is the row's prop path: the canvas edits `<path>.label` (`items.2.label`, `items.2.children.0.label`). */
type Item = { key: string; path: string; label: string; link: LinkAttributes | null; children: Item[] }
/** `page` for the current page, `true` for a parent whose child is the current page. */
type Current = 'page' | 'true' | undefined

/** The dropdowns of the inline list. */
const SUBMENU = 'li > details'

const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}
const clientPath = () => window.location.pathname
// The server does not know the path, so no link is current until the client hydrates.
const serverPath = () => null

const trimSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path)

/** True when `href` points at the current page, or at a section the page is in ("/blog" on "/blog/a-post"). */
export function isCurrentLink(href: string, pathname: string | null, origin?: string): boolean {
  if (!pathname) return false
  let url: URL
  try {
    url = new URL(href, origin ?? 'http://localhost')
  } catch {
    return false
  }
  if (origin && url.origin !== origin) return false
  if (!origin && !href.startsWith('/')) return false
  const target = trimSlash(url.pathname)
  const current = trimSlash(pathname)
  if (target === current) return true
  return target !== '/' && current.startsWith(`${target}/`)
}

/** The menu rows. The top level reads one level of `children`; deeper levels are ignored. */
export function toItems(value: unknown, path = 'items', depth = 0): Item[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row, i) => {
    if (typeof row !== 'object' || row === null) return []
    const { id, label, link, children } = row as { id?: unknown; label?: unknown; link?: unknown; children?: unknown }
    const text = asText(label)
    if (!text) return []
    const rowPath = `${path}.${i}`
    return [
      {
        key: typeof id === 'string' ? id : String(i),
        path: rowPath,
        label: text,
        link: linkAttributes(link),
        children: depth === 0 ? toItems(children, `${rowPath}.children`, 1) : [],
      },
    ]
  })
}

function MenuLink({ item, className, current, mode }: { item: Item; className: string; current: Current; mode: RenderMode }) {
  const editable = editableText(mode, `${item.path}.label`)
  if (!item.link) {
    return (
      <span {...editable} className={className}>
        {item.label}
      </span>
    )
  }
  return (
    <a {...item.link} {...editable} className={className} aria-current={current}>
      {item.label}
    </a>
  )
}

function Icon({ className, open }: { className: string; open: boolean }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
    </svg>
  )
}

function Chevron({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

/** `aria-current` of a menu row: `page` for the current page, `true` for a parent whose child is the current page. */
export function currentOf(item: Item, pathname: string | null, origin?: string): Current {
  const is = (row: Item) => (row.link ? isCurrentLink(row.link.href, pathname, origin) : false)
  if (is(item)) return 'page'
  return item.children.some(is) ? 'true' : undefined
}

export function Menu({ props, className, attributes, mode }: BlockComponentProps) {
  const items = toItems(props.items)
  const collapse: Collapse = props.collapse === 'lg' || props.collapse === 'never' ? props.collapse : 'md'
  const label = asText(props.label) || 'Main'
  const submenuLabel = asText(props.submenuLabel) || '{label} menu'
  // The panel button needs a label and a link; without both it is not shown.
  const ctaLink = linkAttributes(props.cta)
  const ctaLabel = asText(props.ctaLabel)
  const cta = ctaLink && ctaLabel ? { link: ctaLink, label: ctaLabel } : null
  const pathname = useSyncExternalStore(subscribe, clientPath, serverPath)
  const origin = pathname === null ? undefined : window.location.origin
  const nav = useRef<HTMLElement>(null)

  // The panel and the dropdowns. Escape closes the one that holds the focus and focuses its
  // toggle. A click outside closes them all.
  useEffect(() => {
    const root = nav.current
    if (!root) return
    const close = (element: HTMLDetailsElement, focusToggle: boolean) => {
      if (!element.open) return
      element.open = false
      if (focusToggle) element.querySelector('summary')?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !(event.target instanceof Element)) return
      const open = event.target.closest('details[open]')
      if (open instanceof HTMLDetailsElement && root.contains(open)) close(open, true)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      for (const element of root.querySelectorAll('details')) if (!element.contains(event.target)) close(element, false)
    }
    // A dropdown closes when the focus leaves it.
    const onFocusOut = (event: FocusEvent) => {
      const dropdown = event.target instanceof Element ? event.target.closest(SUBMENU) : null
      if (!(dropdown instanceof HTMLDetailsElement)) return
      if (event.relatedTarget instanceof Node && dropdown.contains(event.relatedTarget)) return
      close(dropdown, false)
    }
    // Opening a dropdown closes the others. `toggle` does not bubble, so listen while it captures.
    const onToggle = (event: Event) => {
      const opened = event.target
      if (!(opened instanceof HTMLDetailsElement) || !opened.open || !opened.matches(SUBMENU)) return
      for (const element of root.querySelectorAll<HTMLDetailsElement>(SUBMENU)) if (element !== opened) close(element, false)
    }
    root.addEventListener('keydown', onKeyDown)
    root.addEventListener('focusout', onFocusOut)
    root.addEventListener('toggle', onToggle, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('focusout', onFocusOut)
      root.removeEventListener('toggle', onToggle, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  if (items.length === 0) {
    if (mode !== 'canvas') return null
    return (
      <nav {...attributes} ref={nav} aria-label={label} className={className}>
        <PlaceholderText>Menu: add links in the Content tab</PlaceholderText>
      </nav>
    )
  }

  const current = (item: Item) => currentOf(item, pathname, origin)
  const childList = (item: Item, listClass: string, linkClass: string) => (
    <ul className={listClass}>
      {item.children.map((child) => (
        <li key={child.key}>
          <MenuLink item={child} className={linkClass} current={current(child)} mode={mode} />
        </li>
      ))}
    </ul>
  )
  const list = (linkClass: string) =>
    items.map((item) => {
      if (item.children.length === 0) {
        return (
          <li key={item.key}>
            <MenuLink item={item} className={linkClass} current={current(item)} mode={mode} />
          </li>
        )
      }
      // With its own link: the link and a small toggle beside it, named by `submenuLabel`.
      // Without one: the label is the toggle.
      return (
        <li key={item.key} className={C.submenu}>
          {item.link ? <MenuLink item={item} className={linkClass} current={current(item)} mode={mode} /> : null}
          <details className={C.submenuDetails}>
            <summary
              className={C.submenuToggle}
              aria-label={item.link ? submenuLabel.replaceAll('{label}', item.label) : undefined}
              aria-current={item.link ? undefined : current(item)}
            >
              {item.link ? null : <span {...editableText(mode, `${item.path}.label`)}>{item.label}</span>}
              <Chevron className={C.submenuIcon} />
            </summary>
            {childList(item, C.submenuList, C.submenuLink)}
          </details>
        </li>
      )
    })

  return (
    <nav {...attributes} ref={nav} aria-label={label} className={className}>
      {/* `contents` drops the list box from layout; role="list" keeps list semantics in Safari. */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul role="list" className={C.list[collapse]}>
        {list(C.link)}
      </ul>
      {collapse === 'never' ? null : (
        <details className={`group ${C.toggleWrap[collapse]}`}>
          <summary className={C.toggle}>
            <span>{asText(props.toggleLabel) || 'Menu'}</span>
            <Icon className={C.iconOpen} open={false} />
            <Icon className={C.iconClose} open />
          </summary>
          <div className={C.panel}>
            <ul className={C.panelList}>
              {items.map((item) => (
                <li key={item.key}>
                  <MenuLink item={item} className={C.panelLink} current={current(item)} mode={mode} />
                  {item.children.length > 0 ? childList(item, C.panelSubList, C.panelSubLink) : null}
                </li>
              ))}
              {cta ? (
                <li>
                  <a {...cta.link} {...editableText(mode, 'ctaLabel')} className={C.panelCta}>
                    {cta.label}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </details>
      )}
    </nav>
  )
}

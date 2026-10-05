'use client'

// Site navigation. Links render twice: an inline list (wide screens) and a <details> disclosure
// (small screens). CSS shows one of them, and `display: none` hides the other from screen readers.
// <details> opens and closes without JavaScript, so the menu works before (and without) hydration.
// JavaScript adds: Escape closes, a click outside closes, and the current page link gets
// aria-current. An optional button (`ctaLabel` and `cta`) is the last row of the panel. Inner classes come from MENU_CLASS_MAP, which the block definition lists in `classes`.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { MENU_CLASS_MAP as C } from '@payload-toolkit/builder/blocks'
import { editableText } from '../render/editable'
import { linkAttributes, type LinkAttributes } from '../render/link'
import type { RenderMode } from '../render/types'
import type { BlockComponentProps } from '../render/types'
import { asText, PlaceholderText } from './placeholder'

type Collapse = 'md' | 'lg' | 'never'
/** `index` is the row's index in the stored array: the canvas edits `items.<index>.label`. */
type Item = { key: string; index: number; label: string; link: LinkAttributes | null }

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

function toItems(value: unknown): Item[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row, i) => {
    if (typeof row !== 'object' || row === null) return []
    const { id, label, link } = row as { id?: unknown; label?: unknown; link?: unknown }
    const text = asText(label)
    if (!text) return []
    return [{ key: typeof id === 'string' ? id : String(i), index: i, label: text, link: linkAttributes(link) }]
  })
}

function MenuLink({ item, className, current, mode }: { item: Item; className: string; current: boolean; mode: RenderMode }) {
  const editable = editableText(mode, `items.${item.index}.label`)
  if (!item.link) {
    return (
      <span {...editable} className={className}>
        {item.label}
      </span>
    )
  }
  return (
    <a {...item.link} {...editable} className={className} aria-current={current ? 'page' : undefined}>
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

export function Menu({ props, className, attributes, mode }: BlockComponentProps) {
  const items = toItems(props.items)
  const collapse: Collapse = props.collapse === 'lg' || props.collapse === 'never' ? props.collapse : 'md'
  const label = asText(props.label) || 'Main'
  // The panel button needs a label and a link; without both it is not shown.
  const ctaLink = linkAttributes(props.cta)
  const ctaLabel = asText(props.ctaLabel)
  const cta = ctaLink && ctaLabel ? { link: ctaLink, label: ctaLabel } : null
  const pathname = useSyncExternalStore(subscribe, clientPath, serverPath)
  const origin = pathname === null ? undefined : window.location.origin
  const details = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const element = details.current
    if (!element) return
    const close = (focusToggle: boolean) => {
      if (!element.open) return
      element.open = false
      if (focusToggle) element.querySelector('summary')?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) close(false)
    }
    element.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      element.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  if (items.length === 0) {
    if (mode !== 'canvas') return null
    return (
      <nav {...attributes} aria-label={label} className={className}>
        <PlaceholderText>Menu: add links in the Content tab</PlaceholderText>
      </nav>
    )
  }

  const current = (item: Item) => (item.link ? isCurrentLink(item.link.href, pathname, origin) : false)
  const list = (linkClass: string) =>
    items.map((item) => (
      <li key={item.key}>
        <MenuLink item={item} className={linkClass} current={current(item)} mode={mode} />
      </li>
    ))

  return (
    <nav {...attributes} aria-label={label} className={className}>
      {/* `contents` drops the list box from layout; role="list" keeps list semantics in Safari. */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul role="list" className={C.list[collapse]}>
        {list(C.link)}
      </ul>
      {collapse === 'never' ? null : (
        <details ref={details} className={`group ${C.toggleWrap[collapse]}`}>
          <summary className={C.toggle}>
            <span>Menu</span>
            <Icon className={C.iconOpen} open={false} />
            <Icon className={C.iconClose} open />
          </summary>
          <div className={C.panel}>
            <ul className={C.panelList}>
              {items.map((item) => (
                <li key={item.key}>
                  <MenuLink item={item} className={C.panelLink} current={current(item)} mode={mode} />
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

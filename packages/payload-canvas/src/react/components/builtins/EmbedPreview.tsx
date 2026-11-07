'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { EMBED_CLASS_MAP as C, type EmbedMode } from '../../../blocks/client/embed'
import { joinClasses } from '../../../blocks/client/helpers'
import { PlaceholderBox } from '../placeholder'

/**
 * The canvas frame: no `allow-scripts`, so no code runs (scripts, `onerror` handlers, forms).
 * `allow-same-origin` only lets the canvas read the content's height.
 */
export const PREVIEW_SANDBOX = 'allow-same-origin'

const LABEL = 'Custom code'

/** Clicks go to the canvas, so the block selects as any other. */
const NO_POINTER: CSSProperties = { pointerEvents: 'none' }

/** Below this height (code with only scripts) the canvas shows the placeholder instead. */
const MIN_HEIGHT = 4

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/**
 * The document of an inline preview: the code with the page's stylesheets and the classes of
 * `<html>` and `<body>` (theme, fonts), so it looks as it does in the page.
 */
export function previewDocument(code: string, page: PageLook): string {
  return (
    `<!doctype html><html class="${escapeAttribute(page.htmlClass)}"><head>${page.styles}</head>` +
    `<body class="${escapeAttribute(page.bodyClass)}" style="margin:0;display:flow-root;background:transparent">${code}</body></html>`
  )
}

/**
 * The height of what the body shows: from its top to the lowest bottom edge (with margin) of its
 * children that have a box. Scripts and styles have none, so code with only scripts measures 0.
 */
export function contentHeight(body: HTMLElement): number {
  const top = body.getBoundingClientRect().top
  let bottom = top
  for (const child of Array.from(body.children)) {
    const rect = child.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    bottom = Math.max(bottom, rect.bottom + (Number.parseFloat(getComputedStyle(child).marginBottom) || 0))
  }
  return Math.ceil(bottom - top)
}

type PageLook = { styles: string; htmlClass: string; bodyClass: string }

function pageLook(): PageLook {
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'), (el) => el.outerHTML).join('')
  return { styles, htmlClass: document.documentElement.className, bodyClass: document.body.className }
}

/**
 * Custom code on the canvas, never run: a sandboxed frame without scripts. Inline code grows to
 * its content's height. Empty code, or code with nothing to see (only scripts), shows a
 * "Custom code" box, so the block can still be selected.
 */
export function EmbedPreview({
  code,
  mode,
  title,
  className,
  attributes,
}: {
  code: string
  mode: EmbedMode
  title: string
  className?: string
  attributes: Record<string, string>
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(0)
  // The page's stylesheets and classes, read once: they exist only in the browser.
  const [look, setLook] = useState<PageLook | null>(null)
  const empty = !code.trim()
  const inline = mode === 'inline'
  // Isolated code shows as it is; inline code with the page's look (empty until it is read).
  const srcDoc = inline ? (look ? previewDocument(code, look) : null) : code

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setLook(pageLook())
  }, [])

  // Inline: the frame grows with its content (images that load, fonts). The frame's `load` waits
  // for every image and stylesheet, and the old document stays a moment after a change, so for
  // about two seconds each frame checks for a new body to watch.
  useEffect(() => {
    const el = frame.current
    if (!el || !inline || srcDoc === null) return
    let observer: ResizeObserver | null = null
    let watched: HTMLElement | null = null
    let tries = 0
    let poll = 0
    const watch = () => {
      const body = el.contentDocument?.body
      if (!body || body === watched) return
      watched = body
      observer?.disconnect()
      const update = () => setHeight(contentHeight(body))
      update()
      observer = new ResizeObserver(update)
      observer.observe(body)
    }
    const check = () => {
      watch()
      if (++tries < 120) poll = requestAnimationFrame(check)
    }
    el.addEventListener('load', watch)
    check()
    return () => {
      cancelAnimationFrame(poll)
      el.removeEventListener('load', watch)
      observer?.disconnect()
    }
  }, [inline, srcDoc])

  if (empty) return <PlaceholderBox attributes={attributes} className={className} label={LABEL} />
  if (!inline) {
    return (
      <iframe
        {...attributes}
        className={joinClasses(C.frame, className)}
        title={title}
        srcDoc={srcDoc ?? ''}
        sandbox={PREVIEW_SANDBOX}
        style={NO_POINTER}
      />
    )
  }
  const blank = height < MIN_HEIGHT
  return (
    <div {...attributes} className={className}>
      <iframe
        ref={frame}
        className={C.frame}
        title={title}
        srcDoc={srcDoc ?? ''}
        sandbox={PREVIEW_SANDBOX}
        style={{ ...NO_POINTER, height }}
      />
      {blank ? <PlaceholderBox attributes={{}} label={LABEL} style={{ minHeight: 48 }} /> : null}
    </div>
  )
}

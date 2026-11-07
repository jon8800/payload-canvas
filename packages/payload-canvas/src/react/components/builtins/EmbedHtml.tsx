'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

/** Scripts that already ran: those the browser ran from the server's HTML, and our copies. */
const ran = new WeakSet<Element>()

const subscribe = () => () => {}

/**
 * Runs the `<script>` tags under `root` that have not run yet. Scripts that arrive through
 * `innerHTML` never run, so each one is replaced by a new script element with the same attributes
 * and text. External scripts keep their order (`async = false`) unless they have `async`.
 */
export function runScripts(root: Element): void {
  for (const old of root.querySelectorAll('script')) {
    if (ran.has(old)) continue
    const script = old.ownerDocument.createElement('script')
    for (const { name, value } of Array.from(old.attributes)) script.setAttribute(name, value)
    if (!old.hasAttribute('async')) script.async = false
    script.text = old.text
    ran.add(script)
    old.replaceWith(script)
  }
}

/**
 * Inline custom HTML on the site. The browser runs the scripts of the server's HTML itself. After
 * a client render (a page change in the app), React sets `innerHTML`, so the scripts run here.
 */
export function EmbedHtml({ html, className, attributes }: { html: string; className?: string; attributes: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null)
  // False while React hydrates the server's HTML: its scripts ran when the page loaded.
  const client = useSyncExternalStore(subscribe, () => true, () => false)
  const fromServer = useRef(!client)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    if (fromServer.current) {
      fromServer.current = false
      for (const script of root.querySelectorAll('script')) ran.add(script)
      return
    }
    runScripts(root)
    // `html`: React set new HTML, so its scripts must run.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [html])
  // The scripts may change their HTML before React hydrates it: that is expected, not a mismatch.
  return <div {...attributes} ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} suppressHydrationWarning />
}

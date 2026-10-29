'use client'

import { useEffect, useRef } from 'react'
import type { BlockComponentProps } from '../../render/types'

/** The accordion's own disclosures: <details> inside it that are not inside another <details> of it. */
export function ownDetails(root: HTMLElement): HTMLDetailsElement[] {
  return [...root.querySelectorAll('details')].filter((item) => {
    const outer = item.parentElement?.closest('details')
    return !outer || !root.contains(outer)
  })
}

/**
 * A list of disclosures. With "Several open at a time" off it gives its own disclosures one
 * `name`, so the browser keeps one open (exclusive <details>). Not on the canvas, where every
 * disclosure stays open for editing. `RenderLayout` outputs the FAQ JSON-LD (`faqItems`).
 */
export function Accordion({ block, props, className, attributes, partAttributes, slots, mode }: BlockComponentProps) {
  const ref = useRef<HTMLDivElement>(null)
  const single = props.multiple === false && mode !== 'canvas'
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const name = single ? `accordion-${block.id}` : ''
    const apply = () => {
      for (const item of ownDetails(root)) item.name = name
    }
    apply()
    if (!single) return
    // Repeats and lists can add items later.
    const observer = new MutationObserver(apply)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [single, block.id])
  return (
    <div {...attributes} {...partAttributes.items} ref={ref} className={className}>
      {slots.items}
    </div>
  )
}

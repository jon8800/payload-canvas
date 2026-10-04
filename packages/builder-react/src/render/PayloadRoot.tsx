'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  /** The editor attributes (`data-block-id`, …) for the component's root element. */
  readonly attributes: Record<string, string>
  /** Shown when the component renders no element, so the block stays selectable. */
  readonly label: string
  readonly children: ReactNode
}

const HOST_STYLE = { display: 'contents' } as const
const EMPTY_STYLE = { minHeight: 48, padding: 8, border: '1px dashed currentColor', fontSize: 12, opacity: 0.6 }

/**
 * Canvas only. A component written for Payload data does not spread the editor's `attributes`, so
 * this puts them on the component's first element after each render. The wrapper has
 * `display: contents`, so it adds no box and the page layout stays exactly as on the site.
 * A component that renders nothing gets a small placeholder, so the block can still be selected.
 */
export function PayloadRoot({ attributes, label, children }: Props) {
  const host = useRef<HTMLSpanElement>(null)
  const [empty, setEmpty] = useState(false)

  // RenderLayout makes a new `attributes` object on every render of the block, so this runs after
  // each render. The observer also catches a root element the component swaps or adds later.
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    let root: Element | null = null
    const apply = () => {
      const next = element.firstElementChild
      if (next === root) return
      if (root) for (const name of Object.keys(attributes)) root.removeAttribute(name)
      root = next
      if (root) for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value)
      setEmpty(!root)
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(element, { childList: true })
    return () => {
      observer.disconnect()
      if (root) for (const name of Object.keys(attributes)) root.removeAttribute(name)
    }
  }, [attributes])

  return (
    <>
      <span ref={host} style={HOST_STYLE} data-builder-payload="">
        {children}
      </span>
      {empty && (
        <div {...attributes} style={EMPTY_STYLE}>
          {label}
        </div>
      )}
    </>
  )
}

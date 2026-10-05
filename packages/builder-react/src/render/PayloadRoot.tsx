'use client'

import { Fragment, useLayoutEffect, useRef, useState, version, type FragmentInstance, type ReactNode } from 'react'

type Props = {
  /** The editor attributes (`data-block-id`, …) for the component's root element. */
  readonly attributes: Record<string, string>
  /** Shown when the component renders no element, so the block stays selectable. */
  readonly label: string
  readonly children: ReactNode
}

const HOST_STYLE = { display: 'contents' } as const
const EMPTY_STYLE = { minHeight: 48, padding: 8, border: '1px dashed currentColor', fontSize: 12, opacity: 0.6 }

/** Fragment refs (`<Fragment ref>`, `observeUsing`) exist from React 19.3. */
const [major = 0, minor = 0] = version.split('.').map(Number)
const FRAGMENT_REFS = major > 19 || (major === 19 && minor >= 3)

/** What a fragment instance calls for each element directly in it (React's `observeUsing`). */
type ChildObserver = { observe(element: Element): void; unobserve(element: Element): void }

/** The first of the elements in document order. */
function firstOf(elements: Iterable<Element>): Element | null {
  let first: Element | null = null
  for (const element of elements) {
    if (!element.isConnected) continue
    if (!first || first.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING) first = element
  }
  return first
}

/**
 * Canvas only. A component written for Payload data does not spread the editor's `attributes`, so
 * this puts them on the component's first element after each render. It adds no element: a
 * fragment ref (`observeUsing`) reports the elements directly inside it as React adds and removes
 * them. So the component's elements stay direct children of their container, as on the site, and
 * container rules like `space-y-8`, `divide-y` and grid or flex layout apply the same way.
 * Before React 19.3 it falls back to a `display: contents` wrapper (container rules that select
 * direct children then miss the component).
 * A component that renders nothing gets a small placeholder, so the block can still be selected.
 */
export function PayloadRoot({ attributes, label, children }: Props) {
  const fragment = useRef<FragmentInstance>(null)
  const host = useRef<HTMLSpanElement>(null)
  const [empty, setEmpty] = useState(false)

  // RenderLayout makes a new `attributes` object on every render of the block, so this runs after
  // each render. The observer also catches a root element the component swaps or adds later.
  useLayoutEffect(() => {
    let root: Element | null = null
    let disposed = false
    const elements = new Set<Element>()
    const apply = () => {
      if (disposed) return
      const next = FRAGMENT_REFS ? firstOf(elements) : (host.current?.firstElementChild ?? null)
      if (next === root) return
      if (root) for (const name of Object.keys(attributes)) root.removeAttribute(name)
      root = next
      if (root) for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value)
      setEmpty(!root)
    }
    let stop: () => void
    if (FRAGMENT_REFS) {
      const instance = fragment.current
      if (!instance) return
      let scheduled = false
      // React calls the observer while it commits: apply once that commit is done, before paint.
      const schedule = () => {
        if (scheduled) return
        scheduled = true
        queueMicrotask(() => {
          scheduled = false
          apply()
        })
      }
      const observer: ChildObserver = {
        observe(element) {
          elements.add(element)
          schedule()
        },
        unobserve(element) {
          elements.delete(element)
          schedule()
        },
      }
      instance.observeUsing(observer as unknown as ResizeObserver)
      stop = () => instance.unobserveUsing(observer as unknown as ResizeObserver)
    } else {
      const element = host.current
      if (!element) return
      const mutations = new MutationObserver(apply)
      mutations.observe(element, { childList: true })
      stop = () => mutations.disconnect()
    }
    apply()
    return () => {
      stop()
      disposed = true
      if (root) for (const name of Object.keys(attributes)) root.removeAttribute(name)
    }
  }, [attributes])

  return (
    <>
      {FRAGMENT_REFS ? (
        <Fragment ref={fragment}>{children}</Fragment>
      ) : (
        <span ref={host} style={HOST_STYLE} data-builder-payload="">
          {children}
        </span>
      )}
      {empty && (
        <div {...attributes} style={EMPTY_STYLE}>
          {label}
        </div>
      )}
    </>
  )
}

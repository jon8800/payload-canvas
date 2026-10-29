// No 'use client': the site's own client modules wrap their `next/dynamic` blocks with it too.
import { createElement, Suspense, type ComponentType } from 'react'
import type { BlockComponentProps } from '../render/types'

/**
 * Wraps a block component that loads its code on demand (`next/dynamic` in a client module), so
 * the browser loads it only on pages that render the block:
 *
 * ```tsx
 * 'use client'
 * import dynamic from 'next/dynamic'
 * export const FormBlock = lazyBlock(dynamic(() => import('./Form').then((m) => m.FormBlock)))
 * ```
 *
 * On the site the block renders in the server's HTML and hydrates once its code loads. On the
 * canvas a block can mount after the page (a new block, an edit), so it waits for its code in a
 * Suspense boundary of its own and shows nothing until then.
 */
export function lazyBlock<P extends BlockComponentProps>(Loaded: ComponentType<P>): ComponentType<P> {
  function LazyBlock(props: P) {
    const element = createElement(Loaded, props)
    return props.mode === 'canvas' ? createElement(Suspense, { fallback: null }, element) : element
  }
  return LazyBlock
}

// Marks on block components, kept in WeakSets. A WeakSet never reads a property of the component,
// so a client reference (a 'use client' component seen from the server) is safe to test.

import type { ComponentType } from 'react'

import type { BlockComponentProps } from './types'

const pageDataComponents = new WeakSet<object>()
const serverComponents = new WeakSet<object>()

/**
 * Marks a block component that reads the page data (`BlockComponentProps.pageData`, the
 * `pageData` of `RenderLayout` and of the canvas). Other components never get it, so a client
 * component does not carry the page data in the page's payload. `fromPayloadComponent` marks its
 * components itself.
 */
export function withPageData<C extends ComponentType<BlockComponentProps>>(component: C): C {
  pageDataComponents.add(component)
  return component
}

export const readsPageData = (component: unknown): boolean =>
  typeof component === 'function' && pageDataComponents.has(component)

/** Marks a block component that must render on the server in the canvas, even if the canvas can import it. */
export function renderOnServer<C extends ComponentType<BlockComponentProps>>(component: C): C {
  serverComponents.add(component)
  return component
}

/** An async function component (a server component that loads data). */
export const isAsyncComponent = (component: unknown): boolean =>
  typeof component === 'function' && Object.prototype.toString.call(component) === '[object AsyncFunction]'

/** The canvas renders this component on the server: it is marked, or it is an async function. */
export const rendersOnServer = (component: unknown): boolean =>
  typeof component === 'function' && (serverComponents.has(component) || isAsyncComponent(component))

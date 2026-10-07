'use client'

// A block the canvas renders on the server (see serverBlocks.ts and `createCanvasServer`). It shows
// the server's output with the editor attributes on its first element, and the canvas's own
// children in the slot outlets.

import { findBlock, type Layout } from '../../core'
import {
  Component,
  createContext,
  startTransition,
  Suspense,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'

import { PayloadRoot } from '../render/PayloadRoot'
import { PreviewSlotsContext } from '../render/SlotOutlet'
import type { BlockComponentProps } from '../render/types'
import { SERVER_BLOCK_ATTRIBUTE, type ServerBlocks, type ServerEntry } from './serverBlocks'

/**
 * The store, the stored layout the blocks are sent from (IDs, not loaded documents; with the prop
 * being edited inline held at its value from the start of editing), and a version that changes with
 * the scope. A new value renders every server block again, so its key is never stale.
 */
export type ServerBlocksValue = { store: ServerBlocks; layout: Layout | null; version: number }

export const ServerBlocksContext = createContext<ServerBlocksValue | null>(null)


const BOX_STYLE = { padding: 8, fontSize: 12 } as const

type View = {
  /** The newest content (it stays on screen while a newer one loads). */
  node: ReactNode
  hasNode: boolean
  error: string | null
  pending: boolean
}

const EMPTY_VIEW: View = { node: null, hasNode: false, error: null, pending: true }

function nextView(view: View, entry: ServerEntry | undefined): View {
  if (entry?.status === 'ready') return { node: entry.node, hasNode: true, error: null, pending: false }
  if (entry?.status === 'error') return { ...view, error: entry.error, pending: false }
  return view.pending && view.error === null ? view : { ...view, error: null, pending: true }
}

type BoundaryProps = { resetKey: string | null; fallback: (error: string) => ReactNode; children: ReactNode }

/** Catches errors the server output throws while it renders (a component that failed on the server). */
class ServerBoundary extends Component<BoundaryProps, { error: string | null; resetKey: string | null }> {
  state = { error: null as string | null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: { error: string | null; resetKey: string | null }) {
    // New content: try again. The same content keeps its error.
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey }
  }

  render() {
    return this.state.error === null ? this.props.children : this.props.fallback(this.state.error)
  }
}

export function ServerBlock({ block, attributes, slots }: BlockComponentProps): ReactNode {
  const server = useContext(ServerBlocksContext)
  const store = server?.store ?? null
  const stored = server?.layout ? findBlock(server.layout, block.id) : null
  const key = store && stored ? store.keyOf(stored) : null
  const [view, setView] = useState<View>(() => (store && key ? nextView(EMPTY_VIEW, store.get(key)) : EMPTY_VIEW))
  const [shownKey, setShownKey] = useState<string | null>(null)

  // Ask for this render, and follow its entry. New content comes in a transition, so the old
  // content stays on screen while the new one finishes loading.
  useEffect(() => {
    if (!store || !key || !stored) return
    const update = () => {
      const entry = store.get(key)
      startTransition(() => {
        setView((current) => nextView(current, entry))
        if (entry?.status === 'ready') setShownKey(key)
      })
    }
    const unsubscribe = store.subscribe(key, update)
    const release = store.want(key, stored)
    update()
    return () => {
      unsubscribe()
      release()
    }
    // `stored` changes only with `key`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key])

  // New content changes the page: the canvas measures again.
  useLayoutEffect(() => {
    if (view.hasNode) store?.onRendered?.()
  }, [store, view])

  const label = store?.label(block.type) ?? block.type
  const box = (text: string, state: string) => (
    <div {...attributes} data-builder-server={state} style={BOX_STYLE}>
      {text}
    </div>
  )
  if (!store) return box(`${label}: no preview in the editor`, 'none')
  if (view.error !== null) return box(`${label}: the preview failed. ${view.error}`, 'error')
  const placeholder = box(label, 'loading')
  const rootAttributes = { ...attributes, [SERVER_BLOCK_ATTRIBUTE]: '', ...(view.pending ? { 'data-builder-loading': '' } : {}) }
  return (
    // Always mounted, so a transition keeps the shown content while new content suspends.
    <Suspense fallback={placeholder}>
      {view.hasNode ? (
        <ServerBoundary resetKey={shownKey} fallback={(error) => box(`${label}: the preview failed. ${error}`, 'error')}>
          <PreviewSlotsContext.Provider value={slots}>
            <PayloadRoot attributes={rootAttributes} label={label}>
              {view.node}
            </PayloadRoot>
          </PreviewSlotsContext.Provider>
        </ServerBoundary>
      ) : (
        placeholder
      )}
    </Suspense>
  )
}

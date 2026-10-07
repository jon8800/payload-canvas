'use client'

// Follow mode: click a collaborator's avatar and this editor's selection follows theirs, and the
// canvas scrolls to where they work. Esc, or selecting another block yourself, stops it.

import { useEffect } from 'react'

import { findBlock } from '../../../core'
import type { Runtime } from '../runtime'

/** How often the canvas may scroll after the followed pointer. */
const SCROLL_EVERY_MS = 600

export function useFollow(runtime: Runtime): void {
  useEffect(() => {
    const { store } = runtime
    /** The selection this hook made. A different one comes from the user. */
    let expected: string | null = null
    let seen: string | null | undefined
    let lastScroll = 0

    const scrollTo = (id: string) => {
      lastScroll = Date.now()
      runtime.postToCanvas({ type: 'scrollIntoView', id })
    }

    const followSelection = () => {
      const target = runtime.follow.get()
      if (!target) return
      const peer = runtime.peers.get().get(target)
      if (!peer) {
        runtime.follow.set(null)
        return
      }
      if (peer.selectedId === seen) return
      seen = peer.selectedId
      if (!peer.selectedId || !findBlock(store.getState().layout, peer.selectedId)) return
      expected = peer.selectedId
      store.select(peer.selectedId)
      scrollTo(peer.selectedId)
    }

    const followCursor = () => {
      const target = runtime.follow.get()
      if (!target || Date.now() - lastScroll < SCROLL_EVERY_MS) return
      const blockId = runtime.cursors.get().get(target)?.cursor?.blockId
      const measurement = runtime.measurement.get()
      if (!blockId || !measurement) return
      const rect = measurement.blocks.find((b) => b.id === blockId)?.rect
      if (!rect) return
      const inView = rect.y + rect.height > 0 && rect.y < measurement.viewport.height
      if (!inView) scrollTo(blockId)
    }

    const offFollow = runtime.follow.subscribe(() => {
      seen = undefined
      expected = null
      followSelection()
      if (runtime.follow.get() && expected === null) {
        lastScroll = 0
        followCursor()
      }
    })
    const offPeers = runtime.peers.subscribe(followSelection)
    const offCursors = runtime.cursors.subscribe(followCursor)
    const offStore = store.subscribe(() => {
      if (!runtime.follow.get() || expected === null) return
      const { selectedId } = store.getState()
      // A cleared selection can come from a delete; only the user's own pick stops following.
      if (selectedId !== null && selectedId !== expected) runtime.follow.set(null)
    })
    return () => {
      offFollow()
      offPeers()
      offCursors()
      offStore()
    }
  }, [runtime])
}

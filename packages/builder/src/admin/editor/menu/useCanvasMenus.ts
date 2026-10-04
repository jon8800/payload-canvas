'use client'

// Menus and the canvas iframe. The iframe's pointer events never reach the admin document, so
// the canvas script reports them: a press closes every open menu and popover, a right-click on a
// block opens the block menu at the pointer. A new selection closes the open menus too, and
// drops a rename that was asked for the old one.

import { useEffect } from 'react'

import { deepestBlockAt } from '../../../core'
import { unwrap, type CanvasToAdmin } from '../../../protocol'
import type { Runtime } from '../runtime'
import { dismissMenus } from './dismiss'
import { canvasToScreen, openBlockMenu, renameRequest } from './requests'

export function useCanvasMenus(runtime: Runtime) {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = unwrap<CanvasToAdmin>(event, runtime.iframeRef.current?.contentWindow)
      if (message?.type === 'pointerDown') {
        dismissMenus()
        return
      }
      if (message?.type !== 'contextMenu') return
      const measurement = runtime.measurement.get()
      if (!measurement) return
      // The same hit test as a click, so a right-click picks the block a click would select.
      const hit = deepestBlockAt(runtime.store.getState().layout, measurement, message)
      const at = canvasToScreen(runtime, message)
      if (hit && at) openBlockMenu(runtime, hit, at, 'canvas')
    }
    let last = runtime.store.getState().selectedId
    const unsubscribe = runtime.store.subscribe(() => {
      const { selectedId } = runtime.store.getState()
      if (selectedId === last) return
      last = selectedId
      dismissMenus()
      // A rename asked for another block is over.
      renameRequest(runtime).set(null)
    })
    window.addEventListener('message', onMessage)
    return () => {
      unsubscribe()
      window.removeEventListener('message', onMessage)
    }
  }, [runtime])
}

'use client'

// Closing rules for a top bar panel that is neither a `MenuButton` nor a `usePopover` popover (the
// shortcut help), the same as theirs: a press in the canvas iframe (the editor's dismiss signal)
// and the focus moving outside close it.

import { useEffect, useEffectEvent, type RefObject } from 'react'

import { onDismissMenus } from '../menu/dismiss'

/**
 * While `open`: `close` runs on the editor's dismiss signal, and when the focus moves to an
 * element outside `inside` (the popover and its trigger).
 */
export function useDismiss(open: boolean, close: () => void, inside: RefObject<HTMLElement | null>[]) {
  const onClose = useEffectEvent(close)
  const isInside = useEffectEvent((node: Node) => inside.some((ref) => ref.current?.contains(node)))
  useEffect(() => {
    if (!open) return
    const off = onDismissMenus(() => onClose())
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !isInside(e.target)) onClose()
    }
    // The focus entering the canvas iframe leaves this window.
    const onBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) onClose()
    }
    document.addEventListener('focusin', onFocusIn)
    window.addEventListener('blur', onBlur)
    return () => {
      off()
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('blur', onBlur)
    }
  }, [open])
}

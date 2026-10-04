// One signal that closes every open menu and popover in the editor.
//
// The editor sends it when the user presses anywhere in the canvas iframe (its pointer events
// never reach the admin document, so menus cannot see that press themselves) and when the
// selection changes. `MenuButton`, `ContextMenu` and `usePopover('auto')` listen to it. A menu
// or popover of your own: call `onDismissMenus(close)` while it is open.

const listeners = new Set<() => void>()

/** Closes every open menu and popover. */
export function dismissMenus(): void {
  for (const listener of listeners) listener()
}

/** Calls `listener` on each dismiss signal. Returns the unsubscribe function. */
export function onDismissMenus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

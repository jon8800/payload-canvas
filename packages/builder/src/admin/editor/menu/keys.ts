// Shortcut text for menus, tooltips and the shortcut help, with the platform's modifier keys.
// Pure: no React, no DOM besides `navigator`.

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** Key caps for one shortcut: `mod` is ⌘ or Ctrl, `alt` is ⌥ or Alt, `shift` is ⇧ or Shift. Other keys stay as they are. */
export function keyCaps(keys: readonly string[], mac = isMac()): string[] {
  return keys.map((key) => {
    if (key === 'mod') return mac ? '⌘' : 'Ctrl'
    if (key === 'alt') return mac ? '⌥' : 'Alt'
    if (key === 'shift') return mac ? '⇧' : 'Shift'
    return key
  })
}

/** One shortcut as short text: "Ctrl+Alt+C" on Windows and Linux, "⌘⌥C" on a Mac. */
export function keyText(keys: readonly string[], mac = isMac()): string {
  return keyCaps(keys, mac).join(mac ? '' : '+')
}

/** The editor's block shortcuts, by action. Menus show them as hints; `shortcuts.ts` handles the keys. */
export const BLOCK_KEYS = {
  parent: ['shift', 'Enter'],
  rename: ['F2'],
  moveUp: ['alt', '↑'],
  moveDown: ['alt', '↓'],
  duplicate: ['mod', 'D'],
  copy: ['mod', 'C'],
  cut: ['mod', 'X'],
  paste: ['mod', 'V'],
  copyStyles: ['mod', 'alt', 'C'],
  pasteStyles: ['mod', 'alt', 'V'],
  hide: ['mod', 'shift', 'H'],
  delete: ['Del'],
  menu: ['shift', 'F10'],
} as const satisfies Record<string, readonly string[]>

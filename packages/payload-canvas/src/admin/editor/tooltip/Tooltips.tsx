'use client'

// THE TOOLTIP STANDARD FOR THE EDITOR. Use it for every hint on a control or an icon.
//
//   <button aria-label="Duplicate" data-tooltip="Duplicate · Ctrl+D">…</button>
//   <span data-tooltip={'Line one\nLine two'} data-tooltip-side="right">…</span>
//
// - `data-tooltip`: the text. Line breaks (\n) are kept; long text wraps at 320 px.
// - `data-tooltip-side`: `bottom` (default), `top`, `left` or `right`. A side without room flips.
// - The tooltip shows on hover after a short delay and on keyboard focus. A press, Escape, a
//   scroll and an open menu (`aria-expanded="true"` on the element) hide it.
// - One tooltip element lives in the browser's top layer, so scroll containers (the outline, the
//   inspector) never clip it, and it sits above menus and popovers. It is a delegated listener:
//   memoized rows need no wrapper component, and it works for elements in any file.
// - Do not use the `title` attribute in the editor: it shows late, never on keyboard focus, and
//   it does not look like Payload. Keep an `aria-label` on icon-only buttons; the tooltip adds a
//   description for screen readers only when its text differs from that label.
//
// `<Tooltips />` installs the controller. The editor mounts it once (in the canvas overlay);
// mounting it again elsewhere is harmless.

import { useEffect } from 'react'

import { installTooltips } from './controller'
import './tooltip.scss'

export function Tooltips() {
  useEffect(() => installTooltips(document), [])
  return null
}

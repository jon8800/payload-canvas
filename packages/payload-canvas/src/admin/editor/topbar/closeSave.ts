// Closing the builder's settings drawer with an edit that autosave has not saved yet. Payload's
// autosave waits for its interval, and the drawer's "Close" button (`#close-drawer__<slug>`) and
// Escape close it at once: the form unmounts and the edit was lost without a word. (Payload's own
// header X asks "Leave without saving?" instead, and is left alone.)
//
// So, while the form still holds the edit, the close waits: the form saves the draft as Payload's
// autosave would (the form's own `submit`, so access, hooks, validation, the document lock and the
// builder's write gate and stale-form checks apply), and the drawer closes when that worked. When
// it fails (a conflict, a validation error, offline), the drawer stays open with the typed values
// and Payload's errors. Only collections with draft autosave: without autosave, "Save draft" stays
// the user's choice, as in Payload. Never publishes.

/** The URL of the drawer's autosave, with the parameters Payload's autosave sends. */
export function autosaveAction(input: { api: string; collection: string; id: string | number; locale?: string | null }): string {
  const params = new URLSearchParams({ autosave: 'true', depth: '0', draft: 'true', 'fallback-locale': 'null' })
  if (input.locale) params.set('locale', input.locale)
  return `${input.api}/${encodeURIComponent(input.collection)}/${encodeURIComponent(String(input.id))}?${params}`
}

/** The part of an element this file reads (tests pass fakes). */
export type CloseTarget = { closest(selector: string): unknown }

/**
 * Popups inside the drawer that handle Escape themselves: an expanded control (a select's or a
 * relationship's open menu, a disclosure), a listbox or menu, a dialog inside the drawer, an open
 * Payload popup. Their Escape closes them, never the drawer.
 */
const OWN_ESCAPE = '[aria-expanded="true"], [role="listbox"], [role="menu"], [role="dialog"], .popup__content'

/**
 * Where an Escape in the topmost drawer goes: `popup` when the focus is in a popup inside it (see
 * `OWN_ESCAPE`), `close` when it closes the drawer. `none`: not an Escape for this drawer.
 */
export function escapeRoute(
  event: { type: string; key?: string; target: CloseTarget | null },
  topmost: boolean,
  /** The drawer's element: it is a dialog itself, so it never counts as a popup in it. */
  drawer?: unknown,
): 'popup' | 'close' | 'none' {
  if (event.type !== 'keydown' || event.key !== 'Escape' || !topmost) return 'none'
  const popup = event.target?.closest(OWN_ESCAPE) ?? null
  return popup === null || popup === drawer ? 'close' : 'popup'
}

/**
 * True when the event closes the drawer `slug` at once, without Payload asking first: a click on
 * its "Close" button (the blurred area beside it), or Escape while it is the topmost drawer and
 * no popup inside it has the focus.
 */
export function closesDrawerAtOnce(
  event: { type: string; key?: string; target: CloseTarget | null },
  slug: string,
  topmost: boolean,
  drawer?: unknown,
): boolean {
  if (event.type === 'keydown') return escapeRoute(event, topmost, drawer) === 'close'
  if (event.type !== 'click' || !event.target) return false
  return event.target.closest(`[id="close-drawer__${slug}"].drawer__close`) !== null
}

/** The keys of a keyboard event that the copy for a popup keeps. */
export type EscapeInit = { key: string; code: string; bubbles: boolean; cancelable: boolean; composed: boolean; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }

/**
 * Sends an Escape meant for a popup inside the drawer to that popup only. Payload's modal provider
 * closes the topmost modal on every Escape that reaches `document` with `keyCode` 27, and in the
 * admin React handles its events on `document` too, so a popup's own handler (react-select, Payload's
 * Popup, a dialog) cannot stop it: the whole drawer closed with the menu. So the original event
 * stops here (capture phase), and a new Escape goes to the same element. A constructed keyboard
 * event has `keyCode` 0: the popup's handlers read `key` and close it; the modal provider ignores
 * it. `forwarded` remembers the copies, so this listener lets them through.
 */
export function forwardEscape(
  event: { target: unknown; stopImmediatePropagation(): void; preventDefault(): void; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean },
  make: (init: EscapeInit) => object,
  forwarded: WeakSet<object>,
): void {
  const target = event.target as { dispatchEvent?: (event: object) => boolean } | null
  event.stopImmediatePropagation()
  event.preventDefault()
  if (typeof target?.dispatchEvent !== 'function') return
  const copy = make({
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
    composed: true,
    shiftKey: Boolean(event.shiftKey),
    ctrlKey: Boolean(event.ctrlKey),
    altKey: Boolean(event.altKey),
    metaKey: Boolean(event.metaKey),
  })
  forwarded.add(copy)
  target.dispatchEvent(copy)
}

/** True when closing must wait for a save: an unsaved edit in a form that autosaves. */
export function closeMustSave(state: { modified: boolean; autosave: boolean; saving: boolean }): boolean {
  return state.autosave && (state.modified || state.saving)
}

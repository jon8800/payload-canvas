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
  popupOpen = false,
): 'popup' | 'close' | 'none' {
  if (event.type !== 'keydown' || event.key !== 'Escape' || !topmost) return 'none'
  if (popupOpen) return 'popup'
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

/**
 * Payload's focus trap reads Escape during capture; its modal provider reads keyCode during
 * bubbling. Keep both from closing the drawer, but let the popup read Escape at the target and
 * during bubbling. Replaying an Escape would run the focus trap again and release its focus.
 */
export function keepEscapeInPopup(event: KeyboardEvent): void {
  Object.defineProperties(event, {
    key: { configurable: true, get: () => event.eventPhase === event.CAPTURING_PHASE ? 'Unidentified' : 'Escape' },
    keyCode: { configurable: true, value: 0 },
  })
}

/** Payload portals have no owner ID, so remember which trigger opened them. */
export function trackDrawerPopups(drawer: Element) {
  const document = drawer.ownerDocument
  let previous = new Set(document.querySelectorAll('.popup__content'))
  let openedHere = false
  const owned = new Set<Element>()
  return (event: { type: string; key?: string; target: Element | null }): boolean => {
    const current = new Set(document.querySelectorAll('.popup__content'))
    for (const popup of current) {
      if (openedHere && !previous.has(popup)) owned.add(popup)
    }
    for (const popup of owned) {
      if (!current.has(popup)) owned.delete(popup)
    }
    previous = current
    openedHere = false
    if (event.type === 'click' || event.type === 'mouseover' || (event.type === 'keydown' && (event.key === 'Enter' || event.key === ' '))) {
      const trigger = event.target?.closest('.popup__trigger-wrap')
      openedHere = Boolean(trigger && (drawer.contains(trigger) || [...owned].some((popup) => popup.contains(trigger))))
    }
    return owned.size > 0
  }
}

/** True when closing must wait for a save: an unsaved edit in a form that autosaves. */
export function closeMustSave(state: { modified: boolean; autosave: boolean; saving: boolean }): boolean {
  return state.autosave && (state.modified || state.saving)
}

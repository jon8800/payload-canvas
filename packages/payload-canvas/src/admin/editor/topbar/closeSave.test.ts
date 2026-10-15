import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { autosaveAction, closeMustSave, closesDrawerAtOnce, escapeRoute, forwardEscape, type CloseTarget, type EscapeInit } from './closeSave'

/** An element that matches the selectors in `matches`. */
const element = (...matches: string[]): CloseTarget => ({ closest: (selector) => (matches.includes(selector) ? {} : null) })
const closeButton = '[id="close-drawer__settings"].drawer__close'

describe('closing the settings drawer with an unsaved autosave edit', () => {
  it("saves to Payload's autosave URL, as a draft with the form's locale", () => {
    const url = new URL(autosaveAction({ api: '/api', collection: 'pages', id: 7, locale: 'fr' }), 'http://localhost')
    assert.equal(url.pathname, '/api/pages/7')
    assert.deepEqual(Object.fromEntries(url.searchParams), { autosave: 'true', depth: '0', draft: 'true', 'fallback-locale': 'null', locale: 'fr' })
  })

  it('holds only the closes that skip Payload\'s own "Leave without saving?" question', () => {
    // The drawer's Close button (the blurred area beside it).
    assert.equal(closesDrawerAtOnce({ type: 'click', target: element(closeButton) }, 'settings', true), true)
    // The header X asks first (Payload): left alone. So are other clicks and other drawers.
    assert.equal(closesDrawerAtOnce({ type: 'click', target: element('.doc-drawer__header-close') }, 'settings', true), false)
    assert.equal(closesDrawerAtOnce({ type: 'click', target: element('[id="close-drawer__other"].drawer__close') }, 'settings', true), false)
    assert.equal(closesDrawerAtOnce({ type: 'click', target: null }, 'settings', true), false)
    // Escape closes the topmost modal: only when that is this drawer.
    assert.equal(closesDrawerAtOnce({ type: 'keydown', key: 'Escape', target: null }, 'settings', true), true)
    assert.equal(closesDrawerAtOnce({ type: 'keydown', key: 'Escape', target: null }, 'settings', false), false)
    assert.equal(closesDrawerAtOnce({ type: 'keydown', key: 'Tab', target: null }, 'settings', true), false)
  })

  it('waits only for an edit autosave would save; manual "Save draft" stays the user\'s choice', () => {
    assert.equal(closeMustSave({ autosave: true, modified: true, saving: false }), true)
    assert.equal(closeMustSave({ autosave: true, modified: false, saving: true }), true, 'a save in progress')
    assert.equal(closeMustSave({ autosave: true, modified: false, saving: false }), false)
    assert.equal(closeMustSave({ autosave: false, modified: true, saving: false }), false)
  })
})

/** An element inside the drawer whose closest popup is `popup` (the drawer itself is a dialog). */
const focused = (popup: unknown): CloseTarget => ({ closest: () => popup })

describe('Escape inside the drawer', () => {
  const drawer = {}

  it('leaves Escape to an open popup in the drawer, and closes on a bare Escape', () => {
    const escape = (target: CloseTarget | null) => closesDrawerAtOnce({ type: 'keydown', key: 'Escape', target }, 'settings', true, drawer)
    // A select's or relationship's open menu, a listbox, a menu, a dialog in the drawer, a Payload popup.
    assert.equal(escape(focused({ expanded: true })), false)
    // Focus in an ordinary field: the closest dialog is the drawer itself.
    assert.equal(escape(focused(drawer)), true)
    // Focus nowhere in particular.
    assert.equal(escape(focused(null)), true)
    assert.equal(escape(null), true)
  })

  it('asks for exactly the popups that handle Escape themselves', () => {
    const asked: string[] = []
    closesDrawerAtOnce({ type: 'keydown', key: 'Escape', target: { closest: (selector) => (asked.push(selector), null) } }, 'settings', true, drawer)
    const selector = asked[0] ?? ''
    for (const part of ['[aria-expanded="true"]', '[role="listbox"]', '[role="menu"]', '[role="dialog"]', '.popup__content']) {
      assert.ok(selector.includes(part), part)
    }
  })
})

/** The propagation methods of a fake keyboard event: `stopped` after stopImmediatePropagation. */
function keyMethods() {
  return {
    stopped: false,
    stopImmediatePropagation(this: { stopped: boolean }) {
      this.stopped = true
    },
    preventDefault() {},
  }
}

/**
 * The admin's real order for a keydown: the builder's capture listener on window, then, on
 * `document`, React's handler (react-select reads `key`) and Payload's modal provider (closes the
 * topmost modal when `keyCode` is 27). `forward: false` is the old behaviour (step aside).
 */
function adminKeydown(options: { forward: boolean }) {
  const state = { menuOpen: true, drawerOpen: true }
  const drawer = {}
  const forwarded = new WeakSet<object>()
  type Key = { key: string; keyCode: number; stopped: boolean; stopImmediatePropagation(): void; preventDefault(): void; target: unknown }
  const input = {
    closest: (selector: string) => (state.menuOpen && selector.includes('[aria-expanded="true"]') ? input : drawer),
    dispatchEvent: (event: object) => {
      run(event as Key)
      return true
    },
  }
  const builderCapture = (event: Key) => {
    if (forwarded.has(event)) return
    if (escapeRoute({ type: 'keydown', key: event.key, target: input }, true, drawer) !== 'popup') return
    if (options.forward) forwardEscape(event, (init: EscapeInit) => ({ ...init, keyCode: 0, ...keyMethods(), target: input }), forwarded)
  }
  const reactSelect = (event: Key) => {
    if (event.key === 'Escape' && state.menuOpen) state.menuOpen = false
  }
  const modalProvider = (event: Key) => {
    if (event.keyCode === 27) state.drawerOpen = false
  }
  function run(event: Key) {
    for (const listener of [builderCapture, reactSelect, modalProvider]) {
      listener(event)
      if (event.stopped) return
    }
  }
  const press = () => run({ key: 'Escape', keyCode: 27, target: input, ...keyMethods() } as Key)
  return { state, press }
}

describe('Escape in an open select in the drawer, in the admin event order', () => {
  it('closes the menu only, and the drawer keeps its form', () => {
    const admin = adminKeydown({ forward: true })
    admin.press()
    assert.deepEqual(admin.state, { menuOpen: false, drawerOpen: true })
    // The next Escape (no popup open any more) is a bare Escape: the drawer path handles it.
    assert.equal(escapeRoute({ type: 'keydown', key: 'Escape', target: { closest: () => null } }, true, {}), 'close')
  })

  it('stepping aside is not enough: the modal provider closed the drawer with the menu', () => {
    const admin = adminKeydown({ forward: false })
    admin.press()
    assert.deepEqual(admin.state, { menuOpen: false, drawerOpen: false })
  })

  it("forwards an Escape without keyCode, keeping the modifier keys, and stops the original", () => {
    const calls: string[] = []
    let sent: Record<string, unknown> | null = null
    const forwarded = new WeakSet<object>()
    forwardEscape(
      {
        target: { dispatchEvent: (event: object) => ((sent = event as Record<string, unknown>), true) },
        shiftKey: true,
        stopImmediatePropagation: () => calls.push('stop'),
        preventDefault: () => calls.push('prevent'),
      },
      (init) => ({ ...init }),
      forwarded,
    )
    assert.deepEqual(calls, ['stop', 'prevent'])
    assert.ok(sent)
    const copy = sent as Record<string, unknown>
    assert.equal(copy.key, 'Escape')
    assert.equal(copy.bubbles, true)
    assert.equal(copy.shiftKey, true)
    assert.equal('keyCode' in copy, false, 'the modal provider reads keyCode: the copy has none')
    assert.equal(forwarded.has(copy), true)
  })
})

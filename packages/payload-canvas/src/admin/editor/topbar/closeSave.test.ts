import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { autosaveAction, closeMustSave, closesDrawerAtOnce, escapeRoute, type CloseTarget } from './closeSave'

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

  it('routes an owned portal to its popup only while this drawer is topmost', () => {
    const event = { type: 'keydown', key: 'Escape', target: focused(drawer) }
    assert.equal(escapeRoute(event, true, drawer, true), 'popup')
    assert.equal(escapeRoute(event, false, drawer, true), 'none')
    assert.equal(escapeRoute({ ...event, key: 'Tab' }, true, drawer, true), 'none')
  })
})

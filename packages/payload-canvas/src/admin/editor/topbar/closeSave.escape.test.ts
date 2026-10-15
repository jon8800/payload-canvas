import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it, type TestContext } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

import { closesDrawerAtOnce, escapeRoute, keepEscapeInPopup, trackDrawerPopups } from './closeSave'

// Use the same installed dependencies as Payload, without a second DOM or focus-trap version.
const require = createRequire(import.meta.url)
const uiRequire = createRequire(require.resolve('@payloadcms/ui'))
const modalRequire = createRequire(uiRequire.resolve('@faceless-ui/modal'))
const lexicalRequire = createRequire(require.resolve('@payloadcms/richtext-lexical'))
const headlessRequire = createRequire(lexicalRequire.resolve('@lexical/headless'))
const { Window: DOMWindow } = await import(pathToFileURL(headlessRequire.resolve('happy-dom')).href)
const { createFocusTrap } = modalRequire('focus-trap')
const { default: Select, defaultProps } = uiRequire('react-select/base')

function setup(t: TestContext, options: { dirty?: boolean; topmost?: boolean; backgroundPopup?: boolean } = {}) {
  const window = new DOMWindow() as Window & { happyDOM: { abort(): Promise<void> } }
  const { document } = window
  const globals = ['window', 'document', 'Document', 'Node', 'Element', 'HTMLElement', 'getComputedStyle', 'ShadowRoot', 'HTMLIFrameElement', 'MutationObserver']
  const restoreGlobals = globals.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? window : Reflect.get(window, key) })
    return () => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  document.body.innerHTML = `
    <button id="open">Page settings</button>
    <div class="popup"><div class="popup__trigger-wrap"><button id="outside">Outside actions</button></div></div>
    <dialog open class="drawer payload__modal-item" id="settings">
      <button class="drawer__close" id="close-drawer__settings">Close</button>
      <button class="doc-drawer__header-close" id="header-close">X</button>
      <input id="select" aria-expanded="true">
      <input id="title">
      <div class="popup"><div class="popup__trigger-wrap"><button id="row-actions">Row actions</button></div></div>
    </dialog>
    <div id="portal" class="popup__hidden-content"><button id="action">Remove</button></div>
    ${options.backgroundPopup ? '<div class="popup__content" id="background"></div>' : ''}
  `
  function element(id: string): HTMLElement {
    return document.getElementById(id)!
  }
  const drawer = element('settings')
  const portal = element('portal')
  element('open').focus()
  const trap = createFocusTrap(drawer, { fallbackFocus: drawer, allowOutsideClick: true, delayInitialFocus: false })
  trap.activate()
  t.after(async () => {
    trap.deactivate({ returnFocus: false })
    await setTimeout(0)
    await window.happyDOM.abort()
    for (const restore of restoreGlobals) restore()
  })

  const state = { drawerOpen: true, saves: 0, headerPrompts: 0, selectOpen: true }
  const trackPopups = trackDrawerPopups(drawer)
  const topmost = options.topmost ?? true
  const hold = (event: Event) => {
    const target = event.target as Element | null
    const input = { type: event.type, key: (event as KeyboardEvent).key, target }
    if (escapeRoute(input, topmost, drawer, trackPopups(input)) === 'popup') {
      keepEscapeInPopup(event as KeyboardEvent)
      return
    }
    if (options.dirty && closesDrawerAtOnce(input, 'settings', topmost, drawer)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      state.saves++
    }
  }
  for (const type of ['click', 'keydown', 'mouseover']) window.addEventListener(type, hold, true)
  // These are the installed react-select handler and faceless modal provider's document order.
  const select = new Select({
    ...defaultProps,
    menuIsOpen: true,
    onInputChange() {},
    onMenuClose() {
      state.selectOpen = false
      element('select').setAttribute('aria-expanded', 'false')
    },
  })
  select.setState = (value: object) => Object.assign(select.state, value)
  document.addEventListener('keydown', (event) => {
    if (event.target === element('select') && state.selectOpen) select.onKeyDown(event)
  })
  document.addEventListener('keydown', (event) => {
    if (event.keyCode === 27) state.drawerOpen = false
  })
  // Payload Popup closes on document keydown and restores its trigger's focus.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !portal.classList.contains('popup__content')) return
    event.preventDefault()
    portal.className = 'popup__hidden-content'
    element('row-actions').focus()
  })
  element('row-actions').addEventListener('click', () => { portal.className = 'popup__content' })
  element('row-actions').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') portal.className = 'popup__content'
  })
  element('header-close').addEventListener('click', () => { state.headerPrompts++ })
  element('close-drawer__settings').addEventListener('click', () => { state.drawerOpen = false })
  function press(id: string, key = 'Escape') {
    const event = new (Reflect.get(window, 'KeyboardEvent'))('keydown', { key, code: key, shiftKey: true, bubbles: true, cancelable: true }) as KeyboardEvent
    Object.defineProperty(event, 'keyCode', { configurable: true, value: key === 'Escape' ? 27 : 13 })
    element(id).dispatchEvent(event)
    return event
  }
  return { document, element, portal, drawer, trap, state, press, trackPopups }
}

describe('settings Escape with Payload focus and popup listeners', () => {
  it('closes react-select once and keeps the drawer focus trap active', (t) => {
    const app = setup(t, { dirty: true })
    app.element('select').focus()
    let received: KeyboardEvent | undefined
    let targetKey: string | undefined
    let captureKey: string | undefined
    app.document.addEventListener('keydown', (event) => { captureKey = event.key }, true)
    app.element('select').addEventListener('keydown', (event) => {
      received = event
      targetKey = event.key
    })
    const original = app.press('select')
    assert.equal(received, original, 'the popup receives the original event, not a replay')
    assert.equal(original.key, 'Escape')
    assert.equal(targetKey, 'Escape')
    assert.equal(captureKey, 'Unidentified')
    assert.equal(original.shiftKey, true)
    assert.deepEqual(app.state, { drawerOpen: true, saves: 0, headerPrompts: 0, selectOpen: false })
    assert.equal(app.trap.active, true)
    app.element('outside').focus()
    assert.equal(app.drawer.contains(app.document.activeElement), true, 'focus still cannot leave the drawer')
    app.press('select')
    assert.equal(app.state.saves, 1, 'the next, bare Escape follows the save-before-close path')
  })

  for (const activation of ['mouse', 'keyboard'] as const) {
    it(`closes a portalled row menu opened by ${activation} without saving or closing the drawer`, (t) => {
      const app = setup(t, { dirty: true })
      const trigger = app.element('row-actions')
      trigger.focus()
      assert.equal(trigger.hasAttribute('aria-expanded'), false)
      if (activation === 'mouse') trigger.click()
      else app.press('row-actions', 'Enter')
      assert.equal(app.drawer.contains(app.portal), false)
      app.press('row-actions')
      assert.equal(app.portal.className, 'popup__hidden-content')
      assert.equal(app.state.drawerOpen, true)
      assert.equal(app.state.saves, 0)
      assert.equal(app.trap.active, true)
      assert.equal(app.document.activeElement, trigger)
      app.press('row-actions')
      assert.equal(app.state.saves, 1)
    })
  }

  it('ignores a popup already open behind the drawer', (t) => {
    const app = setup(t, { dirty: true, backgroundPopup: true })
    app.element('title').focus()
    app.press('title')
    assert.equal(app.state.saves, 1)
  })

  it('does not claim a popup opened from outside the drawer', (t) => {
    const app = setup(t)
    app.element('outside').click()
    app.portal.className = 'popup__content'
    assert.equal(app.trackPopups({ type: 'keydown', key: 'Escape', target: app.element('title') }), false)
  })

  it('keeps bare Escape, the fast Close button, and the header confirmation paths', (t) => {
    const app = setup(t, { dirty: true })
    app.press('title')
    app.element('close-drawer__settings').click()
    assert.equal(app.state.saves, 2)
    assert.equal(app.state.drawerOpen, true)
    app.element('header-close').click()
    assert.equal(app.state.headerPrompts, 1)
    assert.equal(app.state.saves, 2)
  })

  it('lets a clean bare Escape close the drawer normally', (t) => {
    const app = setup(t)
    app.element('title').focus()
    app.press('title')
    assert.equal(app.state.drawerOpen, false)
    assert.equal(app.state.saves, 0)
    assert.equal(app.trap.active, false)
  })

  it('leaves Escape untouched when a confirmation is above the drawer', (t) => {
    const app = setup(t, { dirty: true, topmost: false })
    app.element('row-actions').click()
    const event = app.press('row-actions')
    assert.equal(event.keyCode, 27)
    assert.equal(app.state.saves, 0)
  })
})

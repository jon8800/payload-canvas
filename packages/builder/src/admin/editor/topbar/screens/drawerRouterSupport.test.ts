import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createContext } from 'react'

import { drawerLinkHref, hooksFollow, REQUIRED_CONTEXTS, routerSupport, withoutUndefinedLocale, type LinkClick } from './drawerRouterSupport'

const push = () => {}
const link = (href: string | null, target = '', download = false) => ({ href, target, download })
const allContexts = () => Object.fromEntries(REQUIRED_CONTEXTS.map((name) => [name, createContext(null)]))

describe('drawer router fallback', () => {
  it('runs when every Next context is there', () => {
    assert.deepEqual(routerSupport(allContexts()), { ok: true })
  })

  it('falls back when a context is missing', () => {
    const exports: Record<string, unknown> = allContexts()
    delete exports.PathnameContext
    const support = routerSupport(exports)
    assert.equal(support.ok, false)
    assert.match(support.ok ? '' : support.reason, /PathnameContext/)
  })

  it('falls back when an export is no longer a React context', () => {
    const support = routerSupport({ ...allContexts(), AppRouterContext: { Provider: () => null } })
    assert.equal(support.ok, false)
  })

  it('falls back when the development flag turns it off', () => {
    assert.equal(routerSupport(allContexts(), true).ok, false)
  })

  it('falls back when the hooks do not read the drawer values', () => {
    const expected = { pathname: '/admin/collections/pages/3/versions', search: '?page=2', push }
    assert.equal(hooksFollow(expected, { pathname: expected.pathname, search: 'page=2', push }), true)
    // Next reads the page around the drawer.
    assert.equal(hooksFollow(expected, { pathname: '/admin/builder/pages/3', search: '', push }), false)
    assert.equal(hooksFollow(expected, { pathname: expected.pathname, search: 'page=2', push: () => {} }), false)
  })
})

describe('drawer link clicks', () => {
  const origin = 'http://localhost:3000'
  const click: LinkClick = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }

  it('takes plain clicks on links to the admin', () => {
    assert.equal(drawerLinkHref(click, link('/admin/collections/pages/3/versions/9'), origin), '/admin/collections/pages/3/versions/9')
    assert.equal(drawerLinkHref(click, link(`${origin}/admin/x`), origin), `${origin}/admin/x`)
    assert.equal(drawerLinkHref(click, link('?page=2', '_self'), origin), '?page=2')
  })

  it('leaves new-tab clicks, other windows, downloads and other sites alone', () => {
    assert.equal(drawerLinkHref({ ...click, metaKey: true }, link('/admin/x'), origin), null)
    assert.equal(drawerLinkHref({ ...click, button: 1 }, link('/admin/x'), origin), null)
    assert.equal(drawerLinkHref({ ...click, defaultPrevented: true }, link('/admin/x'), origin), null)
    assert.equal(drawerLinkHref(click, link('/admin/x', '_blank'), origin), null)
    assert.equal(drawerLinkHref(click, link('/api/x', '', true), origin), null)
    assert.equal(drawerLinkHref(click, link('#top'), origin), null)
    assert.equal(drawerLinkHref(click, link('https://payloadcms.com/docs'), origin), null)
    assert.equal(drawerLinkHref(click, link('mailto:a@b.c'), origin), null)
    assert.equal(drawerLinkHref(click, null, origin), null)
  })
})

describe('API screen URL', () => {
  it('drops locale=undefined and keeps the other parameters', () => {
    const base = 'http://localhost:3300/api/pages/1'
    assert.equal(withoutUndefinedLocale(`${base}?depth=2&draft=false&locale=undefined&trash=false`), `${base}?depth=2&draft=false&trash=false`)
    assert.equal(withoutUndefinedLocale(`${base}?locale=undefined&depth=2`), `${base}?depth=2`)
    assert.equal(withoutUndefinedLocale(`${base}?depth=2&locale=undefined`), `${base}?depth=2`)
    assert.equal(withoutUndefinedLocale(`${base}?depth=2&locale=en`), `${base}?depth=2&locale=en`)
  })
})

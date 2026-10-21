import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { filterHref } from './filterLink'

describe('filterHref', () => {
  it('sets a value and keeps the other params', () => {
    assert.deepEqual(filterHref('/escorts', {}, { param: 'available', value: 'today' }), { href: '/escorts?available=today', active: false })
    const today = { available: 'today', new: 'month' }
    assert.deepEqual(filterHref('/escorts', today, { param: 'available', value: 'today' }), { href: '/escorts?new=month&available=today', active: true })
    assert.equal(filterHref('/escorts', today, { param: 'available', value: 'week' }).href, '/escorts?new=month&available=week')
  })

  it('clears one param, or every param', () => {
    const today = new URLSearchParams('available=today&new=month')
    assert.equal(filterHref('/escorts', today, { param: 'new', value: '' }).href, '/escorts?available=today')
    assert.deepEqual(filterHref('/escorts', today, { param: '', value: '' }), { href: '/escorts', active: false })
    assert.deepEqual(filterHref('/escorts', {}, { param: '', value: '' }), { href: '/escorts', active: true })
    assert.equal(filterHref('/escorts', {}, { param: 'new', value: '' }).active, true)
  })

  it('toggles a value in a comma list with multiple', () => {
    const hair = { hair: ['blonde', 'red'] }
    assert.deepEqual(filterHref('/e', hair, { param: 'hair', value: 'red', multiple: true }), { href: '/e?hair=blonde', active: true })
    assert.equal(filterHref('/e', new URLSearchParams('hair=blonde'), { param: 'hair', value: 'brunette', multiple: true }).href, '/e?hair=blonde,brunette')
    assert.equal(filterHref('/e', { hair: 'red' }, { param: 'hair', value: 'red', multiple: true }).href, '/e')
  })

  it('encodes keys and values, and gives a relative href without a path', () => {
    assert.equal(filterHref('/e', { 'a b': 'x&y' }, { param: 'c', value: 'é' }).href, '/e?a%20b=x%26y&c=%C3%A9')
    assert.equal(filterHref('', {}, { param: 'available', value: 'today' }).href, '?available=today')
    assert.equal(filterHref('', {}, { param: '', value: '' }).href, '?')
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { filterHref } from './filterLink'

describe('filterHref', () => {
  it('sets a value and keeps the other params', () => {
    assert.deepEqual(filterHref('/blog', {}, { param: 'category', value: 'news' }), { href: '/blog?category=news', active: false })
    assert.deepEqual(filterHref('/blog', { page: '3', new: 'month' }, { param: 'category', value: 'news' }), { href: '/blog?new=month&category=news', active: false })
    const news = { category: 'news', new: 'month' }
    assert.deepEqual(filterHref('/blog', news, { param: 'category', value: 'news' }), { href: '/blog?new=month&category=news', active: true })
    assert.equal(filterHref('/blog', news, { param: 'category', value: 'guides' }).href, '/blog?new=month&category=guides')
  })

  it('clears one param, or every param', () => {
    const news = new URLSearchParams('category=news&new=month')
    assert.equal(filterHref('/blog', news, { param: 'new', value: '' }).href, '/blog?category=news')
    assert.deepEqual(filterHref('/blog', news, { param: '', value: '' }), { href: '/blog', active: false })
    assert.deepEqual(filterHref('/blog', {}, { param: '', value: '' }), { href: '/blog', active: true })
    assert.equal(filterHref('/blog', {}, { param: 'new', value: '' }).active, true)
  })

  it('toggles a value in a comma list with multiple', () => {
    const tag = { tag: ['css', 'react'] }
    assert.deepEqual(filterHref('/e', tag, { param: 'tag', value: 'react', multiple: true }), { href: '/e?tag=css', active: true })
    assert.equal(filterHref('/e', new URLSearchParams('tag=css'), { param: 'tag', value: 'html', multiple: true }).href, '/e?tag=css,html')
    assert.equal(filterHref('/e', { tag: 'react' }, { param: 'tag', value: 'react', multiple: true }).href, '/e')
  })

  it('encodes keys and values, and gives a relative href without a path', () => {
    assert.equal(filterHref('/e', { 'a b': 'x&y' }, { param: 'c', value: 'é' }).href, '/e?a%20b=x%26y&c=%C3%A9')
    assert.equal(filterHref('', {}, { param: 'category', value: 'news' }).href, '?category=news')
    assert.equal(filterHref('', {}, { param: '', value: '' }).href, '?')
  })
})

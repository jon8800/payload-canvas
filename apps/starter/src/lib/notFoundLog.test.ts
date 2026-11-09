import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isJunkPath, nextNotFoundEntry, notFoundPath, notFoundReferrer } from './notFoundLog'

describe('notFoundPath', () => {
  it('stores one form per path: no query, hash or trailing slash', () => {
    assert.equal(notFoundPath('/old-page/?utm=1#top'), '/old-page')
    assert.equal(notFoundPath('//blog//post/'), '/blog/post')
    assert.equal(notFoundPath('/caf%C3%A9'), '/café')
    assert.equal(notFoundPath('/'), '/')
  })

  it('skips empty, very long and junk paths', () => {
    assert.equal(notFoundPath(null), null)
    assert.equal(notFoundPath(''), null)
    assert.equal(notFoundPath(`/${'a'.repeat(400)}`), null)
    assert.equal(notFoundPath('/wp-admin/setup.php'), null)
    assert.equal(notFoundPath('/.env'), null)
  })

  it('keeps a path that does not decode', () => {
    assert.equal(notFoundPath('/bad%E0%A4%A'), '/bad%E0%A4%A')
  })
})

describe('isJunkPath', () => {
  it('flags paths only bots ask for', () => {
    for (const path of ['/wp-login.php', '/wordpress/', '/xmlrpc.php', '/index.php', '/.git/config', '/.well-known/x', '/cgi-bin/a', '/phpmyadmin', '/backup.sql', '/config.yml']) {
      assert.equal(isJunkPath(path), true, path)
    }
  })

  it('flags files browsers ask for on their own', () => {
    for (const path of ['/favicon.ico', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/site.webmanifest']) assert.equal(isJunkPath(path), true, path)
  })

  it('keeps real pages', () => {
    for (const path of ['/about-us', '/blog/my-post', '/pricing', '/docs/v1.2/intro', '/wp']) assert.equal(isJunkPath(path), false, path)
  })
})

describe('nextNotFoundEntry', () => {
  const now = new Date('2026-11-09T10:00:00.000Z')

  it('starts a new path at one hit', () => {
    assert.deepEqual(nextNotFoundEntry(null, { path: '/x', referrer: 'https://a.test/', now }), {
      path: '/x',
      hits: 1,
      lastSeen: now.toISOString(),
      lastReferrer: 'https://a.test/',
    })
  })

  it('adds a hit to an existing path and keeps the last referrer when the hit has none', () => {
    const entry = nextNotFoundEntry({ hits: 4, lastReferrer: 'https://a.test/' }, { path: '/x', referrer: null, now })
    assert.equal(entry.hits, 5)
    assert.equal(entry.lastReferrer, 'https://a.test/')
  })
})

describe('notFoundReferrer', () => {
  it('trims and shortens', () => {
    assert.equal(notFoundReferrer('  '), null)
    assert.equal(notFoundReferrer(' https://a.test/ '), 'https://a.test/')
    assert.equal(notFoundReferrer('x'.repeat(600))?.length, 500)
  })
})

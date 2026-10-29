import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isSealed, openSecret, SECRET_PREFIX, sealSecret } from './secret'

const SECRET = 'a-payload-secret-for-tests'
const KEY = 'sk-test-0123456789abcdef'

describe('API key encryption', () => {
  it('round-trips a key and never stores the plain text', () => {
    const sealed = sealSecret(KEY, SECRET)
    assert.ok(sealed.startsWith(SECRET_PREFIX))
    assert.ok(isSealed(sealed))
    assert.ok(!sealed.includes(KEY))
    assert.equal(openSecret(sealed, SECRET), KEY)
  })

  it('uses a new IV every time', () => {
    const a = sealSecret(KEY, SECRET)
    const b = sealSecret(KEY, SECRET)
    assert.notEqual(a, b)
    assert.equal(openSecret(a, SECRET), KEY)
    assert.equal(openSecret(b, SECRET), KEY)
  })

  it('returns null for another secret', () => {
    assert.equal(openSecret(sealSecret(KEY, SECRET), 'another-secret'), null)
  })

  it('returns null for a changed or cut value', () => {
    const sealed = sealSecret(KEY, SECRET)
    const body = Buffer.from(sealed.slice(SECRET_PREFIX.length), 'base64url')
    for (const index of [0, 13, body.length - 1]) {
      const changed = Buffer.from(body)
      changed[index] ^= 0x01
      assert.equal(openSecret(SECRET_PREFIX + changed.toString('base64url'), SECRET), null, `byte ${index} changed`)
    }
    assert.equal(openSecret(sealed.slice(0, 20), SECRET), null)
    assert.equal(openSecret(SECRET_PREFIX, SECRET), null)
  })

  it('returns null for values that are not in the stored format, and never throws', () => {
    assert.equal(openSecret(KEY, SECRET), null)
    assert.equal(openSecret('v2:abc', SECRET), null)
    assert.equal(openSecret('v1:%%%not-base64%%%', SECRET), null)
    assert.equal(openSecret(null, SECRET), null)
    assert.equal(openSecret(42, SECRET), null)
    assert.equal(openSecret(sealSecret(KEY, SECRET), ''), null)
  })

  it('refuses to encrypt without a secret', () => {
    assert.throws(() => sealSecret(KEY, ''), /no secret/)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { APIError, type PayloadRequest } from 'payload'

import { memoryStore, WindowCounter } from './rateLimit'
import { clientIp, filledTooFast, FORM_NO_SCRIPT_CONTEXT, formSpamProtection, honeypotFilled, spamProtectionField, TURNSTILE_NEEDS_SCRIPT_MESSAGE, turnstileKeys, verifyTurnstile } from './spam'
import { FORM_SPAM_KEY, SPAM_BLOCKED_MESSAGE, SPAM_DEFAULTS, spamSettings } from './spamSettings'

describe('spamSettings', () => {
  it('gives the defaults for a form without settings', () => {
    assert.deepEqual(spamSettings(undefined), SPAM_DEFAULTS)
    assert.deepEqual(spamSettings({ honeypot: null, minFillSeconds: null, rateLimit: null }), SPAM_DEFAULTS)
  })
  it('keeps set values, also 0 and false', () => {
    assert.deepEqual(spamSettings({ honeypot: false, minFillSeconds: 0, turnstile: true, rateLimit: { max: 0, windowMinutes: 30 } }), {
      honeypot: false,
      minFillSeconds: 0,
      turnstile: true,
      rateLimit: { max: 0, windowMinutes: 30 },
    })
  })
  it('ignores negative and non-number values', () => {
    assert.equal(spamSettings({ minFillSeconds: -1 }).minFillSeconds, 3)
    assert.equal(spamSettings({ minFillSeconds: Number.NaN }).minFillSeconds, 3)
  })
})

describe('honeypotFilled and filledTooFast', () => {
  it('finds a filled honeypot', () => {
    assert.equal(honeypotFilled({ honeypot: 'http://spam.example' }), true)
    assert.equal(honeypotFilled({ honeypot: '  ' }), false)
    assert.equal(honeypotFilled(null), false)
  })
  it('compares the fill time with the minimum', () => {
    const settings = spamSettings({ minFillSeconds: 3 })
    assert.equal(filledTooFast({ elapsedMs: 2999 }, settings), true)
    assert.equal(filledTooFast({ elapsedMs: 3000 }, settings), false)
    assert.equal(filledTooFast({}, settings), true, 'a missing time is too fast')
    assert.equal(filledTooFast(null, spamSettings({ minFillSeconds: 0 })), false, '0 turns it off')
  })
})

describe('clientIp', () => {
  const headers = new Headers({ 'x-forwarded-for': '6.6.6.6, 1.1.1.1 , 2.2.2.2', 'x-real-ip': '3.3.3.3', 'cf-connecting-ip': '4.4.4.4' })

  it('trusts no header by default: a visitor can send any of them', () => {
    assert.equal(clientIp(headers, undefined), null)
  })

  it('takes the rightmost x-forwarded-for entry, which the nearest proxy adds', () => {
    assert.equal(clientIp(headers, 'x-forwarded-for'), '2.2.2.2')
    assert.equal(clientIp(new Headers({ 'x-forwarded-for': ' 1.1.1.1 , ' }), 'x-forwarded-for'), '1.1.1.1')
  })

  it('takes cf-connecting-ip or x-real-ip only when told to', () => {
    assert.equal(clientIp(headers, 'cf-connecting-ip'), '4.4.4.4')
    assert.equal(clientIp(headers, 'x-real-ip'), '3.3.3.3')
    assert.equal(clientIp(new Headers(), 'x-forwarded-for'), null)
    assert.equal(clientIp(undefined, 'x-forwarded-for'), null)
  })
})

describe('WindowCounter', () => {
  it('allows max events in the window, then refuses until the oldest leaves', async () => {
    let now = 0
    const counter = new WindowCounter(() => now)
    const store = memoryStore()
    for (let i = 0; i < 3; i++) {
      assert.equal((await counter.take(store, 'k', 3, 60_000)).ok, true)
      now += 1000
    }
    const refused = await counter.take(store, 'k', 3, 60_000)
    assert.deepEqual(refused, { ok: false, retryAfterSeconds: 57 })
    assert.equal((await counter.take(store, 'other', 3, 60_000)).ok, true, 'keys count apart')
    now = 60_001
    assert.equal((await counter.take(store, 'k', 3, 60_000)).ok, true, 'the first event left the window')
  })
  it('max 0 turns the limit off and stores nothing', async () => {
    const counter = new WindowCounter()
    const store = memoryStore()
    for (let i = 0; i < 10; i++) assert.equal((await counter.take(store, 'k', 0, 60_000)).ok, true)
    assert.equal(await store.get('k'), null)
  })
  it('counts parallel calls one after another', async () => {
    const counter = new WindowCounter()
    const store = memoryStore()
    const results = await Promise.all(Array.from({ length: 6 }, () => counter.take(store, 'k', 4, 60_000)))
    assert.equal(results.filter((r) => r.ok).length, 4)
  })
})

describe('Turnstile', () => {
  it('needs both keys', () => {
    assert.equal(turnstileKeys({ TURNSTILE_SITE_KEY: 'site' }), null)
    assert.deepEqual(turnstileKeys({ TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' }), { siteKey: 'site', secretKey: 'secret' })
  })
  it('sends the token, secret and ip and reads success', async () => {
    let sent: URLSearchParams | null = null
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      sent = init?.body as URLSearchParams
      return Response.json({ success: sent.get('response') === 'good' })
    }) as typeof fetch
    assert.equal(await verifyTurnstile({ token: 'good', secretKey: 's', ip: '1.1.1.1', fetch: fakeFetch }), true)
    assert.equal(sent!.get('secret'), 's')
    assert.equal(sent!.get('remoteip'), '1.1.1.1')
    assert.equal(await verifyTurnstile({ token: 'bad', secretKey: 's', fetch: fakeFetch }), false)
    assert.equal(await verifyTurnstile({ token: '', secretKey: 's', fetch: fakeFetch }), false, 'no token, no call')
    const broken = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    assert.equal(await verifyTurnstile({ token: 'good', secretKey: 's', fetch: broken }), false)
  })
})

describe('spamProtectionField', () => {
  it('gives the site key only when the form uses Turnstile and both keys are set', () => {
    const group = spamProtectionField({ env: { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' } }) as { fields: Array<{ name: string; hooks?: { afterRead?: Array<(a: unknown) => unknown> } }> }
    const hook = group.fields.find((f) => f.name === 'turnstileSiteKey')!.hooks!.afterRead![0]!
    assert.equal(hook({ siblingData: { turnstile: true } }), 'site')
    assert.equal(hook({ siblingData: { turnstile: false } }), null)
    const noKeys = spamProtectionField({ env: {} }) as typeof group
    assert.equal(noKeys.fields.find((f) => f.name === 'turnstileSiteKey')!.hooks!.afterRead![0]!({ siblingData: { turnstile: true } }), null)
  })
})

// ---------------------------------------------------------------------------
// The hook, end to end with a fake request
// ---------------------------------------------------------------------------

type Logged = { msg: string; reason: string; form: unknown; ip: unknown }

function fakeReq(form: Record<string, unknown> | null, options: { ip?: string; payloadAPI?: string; user?: unknown } = {}) {
  const logged: Logged[] = []
  const req = {
    payloadAPI: options.payloadAPI ?? 'REST',
    user: options.user ?? null,
    headers: new Headers(options.ip ? { 'x-forwarded-for': options.ip } : {}),
    payload: {
      config: { admin: { user: 'users' } },
      findByID: async () => {
        if (!form) throw new Error('Not found')
        return form
      },
      logger: { warn: (entry: Logged) => logged.push(entry) },
    },
  } as unknown as PayloadRequest
  return { req, logged }
}

const run = (hook: ReturnType<typeof formSpamProtection>, req: PayloadRequest, data: Record<string, unknown>, context: Record<string, unknown> = {}) =>
  hook({ collection: { slug: 'form-submissions' }, context, data, operation: 'create', req } as unknown as Parameters<typeof hook>[0])

/** Behind one reverse proxy, as the starter sets it. */
const proxied = { trustedIpHeader: 'x-forwarded-for' } as const

const ok = { honeypot: '', elapsedMs: 8000 }

describe('formSpamProtection', () => {
  it('accepts a normal submission and removes the spam values', async () => {
    const hook = formSpamProtection({ store: memoryStore() })
    const { req } = fakeReq({ id: 1 }, { ip: '1.1.1.1' })
    const result = await run(hook, req, { form: 1, submissionData: [{ field: 'name', value: 'Ada' }], [FORM_SPAM_KEY]: ok })
    assert.deepEqual(result, { form: 1, submissionData: [{ field: 'name', value: 'Ada' }] })
  })

  it('refuses a filled honeypot and a fast submission with the generic message, and logs why', async () => {
    const hook = formSpamProtection({ store: memoryStore(), ...proxied })
    const { req, logged } = fakeReq({ id: 1 }, { ip: '1.1.1.1' })
    for (const spam of [{ honeypot: 'x', elapsedMs: 8000 }, { elapsedMs: 500 }, undefined]) {
      await assert.rejects(run(hook, req, { form: 1, submissionData: [], [FORM_SPAM_KEY]: spam }), (error: unknown) => {
        assert.ok(error instanceof APIError)
        assert.equal(error.message, SPAM_BLOCKED_MESSAGE)
        assert.equal(error.status, 400)
        assert.equal(error.isPublic, true)
        return true
      })
    }
    assert.deepEqual(
      logged.map((entry) => entry.reason),
      ['honeypot', 'too-fast', 'too-fast'],
    )
    assert.equal(logged[0]!.ip, '1.1.1.1')
    assert.equal(logged[0]!.form, 1)
  })

  it('follows the form\'s own settings', async () => {
    const hook = formSpamProtection({ store: memoryStore() })
    const { req } = fakeReq({ id: 1, spamProtection: { honeypot: false, minFillSeconds: 0 } })
    const result = await run(hook, req, { form: 1, submissionData: [], [FORM_SPAM_KEY]: { honeypot: 'filled by autofill' } })
    assert.deepEqual(result, { form: 1, submissionData: [] })
  })

  it('limits submissions per IP and form', async () => {
    const hook = formSpamProtection({ store: memoryStore(), ...proxied })
    const form = { id: 1, spamProtection: { rateLimit: { max: 2, windowMinutes: 10 } } }
    const { req, logged } = fakeReq(form, { ip: '9.9.9.9' })
    await run(hook, req, { form: 1, [FORM_SPAM_KEY]: ok })
    await run(hook, req, { form: 1, [FORM_SPAM_KEY]: ok })
    await assert.rejects(run(hook, req, { form: 1, [FORM_SPAM_KEY]: ok }), (error: unknown) => error instanceof APIError && error.status === 429)
    assert.equal(logged.at(-1)!.reason, 'rate-limit')
    // Another visitor is not affected.
    const other = fakeReq(form, { ip: '8.8.8.8' })
    assert.ok(await run(hook, other.req, { form: 1, [FORM_SPAM_KEY]: ok }))
    // A visitor who writes another address before the proxy's own is still the same visitor.
    const forged = fakeReq(form, { ip: '7.7.7.7, 9.9.9.9' })
    await assert.rejects(run(hook, forged.req, { form: 1, [FORM_SPAM_KEY]: ok }), (error: unknown) => error instanceof APIError && error.status === 429)
    // Without a trusted header there is no IP, so no limit.
    const open = formSpamProtection({ store: memoryStore() })
    for (let i = 0; i < 4; i++) assert.ok(await run(open, req, { form: 1, [FORM_SPAM_KEY]: ok }))
  })

  it('stores the counts in payload.kv when there is one', async () => {
    const kv = memoryStore()
    const hook = formSpamProtection(proxied)
    const { req } = fakeReq({ id: 1 }, { ip: '1.1.1.1' })
    ;(req.payload as unknown as { kv: typeof kv }).kv = kv
    const set: string[] = []
    const original = kv.set
    kv.set = async (key, value) => {
      set.push(key)
      return original(key, value)
    }
    await run(hook, req, { form: 1, [FORM_SPAM_KEY]: ok })
    assert.equal(set.length, 1)
    assert.match(set[0]!, /^website-builder:form-rate:1:[0-9a-f]{32}$/, 'the key holds a hash, never the IP')
  })

  it('verifies Turnstile only when the form uses it and the keys are set', async () => {
    let calls = 0
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      calls++
      const body = init?.body as URLSearchParams
      return Response.json({ success: body.get('response') === 'good' })
    }) as typeof fetch
    const env = { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' }
    const hook = formSpamProtection({ store: memoryStore(), env, fetch: fakeFetch })
    const { req, logged } = fakeReq({ id: 1, spamProtection: { turnstile: true } })
    await assert.rejects(run(hook, req, { form: 1, [FORM_SPAM_KEY]: { ...ok, token: 'bad' } }))
    assert.equal(logged.at(-1)!.reason, 'turnstile')
    assert.ok(await run(hook, req, { form: 1, [FORM_SPAM_KEY]: { ...ok, token: 'good' } }))
    assert.equal(calls, 2)
    // Without the keys the setting does nothing.
    const noKeys = formSpamProtection({ store: memoryStore(), env: {}, fetch: fakeFetch })
    assert.ok(await run(noKeys, req, { form: 1, [FORM_SPAM_KEY]: ok }))
    assert.equal(calls, 2)
  })

  it('does not check server code or the admin\'s create view, but removes the spam values', async () => {
    const hook = formSpamProtection({ store: memoryStore() })
    const local = fakeReq({ id: 1 }, { payloadAPI: 'local' })
    assert.deepEqual(await run(hook, local.req, { form: 1 }), { form: 1 })
    // Server code that sends spam values (the no-JavaScript route) is checked.
    await assert.rejects(run(hook, local.req, { form: 1, [FORM_SPAM_KEY]: { honeypot: 'x' } }))
    const admin = fakeReq({ id: 1 }, { user: { id: 1, collection: 'users' } })
    assert.deepEqual(await run(hook, admin.req, { form: 1 }), { form: 1 })
    // A signed-in user who sends spam values (the site's form) is checked like anyone.
    await assert.rejects(run(hook, admin.req, { form: 1, [FORM_SPAM_KEY]: { honeypot: 'x', elapsedMs: 9000 } }))
  })

  it('passes the fill time of a no-JavaScript post, keeps the honeypot, and refuses a Turnstile form', async () => {
    const hook = formSpamProtection({ store: memoryStore(), env: { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' } })
    const noScript = { [FORM_NO_SCRIPT_CONTEXT]: true }
    const { req } = fakeReq({ id: 1 }, { payloadAPI: 'local' })
    assert.deepEqual(await run(hook, req, { form: 1, [FORM_SPAM_KEY]: { honeypot: '' } }, noScript), { form: 1 })
    await assert.rejects(run(hook, req, { form: 1, [FORM_SPAM_KEY]: { honeypot: 'bot' } }, noScript))
    // Only server code sets the flag: the same values without it are too fast.
    await assert.rejects(run(hook, req, { form: 1, [FORM_SPAM_KEY]: { honeypot: '' } }))
    const turnstile = fakeReq({ id: 1, spamProtection: { turnstile: true } }, { payloadAPI: 'local' })
    await assert.rejects(run(hook, turnstile.req, { form: 1, [FORM_SPAM_KEY]: { honeypot: '' } }, noScript), (error: Error) => error.message === TURNSTILE_NEEDS_SCRIPT_MESSAGE)
  })

  it('runs on create only', async () => {
    const hook = formSpamProtection({ store: memoryStore() })
    const { req } = fakeReq({ id: 1 })
    const data = { form: 1 }
    const result = await hook({ collection: { slug: 'x' }, context: {}, data, operation: 'update', req } as unknown as Parameters<typeof hook>[0])
    assert.equal(result, data)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GlobalAfterReadHook, GlobalBeforeChangeHook, Payload, PayloadRequest } from 'payload'

import { anthropicAdapter } from '../adapters/anthropic'
import { cloudflareWorkersAIAdapter } from '../adapters/cloudflare-workers-ai'
import { fakeAdapter } from '../adapters/fake'
import { openRouterAdapter } from '../adapters/openrouter'
import { aiClientConfig, SETTINGS_KEY_HINT } from '../config'
import { fakeImageAdapter } from '../images/fake'
import { fakeFetch, json, OPENROUTER_IMAGE_MODELS, openRouterImagesResponse } from '../images/images.test-data'
import { openAIImageAdapter } from '../images/openai'
import { openRouterImageAdapter } from '../images/openrouter'
import { createImageService, generateImageToMedia, imagesSetupProblem } from '../images/service'
import { createFakeChatFetch, DONE_FRAME, sseFrame } from '../openai-format.test-data'
import type { AiAdapter, AiModelEvent, AiModelRequest, AiOptions } from '../types'
import {
  aiKeySlots,
  aiSettingsGlobal,
  aiSettingsRuntime,
  defaultAiSettingsAccess,
  KEY_STATUS_FIELD,
  keyStatusOf,
  nextStoredKey,
  openSecret,
  sealSecret,
  withSettingsKey,
} from './index'

const SECRET = 'settings-test-secret'
const ADMIN_KEY = 'sk-or-v1-admin-0000000000004f2a'
const ENV_KEY = 'sk-or-v1-env-000000000000beef'

const OK_REPLY = { sse: [sseFrame({ content: 'ok' }), sseFrame({}, 'stop'), DONE_FRAME] }

const request = (overrides: Partial<AiModelRequest> = {}): AiModelRequest => ({ system: [{ text: 'S' }], messages: [{ role: 'user', content: 'Hi' }], tools: [], ...overrides })

async function collect(adapter: AiAdapter, req: AiModelRequest = request()): Promise<AiModelEvent[]> {
  const events: AiModelEvent[] = []
  for await (const event of adapter.stream(req)) events.push(event)
  return events
}

/** A Payload stand-in: the database adapter's raw row of the settings global, the secret, a logger. */
function fakePayload(row: Record<string, unknown> = {}, secret = SECRET) {
  const warnings: string[] = []
  const payload = {
    secret,
    db: { findGlobal: async () => structuredClone(row) },
    logger: { warn: (...args: unknown[]) => warnings.push(args.map(String).join(' ')), info: () => {}, error: () => {} },
    config: { admin: { user: 'users' }, routes: { admin: '/admin' } },
  } as unknown as Payload
  return { payload, row, warnings }
}

const reqOf = (payload: Payload, user: unknown = { id: 1, collection: 'users' }) => ({ payload, user }) as unknown as PayloadRequest

describe('aiKeySlots', () => {
  it('shares one field when chat and images read the same env var', () => {
    const slots = aiKeySlots({ adapter: openRouterAdapter({}), images: openRouterImageAdapter({}) })
    assert.deepEqual(
      slots.map((s) => [s.name, s.uses, s.keyEnv]),
      [['chatApiKey', ['chat', 'images'], 'OPENROUTER_API_KEY']],
    )
  })

  it('has one field per provider otherwise, and none for adapters without keys', () => {
    const slots = aiKeySlots({ adapter: cloudflareWorkersAIAdapter({ accountId: 'acc' }), images: openAIImageAdapter({ apiKey: 'sk' }) })
    assert.deepEqual(
      slots.map((s) => [s.name, s.uses, s.missingKey]),
      [
        ['chatApiKey', ['chat'], true],
        ['imageApiKey', ['images'], false],
      ],
    )
    assert.deepEqual(aiKeySlots({ adapter: fakeAdapter(), images: fakeImageAdapter() }), [])
  })
})

describe('stored keys', () => {
  it('encrypts a new key, keeps the old one when the value is left out, and clears on null', () => {
    const stored = nextStoredKey(` ${ADMIN_KEY} `, null, SECRET)
    assert.ok(stored && stored !== ADMIN_KEY)
    assert.equal(openSecret(stored, SECRET), ADMIN_KEY)
    assert.equal(nextStoredKey(undefined, stored, SECRET), stored)
    assert.equal(nextStoredKey('', stored, SECRET), stored)
    assert.equal(nextStoredKey('   ', stored, SECRET), stored)
    assert.equal(nextStoredKey(null, stored, SECRET), null)
    // A copy of an already encrypted value is not encrypted twice.
    assert.equal(nextStoredKey(stored, null, SECRET), stored)
    assert.throws(() => nextStoredKey('sk with space', null, SECRET), /no spaces/)
    assert.throws(() => nextStoredKey('sk\nline', null, SECRET), /no spaces/)
  })

  it('reports set (with the last 4 characters), unset and unreadable', () => {
    assert.deepEqual(keyStatusOf(sealSecret(ADMIN_KEY, SECRET), SECRET), { state: 'set', last4: '4f2a' })
    assert.deepEqual(keyStatusOf(sealSecret('short', SECRET), SECRET), { state: 'set', last4: null })
    assert.deepEqual(keyStatusOf(null, SECRET), { state: 'unset' })
    assert.deepEqual(keyStatusOf(sealSecret(ADMIN_KEY, 'old-secret'), SECRET), { state: 'unreadable' })
  })
})

describe('AI settings global', () => {
  const ai: AiOptions = { adapter: openRouterAdapter({}), images: openRouterImageAdapter({}) }
  const global = aiSettingsGlobal(ai)
  const afterRead = global.hooks!.afterRead![0] as GlobalAfterReadHook
  const beforeChange = global.hooks!.beforeChange![0] as GlobalBeforeChangeHook
  const { payload } = fakePayload()
  const req = reqOf(payload)

  it('has both key fields (stable DB schema), hides the unused one, and no GraphQL', () => {
    const fields = global.fields as Array<{ name: string; admin?: { hidden?: boolean }; virtual?: boolean }>
    assert.deepEqual(fields.map((f) => [f.name, Boolean(f.admin?.hidden)]), [
      ['chatApiKey', false],
      ['imageApiKey', true],
      [KEY_STATUS_FIELD, true],
    ])
    assert.equal(fields[2].virtual, true)
    assert.equal(global.graphQL, false)
    assert.equal(global.slug, 'builder-ai-settings')
  })

  it('never returns the keys from a read, only their status', async () => {
    const sealed = sealSecret(ADMIN_KEY, SECRET)
    const doc = (await afterRead({ doc: { chatApiKey: sealed, imageApiKey: null, other: 1 }, req, global } as never)) as Record<string, unknown>
    assert.equal('chatApiKey' in doc, false)
    assert.equal('imageApiKey' in doc, false)
    assert.equal(doc.other, 1)
    assert.deepEqual(doc[KEY_STATUS_FIELD], { chatApiKey: { state: 'set', last4: '4f2a' }, imageApiKey: { state: 'unset' } })
    assert.ok(!JSON.stringify(doc).includes(ADMIN_KEY))
    assert.ok(!JSON.stringify(doc).includes(sealed))
  })

  it('encrypts on write and keeps the stored key on a save without it', async () => {
    const written = (await beforeChange({ data: { chatApiKey: ADMIN_KEY, [KEY_STATUS_FIELD]: {} }, originalDoc: {}, req, global } as never)) as Record<string, unknown>
    assert.equal(openSecret(written.chatApiKey, SECRET), ADMIN_KEY)
    assert.equal(written.imageApiKey, null)
    assert.equal(KEY_STATUS_FIELD in written, false)
    const kept = (await beforeChange({ data: { [KEY_STATUS_FIELD]: {} }, originalDoc: written, req, global } as never)) as Record<string, unknown>
    assert.equal(kept.chatApiKey, written.chatApiKey)
    const cleared = (await beforeChange({ data: { chatApiKey: null }, originalDoc: written, req, global } as never)) as Record<string, unknown>
    assert.equal(cleared.chatApiKey, null)
    await assert.rejects(
      async () => beforeChange({ data: { chatApiKey: 'two words' }, originalDoc: {}, req, global } as never),
      (error: { data?: { errors?: Array<{ path: string; message: string }> } }) => {
        assert.equal(error.data?.errors?.[0]?.path, 'chatApiKey')
        assert.match(String(error.data?.errors?.[0]?.message), /no spaces/)
        return true
      },
    )
  })

  it('lets signed-in users of the admin collection in by default', () => {
    assert.equal(defaultAiSettingsAccess({ req: reqOf(payload) }), true)
    assert.equal(defaultAiSettingsAccess({ req: reqOf(payload, null) }), false)
    assert.equal(defaultAiSettingsAccess({ req: reqOf(payload, { id: 2, collection: 'customers' }) }), false)
  })
})

describe('keys at request time', () => {
  it('the admin key wins over the env key, and the adapter sees a new key without being rebuilt', async () => {
    const { fetch, calls } = createFakeChatFetch(() => OK_REPLY)
    // Built once, like the plugin does at config time.
    const adapter = openRouterAdapter({ apiKey: ENV_KEY, fetch })
    const ai: AiOptions = { adapter }
    const { payload, row } = fakePayload()
    const runtime = aiSettingsRuntime(ai, {}, '/api/builder/ai')
    const send = async () => collect(withSettingsKey(adapter, await runtime.keyFor(payload, 'chat'), SETTINGS_KEY_HINT))

    await send()
    assert.equal(calls.at(-1)?.headers.Authorization, `Bearer ${ENV_KEY}`, 'no admin key: the env key')

    row.chatApiKey = sealSecret(ADMIN_KEY, SECRET)
    await send()
    assert.equal(calls.at(-1)?.headers.Authorization, `Bearer ${ADMIN_KEY}`, 'the admin key wins')

    const replaced = 'sk-or-v1-replaced-00000000000077'
    row.chatApiKey = sealSecret(replaced, SECRET)
    await send()
    assert.equal(calls.at(-1)?.headers.Authorization, `Bearer ${replaced}`, 'the next request uses the new key')

    row.chatApiKey = null
    await send()
    assert.equal(calls.at(-1)?.headers.Authorization, `Bearer ${ENV_KEY}`, 'cleared: back to the env key')
    assert.equal(calls.length, 4)
  })

  it('makes an adapter without an env key work, and adds the settings hint while there is none', async () => {
    const { fetch, calls } = createFakeChatFetch(() => OK_REPLY)
    const adapter = openRouterAdapter({ fetch })
    assert.equal(adapter.ready, false)
    assert.equal(adapter.missingKey, true)
    const missing = await collect(withSettingsKey(adapter, undefined, SETTINGS_KEY_HINT))
    assert.equal(missing.length, 1)
    assert.equal(missing[0].type === 'error' && missing[0].code, 'auth')
    assert.ok(missing[0].type === 'error' && missing[0].message.endsWith(SETTINGS_KEY_HINT))
    assert.equal(calls.length, 0)

    const events = await collect(withSettingsKey(adapter, ADMIN_KEY, SETTINGS_KEY_HINT))
    assert.equal(events.at(-1)?.type, 'done')
    assert.equal(calls[0].headers.Authorization, `Bearer ${ADMIN_KEY}`)
  })

  it('treats a key that does not decrypt as not set, and logs a warning', async () => {
    const { payload, warnings } = fakePayload({ chatApiKey: sealSecret(ADMIN_KEY, 'the-old-secret') })
    const runtime = aiSettingsRuntime({ adapter: openRouterAdapter({}) }, {}, '/api/builder/ai')
    assert.equal(await runtime.keyFor(payload, 'chat'), undefined)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /cannot be decrypted/)
    assert.ok(!warnings[0].includes(ADMIN_KEY))
  })

  it('treats a failed database read as not set', async () => {
    const { payload, warnings } = fakePayload()
    ;(payload.db as unknown as { findGlobal: () => Promise<never> }).findGlobal = async () => {
      throw new Error('relation does not exist')
    }
    const runtime = aiSettingsRuntime({ adapter: openRouterAdapter({}) }, {}, '/api/builder/ai')
    assert.equal(await runtime.keyFor(payload, 'chat'), undefined)
    assert.equal(warnings.length, 1)
  })

  it('gives the editor the readiness of now and the settings page', async () => {
    const ai: AiOptions = { adapter: openRouterAdapter({}), images: openRouterImageAdapter({}) }
    const { payload, row } = fakePayload()
    const runtime = aiSettingsRuntime(ai, {}, '/api/builder/ai')
    const before = await runtime.clientConfig(reqOf(payload))
    assert.equal(before.ready, false)
    assert.equal(before.images, null)
    assert.equal(before.settingsUrl, '/admin/globals/builder-ai-settings')
    assert.ok(before.setupProblem?.endsWith(SETTINGS_KEY_HINT))

    row.chatApiKey = sealSecret(ADMIN_KEY, SECRET)
    const after = await runtime.clientConfig(reqOf(payload))
    assert.equal(after.ready, true)
    assert.equal(after.setupProblem, null)
    assert.equal(after.images?.label, 'OpenRouter', 'the shared key also turns image generation on')
    assert.ok(!JSON.stringify(after).includes(ADMIN_KEY), 'the key never goes to the browser')

    const denied = aiSettingsRuntime(ai, { access: () => false }, '/api/builder/ai')
    assert.equal((await denied.clientConfig(reqOf(payload))).settingsUrl, null)
  })

  it('aiClientConfig without request state follows the adapter options', () => {
    const config = aiClientConfig({ adapter: openRouterAdapter({}) }, '/api/builder/ai')
    assert.equal(config.ready, false)
    assert.equal(config.settingsUrl, null)
    assert.equal(aiClientConfig({ adapter: openRouterAdapter({}) }, '/x', { keys: { chat: true } }).ready, true)
    // A key in the settings cannot fix a missing account id.
    assert.equal(aiClientConfig({ adapter: cloudflareWorkersAIAdapter({}) }, '/x', { keys: { chat: true } }).ready, false)
  })

  it('Anthropic takes the key per request', () => {
    const adapter = anthropicAdapter({ apiKey: 'sk-ant-env' })
    assert.equal(adapter.acceptsApiKey, true)
    assert.equal(adapter.missingKey, false)
  })
})

describe('image keys at request time', () => {
  it('the image adapter uses the key from the request over its own', async () => {
    const { fetch, calls } = fakeFetch((url) => (url.endsWith('/images/models') ? json(OPENROUTER_IMAGE_MODELS) : json(openRouterImagesResponse())))
    const adapter = openRouterImageAdapter({ apiKey: ENV_KEY, fetch })
    await adapter.generate({ prompt: 'A cup', aspectRatio: '1:1', n: 1, apiKey: ADMIN_KEY })
    await adapter.generate({ prompt: 'A cup', aspectRatio: '1:1', n: 1 })
    const auth = calls.filter((c) => c.url.endsWith('/images')).map((c) => new Headers(c.init.headers).get('authorization'))
    assert.deepEqual(auth, [`Bearer ${ADMIN_KEY}`, `Bearer ${ENV_KEY}`])
  })

  it('the image service reads the key itself (the MCP tool and the editor share it)', async () => {
    const seen: Array<string | undefined> = []
    const images = { ...fakeImageAdapter({ onRequest: (r) => seen.push(r.apiKey) }), ready: false, missingKey: true, acceptsApiKey: true, setupProblem: 'Set MY_KEY.' }
    let key: string | undefined
    const service = createImageService({ images }, { resolveKey: async () => key })
    assert.match(String(imagesSetupProblem(service)), /Set MY_KEY\. Or paste an API key in the admin: AI settings\. See docs\/ai\/images\.md/)
    assert.equal(imagesSetupProblem(service, 'sk'), null)

    const payload = {
      collections: { media: { config: { slug: 'media', upload: {}, fields: [{ name: 'alt', type: 'text' }] } } },
      config: { custom: {} },
      logger: { info: () => {}, error: () => {}, warn: () => {} },
      create: async (args: { file: { name: string } }) => ({ id: 1, filename: args.file.name }),
    }
    const req = { user: { id: 1, collection: 'users' }, payload } as unknown as PayloadRequest
    const missing = await generateImageToMedia(req, service, { prompt: 'Coffee beans', source: 'mcp' })
    assert.equal(!missing.ok && missing.code, 'not_configured')
    key = ADMIN_KEY
    const made = await generateImageToMedia(req, service, { prompt: 'Coffee beans', source: 'mcp' })
    assert.equal(made.ok, true)
    assert.deepEqual(seen, [ADMIN_KEY])
  })
})

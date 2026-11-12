// The AI settings global in a real Payload: REST and Local API reads never return the keys, a
// save without the key keeps it, access is admins only, and the chat endpoint uses a new key on
// the next request without a restart.

import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { buildConfig, getPayload, handleEndpoints, type CollectionConfig, type Payload } from 'payload'

import { memoryAdapter } from '../../plugin/memoryAdapter.test-data'
import { websiteBuilder } from '../../plugin/index'
import { openRouterAdapter } from '../adapters/openrouter'
import { createFakeChatFetch, DONE_FRAME, sseFrame } from '../openai-format.test-data'
import { KEY_STATUS_FIELD, openSecret } from './index'

const SLUG = 'builder-ai-settings'
const ADMIN_KEY = 'sk-or-v1-admin-0000000000004f2a'
const NEXT_KEY = 'sk-or-v1-next-00000000000000c0de'

const users: CollectionConfig = { slug: 'users', auth: true, fields: [],
  versions: false,
  authorship: false,
}
const customers: CollectionConfig = { slug: 'customers', auth: true, fields: [],
  versions: false,
  authorship: false,
}
const pages: CollectionConfig = {
  slug: 'pages',
  access: { read: () => true, create: () => true, update: ({ req }) => req.user?.collection === 'users', delete: () => true },
  fields: [{ name: 'title', type: 'text' }],
  versions: false,
  authorship: false,
}

const chatFetch = createFakeChatFetch(() => ({ sse: [sseFrame({ content: 'ok' }), sseFrame({}, 'stop'), DONE_FRAME] }))
const memory = memoryAdapter()
let payload: Payload
let adminToken: string
let customerToken: string
let pageId: number

async function rest(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
  return handleEndpoints({
    config: payload.config,
    request: new Request(`http://localhost/api${path}`, {
      method,
      headers: { ...(token ? { Authorization: `JWT ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  })
}

/** The raw stored row (the database adapter, no hooks). */
const rawRow = async () => (await payload.db.findGlobal({ slug: SLUG })) as Record<string, unknown>

before(async () => {
  const config = await buildConfig({
    secret: 'ai-settings-payload-test-secret',
    telemetry: false,
    typescript: { autoGenerate: false },
    admin: { user: 'users' },
    db: memory.adapter,
    collections: [users, customers, pages],
    plugins: [
      websiteBuilder({
        collections: { pages: {} },
        blocks: [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }],
        css: { entry: 'globals.css' },
        theme: false,
        savedSections: false,
        ai: { adapter: openRouterAdapter({ fetch: chatFetch.fetch, maxRetries: 0 }) },
      }),
    ],
  })
  payload = await getPayload({ config })
  await payload.create({ collection: 'users', data: { email: 'admin@example.test', password: 'pass-1234' } as never, overrideAccess: true })
  await payload.create({ collection: 'customers', data: { email: 'shopper@example.test', password: 'pass-1234' } as never, overrideAccess: true })
  adminToken = (await payload.login({ collection: 'users', data: { email: 'admin@example.test', password: 'pass-1234' }, overrideAccess: true })).token as string
  customerToken = (await payload.login({ collection: 'customers', data: { email: 'shopper@example.test', password: 'pass-1234' }, overrideAccess: true })).token as string
  pageId = (await payload.create({ collection: 'pages', data: { title: 'Home' } as never, overrideAccess: true })).id as number
})

async function chat(): Promise<{ status: number; text: string }> {
  const response = await rest('POST', '/builder/ai/chat', adminToken, {
    collection: 'pages',
    id: pageId,
    messages: [{ role: 'user', content: 'Hi' }],
    layout: { version: 1, blocks: [] },
  })
  return { status: response.status, text: await response.text() }
}

describe('AI settings global (Payload)', { timeout: 20_000 }, () => {
  it('has no GraphQL schema', () => {
    assert.equal(payload.config.globals.find((g) => g.slug === SLUG)?.graphQL, false)
  })

  it('the assistant says to paste a key while none is set, and makes no API call', async () => {
    const { status, text } = await chat()
    assert.equal(status, 200)
    assert.match(text, /No OpenRouter API key/)
    assert.match(text, /AI settings/)
    assert.equal(chatFetch.calls.length, 0)
  })

  it('stores the key encrypted and never returns it (REST and Local API)', async () => {
    const saved = await rest('POST', `/globals/${SLUG}`, adminToken, { chatApiKey: ADMIN_KEY })
    assert.equal(saved.status, 200, await saved.clone().text())
    const savedText = await saved.text()
    assert.ok(!savedText.includes(ADMIN_KEY), 'not in the update response')
    const raw = await rawRow()
    assert.ok(typeof raw.chatApiKey === 'string' && raw.chatApiKey.startsWith('v1:'))
    assert.ok(!JSON.stringify(raw).includes(ADMIN_KEY), 'the database has only the encrypted value')
    assert.equal(openSecret(raw.chatApiKey, payload.secret), ADMIN_KEY)
    assert.ok(!savedText.includes(raw.chatApiKey as string), 'not even the encrypted value')

    const read = await rest('GET', `/globals/${SLUG}`, adminToken)
    const doc = (await read.json()) as Record<string, unknown>
    assert.equal('chatApiKey' in doc, false)
    assert.deepEqual((doc[KEY_STATUS_FIELD] as Record<string, unknown>).chatApiKey, { state: 'set', last4: '4f2a' })

    const local = (await payload.findGlobal({ slug: SLUG as never, overrideAccess: true })) as Record<string, unknown>
    assert.equal('chatApiKey' in local, false)
    assert.ok(!JSON.stringify(local).includes(ADMIN_KEY))
  })

  it('keeps the key when a save leaves it out (the admin form sends the doc it read)', async () => {
    const stored = (await rawRow()).chatApiKey
    const read = (await (await rest('GET', `/globals/${SLUG}`, adminToken)).json()) as Record<string, unknown>
    const saved = await rest('POST', `/globals/${SLUG}`, adminToken, read)
    assert.equal(saved.status, 200, await saved.clone().text())
    assert.equal((await rawRow()).chatApiKey, stored)
  })

  it('the chat endpoint uses the admin key, and a new key on the next request', async () => {
    assert.equal((await chat()).status, 200)
    assert.equal(chatFetch.calls.at(-1)?.headers.Authorization, `Bearer ${ADMIN_KEY}`)
    await payload.updateGlobal({ slug: SLUG as never, data: { chatApiKey: NEXT_KEY } as never, overrideAccess: true })
    assert.equal((await chat()).status, 200)
    assert.equal(chatFetch.calls.at(-1)?.headers.Authorization, `Bearer ${NEXT_KEY}`)
  })

  it('lets only admin users read or change the settings', async () => {
    assert.equal((await rest('GET', `/globals/${SLUG}`)).status, 403)
    assert.equal((await rest('GET', `/globals/${SLUG}`, customerToken)).status, 403)
    assert.equal((await rest('POST', `/globals/${SLUG}`, customerToken, { chatApiKey: 'sk-shopper-0000000000' })).status, 403)
    assert.equal(openSecret((await rawRow()).chatApiKey, payload.secret), NEXT_KEY)
  })

  it('clears the key with null', async () => {
    const saved = await rest('POST', `/globals/${SLUG}`, adminToken, { chatApiKey: null })
    assert.equal(saved.status, 200)
    assert.equal((await rawRow()).chatApiKey, null)
    const doc = (await saved.json()) as { result?: Record<string, unknown> } & Record<string, unknown>
    const result = (doc.result ?? doc) as Record<string, unknown>
    assert.deepEqual((result[KEY_STATUS_FIELD] as Record<string, unknown>).chatApiKey, { state: 'unset' })
  })
})

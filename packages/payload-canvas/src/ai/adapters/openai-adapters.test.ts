import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { AiAdapter, AiEffort, AiModelEvent, AiModelRequest } from '../types'
import { createFakeChatFetch, DONE_FRAME, sseFrame, type FakeChatCall } from '../openai-format.test-data'
import { CLOUDFLARE_GATEWAY_URL, cloudflareGatewayAdapter } from './cloudflare-gateway'
import { CLOUDFLARE_API_URL, cloudflareWorkersAIAdapter, WORKERS_AI_DEFAULT_MODEL } from './cloudflare-workers-ai'
import { openAICompatibleAdapter } from './openai-compatible'
import { OPENROUTER_APP_TITLE, OPENROUTER_BASE_URL, OPENROUTER_DEFAULT_MODEL, openRouterAdapter } from './openrouter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OK_REPLY = { sse: [sseFrame({ content: 'ok' }), sseFrame({}, 'stop'), DONE_FRAME] }

/** A fetch that answers every request with a short reply and records the calls. */
function fake() {
  return createFakeChatFetch(() => OK_REPLY)
}

const request = (overrides: Partial<AiModelRequest> = {}): AiModelRequest => ({
  system: [{ text: 'STABLE', cache: true }, { text: 'VARIABLE' }],
  messages: [{ role: 'user', content: 'Hi' }],
  tools: [],
  ...overrides,
})

async function collect(adapter: AiAdapter, req: AiModelRequest = request()): Promise<AiModelEvent[]> {
  const events: AiModelEvent[] = []
  for await (const event of adapter.stream(req)) events.push(event)
  return events
}

/** Streams one request and returns the one call the adapter made. */
async function sent(make: (fetch: typeof globalThis.fetch) => AiAdapter, req: AiModelRequest = request()): Promise<{ call: FakeChatCall; events: AiModelEvent[]; adapter: AiAdapter }> {
  const { fetch, calls } = fake()
  const adapter = make(fetch)
  const events = await collect(adapter, req)
  assert.equal(calls.length, 1)
  assert.equal(events.at(-1)?.type, 'done', 'the request ends with done')
  return { call: calls[0], events, adapter }
}

/** A not-ready adapter streams one auth error and never calls fetch. */
async function assertNotReady(make: (fetch: typeof globalThis.fetch) => AiAdapter, problem: RegExp) {
  const { fetch, calls } = fake()
  const adapter = make(fetch)
  assert.equal(adapter.ready, false)
  assert.match(String(adapter.setupProblem), problem)
  const events = await collect(adapter)
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'error')
  assert.equal(events[0].type === 'error' && events[0].code, 'auth')
  assert.equal(events[0].type === 'error' && events[0].message, adapter.setupProblem)
  assert.equal(calls.length, 0)
}

// ---------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------

const makeOpenRouter = (options: Parameters<typeof openRouterAdapter>[0] = {}) => (fetch: typeof globalThis.fetch) => openRouterAdapter({ apiKey: 'sk-or-1', fetch, ...options })

describe('openRouterAdapter', () => {
  const make = makeOpenRouter

  it('sends to OpenRouter with the key and the attribution headers', async () => {
    const { call, adapter } = await sent(make({ siteUrl: 'https://example.com' }))
    assert.equal(call.url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(call.url, `${OPENROUTER_BASE_URL}/chat/completions`)
    assert.equal(call.headers.Authorization, 'Bearer sk-or-1')
    assert.equal(call.headers['HTTP-Referer'], 'https://example.com')
    assert.equal(call.headers['X-Title'], 'Payload Website Builder')
    assert.equal(call.headers['X-OpenRouter-Title'], 'Payload Website Builder')
    assert.equal(call.headers['Content-Type'], 'application/json')
    assert.equal(call.headers.Accept, 'text/event-stream')
    assert.equal(adapter.name, 'openrouter')
    assert.equal(adapter.label, 'OpenRouter')
    assert.equal(adapter.ready, true)
    assert.equal(adapter.setupProblem, null)
    assert.equal(adapter.keyEnv, 'OPENROUTER_API_KEY')
    assert.equal(adapter.keyUrl, 'https://openrouter.ai/keys')
  })

  it('sends no HTTP-Referer without siteUrl, and the app title can change', async () => {
    const plain = await sent(make())
    assert.equal('HTTP-Referer' in plain.call.headers, false)
    assert.equal(plain.call.headers['X-Title'], OPENROUTER_APP_TITLE)
    const named = await sent(make({ appTitle: 'My Site Builder', siteUrl: '   ' }))
    assert.equal(named.call.headers['X-Title'], 'My Site Builder')
    assert.equal(named.call.headers['X-OpenRouter-Title'], 'My Site Builder')
    assert.equal('HTTP-Referer' in named.call.headers, false)
  })

  it('trims the key, and lets a custom baseURL and extra headers through', async () => {
    const { call } = await sent(make({ apiKey: '  sk-or-2  ', baseURL: 'https://proxy.example.test/api/v1/', headers: { 'X-Extra': 'yes' } }))
    assert.equal(call.url, 'https://proxy.example.test/api/v1/chat/completions')
    assert.equal(call.headers.Authorization, 'Bearer sk-or-2')
    assert.equal(call.headers['X-Extra'], 'yes')
  })

  it('uses the default model, or the one given (trimmed)', async () => {
    const byDefault = await sent(make())
    assert.equal(OPENROUTER_DEFAULT_MODEL, 'openai/gpt-6-luna')
    assert.equal(byDefault.adapter.model, OPENROUTER_DEFAULT_MODEL)
    assert.equal(byDefault.call.body.model, OPENROUTER_DEFAULT_MODEL)
    const custom = await sent(make({ model: ' deepseek/deepseek-v4 ' }))
    assert.equal(custom.adapter.model, 'deepseek/deepseek-v4')
    assert.equal(custom.call.body.model, 'deepseek/deepseek-v4')
    const blank = await sent(make({ model: '  ' }))
    assert.equal(blank.adapter.model, OPENROUTER_DEFAULT_MODEL)
  })

  it('sends reasoning.effort only when the request has an effort, and maps max to xhigh', async () => {
    const none = await sent(make())
    assert.equal('reasoning' in none.call.body, false)
    const expected: Array<[AiEffort, string]> = [
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['xhigh', 'xhigh'],
      ['max', 'xhigh'],
    ]
    for (const [effort, sentEffort] of expected) {
      const { call } = await sent(make(), request({ effort }))
      assert.deepEqual(call.body.reasoning, { effort: sentEffort }, effort)
    }
  })

  it('sends cache_control on the cached system parts for anthropic/ and google/ models only', async () => {
    const cached = {
      role: 'system',
      content: [
        { type: 'text', text: 'STABLE', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'VARIABLE' },
      ],
    }
    for (const model of ['anthropic/claude-sonnet-4.5', 'google/gemini-3.8-flash']) {
      const { call } = await sent(make({ model }))
      assert.deepEqual(call.body.messages[0], cached, model)
    }
    for (const model of ['openai/gpt-6-luna', 'deepseek/deepseek-v4', 'x-ai/grok-5', 'meta-llama/anthropic/x', 'my-anthropic/model']) {
      const { call } = await sent(make({ model }))
      assert.deepEqual(call.body.messages[0], { role: 'system', content: 'STABLE\n\nVARIABLE' }, model)
    }
  })

  it('has max_tokens only when maxTokens is set', async () => {
    assert.equal('max_tokens' in (await sent(make())).call.body, false)
    assert.equal((await sent(make({ maxTokens: 4096 }))).call.body.max_tokens, 4096)
  })

  it('is not ready without a key, and says which env var to set', async () => {
    for (const apiKey of [undefined, null, '', '   ']) {
      await assertNotReady(make({ apiKey }), /OPENROUTER_API_KEY/)
    }
    const adapter = openRouterAdapter()
    assert.equal(adapter.ready, false)
    assert.equal(adapter.keyEnv, 'OPENROUTER_API_KEY')
    assert.equal(adapter.keyUrl, 'https://openrouter.ai/keys')
    assert.match(String(adapter.setupProblem), /^No OpenRouter API key\./)
    assert.match(String(adapter.setupProblem), /https:\/\/openrouter\.ai\/keys/)
    assert.equal(adapter.model, OPENROUTER_DEFAULT_MODEL)
  })

  it('explains a rejected key with the OpenRouter hint', async () => {
    const { fetch } = createFakeChatFetch([{ status: 401, body: { error: { message: 'User not found.', code: 401 } } }])
    const events = await collect(openRouterAdapter({ apiKey: 'bad', fetch }))
    assert.deepEqual(events, [
      {
        type: 'error',
        code: 'auth',
        message:
          'OpenRouter rejected the API key (401): User not found. Set OPENROUTER_API_KEY in the server environment (.env) and restart the server. Create a key at https://openrouter.ai/keys.',
      },
    ])
  })
})

// ---------------------------------------------------------------------------
// Cloudflare AI Gateway
// ---------------------------------------------------------------------------

describe('cloudflareGatewayAdapter', () => {
  const base = { accountId: 'acc123', gatewayId: 'my-gateway', model: 'openai/gpt-5.2', gatewayToken: 'cfg-token' }
  const make = (options: Parameters<typeof cloudflareGatewayAdapter>[0] = {}) => (fetch: typeof globalThis.fetch) => cloudflareGatewayAdapter({ ...base, fetch, ...options })

  it('sends to the gateway compat endpoint with the gateway token', async () => {
    const { call, adapter } = await sent(make())
    assert.equal(call.url, 'https://gateway.ai.cloudflare.com/v1/acc123/my-gateway/compat/chat/completions')
    assert.equal(call.url, `${CLOUDFLARE_GATEWAY_URL}/acc123/my-gateway/compat/chat/completions`)
    assert.equal(call.headers['cf-aig-authorization'], 'Bearer cfg-token')
    // Only the gateway token: no provider Authorization header.
    assert.equal('Authorization' in call.headers, false)
    assert.equal(call.body.model, 'openai/gpt-5.2')
    assert.equal(adapter.name, 'cloudflare-gateway')
    assert.equal(adapter.label, 'Cloudflare AI Gateway')
    assert.equal(adapter.model, 'openai/gpt-5.2')
    assert.equal(adapter.ready, true)
    assert.equal(adapter.setupProblem, null)
    assert.equal(adapter.keyEnv, 'CF_AIG_TOKEN')
    assert.match(String(adapter.keyUrl), /dash\.cloudflare\.com/)
  })

  it('sends a provider key as Authorization, alone or with the gateway token', async () => {
    const keyOnly = await sent(make({ gatewayToken: null, apiKey: 'sk-openai' }))
    assert.equal(keyOnly.call.headers.Authorization, 'Bearer sk-openai')
    assert.equal('cf-aig-authorization' in keyOnly.call.headers, false)
    assert.equal(keyOnly.adapter.ready, true)

    const both = await sent(make({ apiKey: 'sk-openai' }))
    assert.equal(both.call.headers.Authorization, 'Bearer sk-openai')
    assert.equal(both.call.headers['cf-aig-authorization'], 'Bearer cfg-token')
  })

  it('escapes the ids in the URL, trims them, and lets `url` replace the endpoint', async () => {
    const odd = await sent(make({ accountId: ' a/b ', gatewayId: 'g w' }))
    assert.equal(odd.call.url, 'https://gateway.ai.cloudflare.com/v1/a%2Fb/g%20w/compat/chat/completions')
    const custom = await sent(make({ url: 'https://gateway.example.test/custom/chat/completions' }))
    assert.equal(custom.call.url, 'https://gateway.example.test/custom/chat/completions')
  })

  it('takes a Workers AI model with a slash path', async () => {
    const { call } = await sent(make({ model: 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast' }))
    assert.equal(call.body.model, 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast')
  })

  it('sends no cache_control and no reasoning field', async () => {
    const { call } = await sent(make({ model: 'anthropic/claude-4-5-sonnet' }), request({ effort: 'high' }))
    assert.deepEqual(call.body.messages[0], { role: 'system', content: 'STABLE\n\nVARIABLE' })
    assert.equal('reasoning' in call.body, false)
    assert.equal('reasoning_effort' in call.body, false)
  })

  it('is not ready without the account id, gateway id, model or credentials', async () => {
    await assertNotReady(make({ accountId: undefined }), /account id and gateway id.*CLOUDFLARE_ACCOUNT_ID.*CLOUDFLARE_AI_GATEWAY_ID/)
    await assertNotReady(make({ accountId: '  ' }), /account id and gateway id/)
    await assertNotReady(make({ gatewayId: null }), /account id and gateway id/)
    await assertNotReady(make({ model: undefined }), /Set the model for Cloudflare AI Gateway/)
    await assertNotReady(make({ model: '   ' }), /Set the model/)
    await assertNotReady(make({ gatewayToken: undefined }), /No Cloudflare AI Gateway credentials.*CF_AIG_TOKEN/)
    await assertNotReady(make({ gatewayToken: '', apiKey: '  ' }), /No Cloudflare AI Gateway credentials/)
  })

  it('reports the first problem when several things are missing, and still has the setup card fields', () => {
    const adapter = cloudflareGatewayAdapter()
    assert.equal(adapter.ready, false)
    assert.match(String(adapter.setupProblem), /account id and gateway id/)
    assert.equal(adapter.keyEnv, 'CF_AIG_TOKEN')
    assert.ok(adapter.keyUrl)
    assert.equal(adapter.model, '')
  })
})

// ---------------------------------------------------------------------------
// Cloudflare Workers AI
// ---------------------------------------------------------------------------

describe('cloudflareWorkersAIAdapter', () => {
  const base = { accountId: 'acc123', apiToken: 'cf-token' }
  const make = (options: Parameters<typeof cloudflareWorkersAIAdapter>[0] = {}) => (fetch: typeof globalThis.fetch) => cloudflareWorkersAIAdapter({ ...base, fetch, ...options })

  it('sends to the Workers AI OpenAI endpoint with a Bearer token', async () => {
    const { call, adapter } = await sent(make())
    assert.equal(call.url, 'https://api.cloudflare.com/client/v4/accounts/acc123/ai/v1/chat/completions')
    assert.equal(call.url, `${CLOUDFLARE_API_URL}/accounts/acc123/ai/v1/chat/completions`)
    assert.equal(call.headers.Authorization, 'Bearer cf-token')
    assert.equal('cf-aig-gateway-id' in call.headers, false)
    assert.equal(adapter.name, 'cloudflare-workers-ai')
    assert.equal(adapter.label, 'Cloudflare Workers AI')
    assert.equal(adapter.ready, true)
    assert.equal(adapter.setupProblem, null)
    assert.equal(adapter.keyEnv, 'CLOUDFLARE_API_TOKEN')
    assert.match(String(adapter.keyUrl), /dash\.cloudflare\.com/)
  })

  it('sends cf-aig-gateway-id when gatewayId is set', async () => {
    const { call } = await sent(make({ gatewayId: 'my-gateway' }))
    assert.equal(call.headers['cf-aig-gateway-id'], 'my-gateway')
    assert.equal(call.headers.Authorization, 'Bearer cf-token')
    const blank = await sent(make({ gatewayId: '  ' }))
    assert.equal('cf-aig-gateway-id' in blank.call.headers, false)
  })

  it('uses the default model, or the one given', async () => {
    const byDefault = await sent(make())
    assert.equal(WORKERS_AI_DEFAULT_MODEL, '@cf/zai-org/glm-4.7-flash')
    assert.equal(byDefault.adapter.model, WORKERS_AI_DEFAULT_MODEL)
    assert.equal(byDefault.call.body.model, WORKERS_AI_DEFAULT_MODEL)
    const custom = await sent(make({ model: '@cf/openai/gpt-oss-120b' }))
    assert.equal(custom.adapter.model, '@cf/openai/gpt-oss-120b')
    assert.equal(custom.call.body.model, '@cf/openai/gpt-oss-120b')
    assert.equal((await sent(make({ model: null }))).adapter.model, WORKERS_AI_DEFAULT_MODEL)
  })

  it('escapes and trims the account id', async () => {
    const { call } = await sent(make({ accountId: ' a b ' }))
    assert.equal(call.url, 'https://api.cloudflare.com/client/v4/accounts/a%20b/ai/v1/chat/completions')
  })

  it('sends no cache_control and no reasoning field', async () => {
    const { call } = await sent(make(), request({ effort: 'max' }))
    assert.deepEqual(call.body.messages[0], { role: 'system', content: 'STABLE\n\nVARIABLE' })
    assert.equal('reasoning' in call.body, false)
    assert.equal('reasoning_effort' in call.body, false)
  })

  it('is not ready without the account id or the token', async () => {
    await assertNotReady(make({ accountId: undefined }), /CLOUDFLARE_ACCOUNT_ID/)
    await assertNotReady(make({ accountId: '   ' }), /account id/)
    await assertNotReady(make({ apiToken: undefined }), /No Cloudflare API token.*CLOUDFLARE_API_TOKEN/)
    await assertNotReady(make({ apiToken: null }), /No Cloudflare API token/)
    await assertNotReady(make({ apiToken: ' ' }), /No Cloudflare API token/)
  })

  it('names the account id first when both are missing, and still has the setup card fields', () => {
    const adapter = cloudflareWorkersAIAdapter()
    assert.equal(adapter.ready, false)
    assert.match(String(adapter.setupProblem), /account id/)
    assert.equal(adapter.keyEnv, 'CLOUDFLARE_API_TOKEN')
    assert.equal(adapter.keyUrl, 'https://dash.cloudflare.com/profile/api-tokens')
    assert.equal(adapter.model, WORKERS_AI_DEFAULT_MODEL)
  })
})

// ---------------------------------------------------------------------------
// OpenAI-compatible
// ---------------------------------------------------------------------------

describe('openAICompatibleAdapter', () => {
  const base = { baseURL: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', apiKey: 'gsk-1' }
  const make = (options: Parameters<typeof openAICompatibleAdapter>[0] = {}) => (fetch: typeof globalThis.fetch) => openAICompatibleAdapter({ ...base, fetch, ...options })

  it('sends to base URL + /chat/completions with a Bearer key', async () => {
    const { call, adapter } = await sent(make())
    assert.equal(call.url, 'https://api.groq.com/openai/v1/chat/completions')
    assert.equal(call.headers.Authorization, 'Bearer gsk-1')
    assert.equal(call.body.model, 'openai/gpt-oss-120b')
    assert.equal(adapter.name, 'openai-compatible')
    assert.equal(adapter.ready, true)
    assert.equal(adapter.setupProblem, null)
    assert.equal(adapter.model, 'openai/gpt-oss-120b')
  })

  it('handles a trailing slash and a base URL that already ends with /chat/completions', async () => {
    assert.equal((await sent(make({ baseURL: 'http://localhost:11434/v1/' }))).call.url, 'http://localhost:11434/v1/chat/completions')
    assert.equal((await sent(make({ baseURL: 'http://localhost:11434/v1/chat/completions' }))).call.url, 'http://localhost:11434/v1/chat/completions')
  })

  it('sends no Authorization header without a key, and is still ready (local servers)', async () => {
    for (const apiKey of [undefined, null, '', '  ']) {
      const { call, adapter } = await sent(make({ apiKey }))
      assert.equal('Authorization' in call.headers, false)
      assert.equal(adapter.ready, true)
    }
  })

  it('uses the host of the base URL as the label, unless a label and name are given', async () => {
    assert.equal((await sent(make())).adapter.label, 'api.groq.com')
    assert.equal((await sent(make({ baseURL: 'http://localhost:11434/v1' }))).adapter.label, 'localhost:11434')
    const named = (await sent(make({ label: 'Groq', name: 'groq' }))).adapter
    assert.equal(named.label, 'Groq')
    assert.equal(named.name, 'groq')
  })

  it('sends reasoning_effort only with reasoningEffort: true and an effort; xhigh and max become high', async () => {
    const withoutOption = await sent(make(), request({ effort: 'high' }))
    assert.equal('reasoning_effort' in withoutOption.call.body, false)
    assert.equal('reasoning' in withoutOption.call.body, false)

    const withoutEffort = await sent(make({ reasoningEffort: true }))
    assert.equal('reasoning_effort' in withoutEffort.call.body, false)

    const expected: Array<[AiEffort, string]> = [
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['xhigh', 'high'],
      ['max', 'high'],
    ]
    for (const [effort, sentEffort] of expected) {
      const { call } = await sent(make({ reasoningEffort: true }), request({ effort }))
      assert.equal(call.body.reasoning_effort, sentEffort, effort)
    }
    const off = await sent(make({ reasoningEffort: false }), request({ effort: 'low' }))
    assert.equal('reasoning_effort' in off.call.body, false)
  })

  it('sends no cache_control, and passes maxTokens and extra headers', async () => {
    const { call } = await sent(make({ maxTokens: 2048, headers: { 'X-Org': 'acme' } }))
    assert.deepEqual(call.body.messages[0], { role: 'system', content: 'STABLE\n\nVARIABLE' })
    assert.equal(call.body.max_tokens, 2048)
    assert.equal(call.headers['X-Org'], 'acme')
  })

  it('is not ready without a valid base URL or a model', async () => {
    await assertNotReady(make({ baseURL: undefined }), /Set baseURL to the API base URL/)
    await assertNotReady(make({ baseURL: '  ' }), /Set baseURL/)
    await assertNotReady(make({ baseURL: 'not a url' }), /Set baseURL/)
    await assertNotReady(make({ model: undefined }), /Set the model for api\.groq\.com\./)
    await assertNotReady(make({ model: '  ' }), /Set the model for api\.groq\.com/)
    await assertNotReady(make({ model: null, baseURL: 'http://localhost:11434/v1' }), /Set the model for localhost:11434/)
  })

  it('has the setup card fields: keyEnv from the option, no key URL', () => {
    const adapter = openAICompatibleAdapter({ ...base, keyEnv: 'GROQ_API_KEY' })
    assert.equal(adapter.keyEnv, 'GROQ_API_KEY')
    assert.equal(adapter.keyUrl, null)
    assert.equal(openAICompatibleAdapter(base).keyEnv, null)
    const empty = openAICompatibleAdapter()
    assert.equal(empty.ready, false)
    assert.equal(empty.label, 'OpenAI-compatible API')
    assert.equal(empty.model, '')
  })

  it('names the env var in the hint after a 401', async () => {
    const { fetch } = createFakeChatFetch([{ status: 401, body: { error: { message: 'Invalid API Key' } } }])
    const events = await collect(openAICompatibleAdapter({ ...base, keyEnv: 'GROQ_API_KEY', fetch }))
    assert.deepEqual(events, [{ type: 'error', code: 'auth', message: 'api.groq.com rejected the API key (401): Invalid API Key. Check the API key in GROQ_API_KEY and restart the server.' }])
    const bare = createFakeChatFetch([{ status: 401, body: { error: { message: 'Nope' } } }])
    const bareEvents = await collect(openAICompatibleAdapter({ ...base, fetch: bare.fetch }))
    assert.equal(bareEvents[0].type === 'error' && bareEvents[0].message, 'api.groq.com rejected the API key (401): Nope. Check the API key and restart the server.')
  })
})

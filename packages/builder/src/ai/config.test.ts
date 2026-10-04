import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { aiClientConfig, chatCompletionsUrl, DEFAULT_AI_MODEL, DEFAULT_OPENROUTER_MODEL, openAiTarget, resolveAi } from './config'

describe('resolveAi', () => {
  it('defaults to Anthropic', () => {
    const resolved = resolveAi({}, {})
    assert.deepEqual(resolved.provider, { type: 'anthropic' })
    assert.equal(resolved.model, DEFAULT_AI_MODEL)
    assert.equal(resolved.identity, `anthropic:${DEFAULT_AI_MODEL}`)
    assert.equal(resolved.problem, null)
  })

  it('picks OpenRouter when only OPENROUTER_API_KEY is set', () => {
    const resolved = resolveAi({}, { OPENROUTER_API_KEY: 'sk-or-x' })
    assert.deepEqual(resolved.provider, { type: 'openrouter' })
    assert.equal(resolved.model, DEFAULT_OPENROUTER_MODEL)
    assert.equal(resolved.label, 'OpenRouter')
    // Both keys: Anthropic stays the default (existing setups keep working).
    assert.equal(resolveAi({}, { OPENROUTER_API_KEY: 'a', ANTHROPIC_API_KEY: 'b' }).provider.type, 'anthropic')
  })

  it('reads BUILDER_AI_PROVIDER, BUILDER_AI_MODEL and BUILDER_AI_BASE_URL', () => {
    const resolved = resolveAi({}, { BUILDER_AI_PROVIDER: 'openai-compatible', BUILDER_AI_MODEL: 'llama3.3', BUILDER_AI_BASE_URL: 'http://localhost:11434/v1' })
    assert.deepEqual(resolved.provider, { type: 'openai-compatible', baseURL: 'http://localhost:11434/v1' })
    assert.equal(resolved.model, 'llama3.3')
    assert.equal(resolved.label, 'localhost:11434')
    assert.equal(resolved.problem, null)
  })

  it('explains what is missing', () => {
    assert.match(String(resolveAi({}, { BUILDER_AI_PROVIDER: 'cloudflare', BUILDER_AI_MODEL: 'openai/gpt-5.2' }).problem), /CLOUDFLARE_ACCOUNT_ID/)
    assert.match(String(resolveAi({}, { BUILDER_AI_PROVIDER: 'openai-compatible', BUILDER_AI_BASE_URL: 'https://x.test/v1' }).problem), /BUILDER_AI_MODEL/)
    assert.match(String(resolveAi({}, { BUILDER_AI_PROVIDER: 'gemini' }).problem), /one of: anthropic, openrouter/)
  })

  it('lets code win over the environment', () => {
    const resolved = resolveAi({ provider: { type: 'openrouter' }, model: 'google/gemini-3.8-flash' }, { BUILDER_AI_PROVIDER: 'anthropic', BUILDER_AI_MODEL: 'x' })
    assert.equal(resolved.identity, 'openrouter:google/gemini-3.8-flash')
  })

  it('gives the editor provider, label, model and key env', () => {
    assert.deepEqual(aiClientConfig({ provider: { type: 'openrouter' } }, '/api/builder/ai', {}), {
      endpoint: '/api/builder/ai',
      model: DEFAULT_OPENROUTER_MODEL,
      provider: 'openrouter',
      providerLabel: 'OpenRouter',
      keyEnv: 'OPENROUTER_API_KEY',
    })
  })
})

describe('openAiTarget', () => {
  it('OpenRouter: URL, key and attribution headers', () => {
    const target = openAiTarget({ type: 'openrouter' }, { env: { OPENROUTER_API_KEY: 'sk-or-1' }, siteUrl: 'https://example.com' })
    assert.equal(target.url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.deepEqual(target.headers, {
      Authorization: 'Bearer sk-or-1',
      'HTTP-Referer': 'https://example.com',
      'X-Title': 'Payload Website Builder',
      'X-OpenRouter-Title': 'Payload Website Builder',
    })
    assert.equal(target.missingKey, null)
    assert.match(String(openAiTarget({ type: 'openrouter' }, { env: {} }).missingKey), /OPENROUTER_API_KEY/)
    assert.equal(openAiTarget({ type: 'openrouter', apiKeyEnv: 'MY_KEY' }, { env: { MY_KEY: 'k' } }).headers.Authorization, 'Bearer k')
  })

  it('Cloudflare: compat URL, gateway token and optional provider key', () => {
    const provider = { type: 'cloudflare' as const, accountId: 'acc 1', gatewayId: 'gw' }
    const byok = openAiTarget(provider, { env: { CF_AIG_TOKEN: 'cf-tok' } })
    assert.equal(byok.url, 'https://gateway.ai.cloudflare.com/v1/acc%201/gw/compat/chat/completions')
    assert.deepEqual(byok.headers, { 'cf-aig-authorization': 'Bearer cf-tok' })
    const withKey = openAiTarget(provider, { env: { CF_AIG_TOKEN: 'cf-tok', BUILDER_AI_API_KEY: 'sk-openai' } })
    assert.deepEqual(withKey.headers, { Authorization: 'Bearer sk-openai', 'cf-aig-authorization': 'Bearer cf-tok' })
    assert.match(String(openAiTarget(provider, { env: {} }).missingKey), /CF_AIG_TOKEN/)
  })

  it('OpenAI-compatible: base URL, optional key, custom headers', () => {
    const target = openAiTarget({ type: 'openai-compatible', baseURL: 'https://api.groq.com/openai/v1/', headers: { 'X-Extra': '1' } }, { env: { OPENAI_API_KEY: 'sk-1' } })
    assert.equal(target.url, 'https://api.groq.com/openai/v1/chat/completions')
    assert.deepEqual(target.headers, { Authorization: 'Bearer sk-1', 'X-Extra': '1' })
    assert.deepEqual(openAiTarget({ type: 'openai-compatible', baseURL: 'http://localhost:1234/v1' }, { env: {} }).headers, {})
    assert.equal(openAiTarget({ type: 'openai-compatible', baseURL: 'http://x.test/v1', apiKeyEnv: 'K' }, { env: { K: 'k', OPENAI_API_KEY: 'o' } }).headers.Authorization, 'Bearer k')
  })

  it('accepts a base URL that already ends with /chat/completions', () => {
    assert.equal(chatCompletionsUrl('https://x.test/v1/chat/completions'), 'https://x.test/v1/chat/completions')
  })
})

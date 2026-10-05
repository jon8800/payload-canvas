import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fakeAdapter } from './adapters/fake'
import { openRouterAdapter } from './adapters/openrouter'
import { aiClientConfig, clientIdentity, NO_ADAPTER_PROBLEM, PROVIDER_REMOVED_PROBLEM } from './config'
import type { AiOptions } from './types'

describe('aiClientConfig', () => {
  it('describes a ready adapter', () => {
    const config = aiClientConfig({ adapter: openRouterAdapter({ apiKey: 'sk-or-1' }) }, '/api/builder/ai')
    assert.deepEqual(config, {
      endpoint: '/api/builder/ai',
      adapter: 'openrouter',
      label: 'OpenRouter',
      model: 'openai/gpt-6-luna',
      ready: true,
      setupProblem: null,
      keyEnv: 'OPENROUTER_API_KEY',
      keyUrl: 'https://openrouter.ai/keys',
      images: null,
    })
    assert.equal(clientIdentity(config), 'openrouter:openai/gpt-6-luna')
  })

  it('passes the setup problem of an adapter without a key', () => {
    const config = aiClientConfig({ adapter: openRouterAdapter({ apiKey: process.env.SURELY_NOT_SET_KEY }) }, '/api/builder/ai')
    assert.equal(config.ready, false)
    assert.match(String(config.setupProblem), /OPENROUTER_API_KEY/)
  })

  it('shows the setup card without an adapter', () => {
    const config = aiClientConfig({}, '/api/builder/ai')
    assert.equal(config.ready, false)
    assert.equal(config.adapter, 'none')
    assert.equal(config.setupProblem, NO_ADAPTER_PROBLEM)
  })

  it('points an old ai.provider config to adapters', () => {
    const config = aiClientConfig({ provider: { type: 'openrouter' } } as unknown as AiOptions, '/api/builder/ai')
    assert.equal(config.setupProblem, PROVIDER_REMOVED_PROBLEM)
  })

  it('uses the fake adapter identity', () => {
    assert.equal(clientIdentity(aiClientConfig({ adapter: fakeAdapter() }, '/x')), 'fake:scripted')
  })
})

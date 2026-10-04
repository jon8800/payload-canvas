// Which model API the assistant talks to: the plugin option `ai`, filled in from the environment.
// Pure functions (env is a parameter), so presets and defaults are unit-tested.

import type { AiClientConfig, AiOptions, AiProvider } from './types'

export type Env = Record<string, string | undefined>

export const DEFAULT_AI_MODEL = 'claude-opus-5-5'
/** Cheap, fast, tool-capable. See docs/ai/providers.md for other options. */
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-6-luna'
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const CLOUDFLARE_GATEWAY_URL = 'https://gateway.ai.cloudflare.com/v1'
/** Sent to OpenRouter as the app name. */
export const AI_APP_TITLE = 'Payload Website Builder'

export const PROVIDER_TYPES = ['anthropic', 'openrouter', 'cloudflare', 'openai-compatible'] as const

const LABELS: Record<AiProvider['type'], string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  cloudflare: 'Cloudflare AI Gateway',
  'openai-compatible': 'OpenAI-compatible API',
}

export type ResolvedAi = {
  provider: AiProvider
  model: string
  /** "OpenRouter", "Anthropic", "api.openai.com", … */
  label: string
  /** `${provider.type}:${model}`. History is only valid for the identity that wrote it. */
  identity: string
  /** The env var the key comes from, for setup hints. Null when no key is needed or it is set in code. */
  keyEnv: string | null
  /** Why this config cannot work (no model, no base URL, no account id). Shown as the setup hint. */
  problem: string | null
}

const clean = (value: string | undefined) => (value?.trim() ? value.trim() : undefined)

/** The provider from BUILDER_AI_PROVIDER, or a guess from the keys that are set. */
export function providerFromEnv(env: Env): { provider: AiProvider; problem: string | null } {
  const type = clean(env.BUILDER_AI_PROVIDER)?.toLowerCase()
  if (!type) {
    const openrouterOnly = Boolean(clean(env.OPENROUTER_API_KEY)) && !clean(env.ANTHROPIC_API_KEY)
    return { provider: openrouterOnly ? { type: 'openrouter' } : { type: 'anthropic' }, problem: null }
  }
  switch (type) {
    case 'anthropic':
    case 'openrouter':
      return { provider: { type }, problem: null }
    case 'cloudflare':
      return {
        provider: { type, accountId: clean(env.CLOUDFLARE_ACCOUNT_ID) ?? '', gatewayId: clean(env.CLOUDFLARE_AI_GATEWAY_ID) ?? '' },
        problem: null,
      }
    case 'openai':
    case 'openai-compatible':
      return { provider: { type: 'openai-compatible', baseURL: clean(env.BUILDER_AI_BASE_URL) ?? '' }, problem: null }
    default:
      return {
        provider: { type: 'anthropic' },
        problem: `BUILDER_AI_PROVIDER is "${type}". Use one of: ${PROVIDER_TYPES.join(', ')}.`,
      }
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function keyEnvOf(provider: AiProvider): string | null {
  switch (provider.type) {
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'openrouter':
      return provider.apiKey ? null : (provider.apiKeyEnv ?? 'OPENROUTER_API_KEY')
    case 'cloudflare':
      return provider.gatewayToken || provider.apiKey ? null : (provider.gatewayTokenEnv ?? 'CF_AIG_TOKEN')
    case 'openai-compatible':
      return provider.apiKey ? null : (provider.apiKeyEnv ?? 'BUILDER_AI_API_KEY')
  }
}

/** The plugin option with defaults and the environment applied. */
export function resolveAi(ai: AiOptions, env: Env = process.env): ResolvedAi {
  const fromEnv = ai.provider ? { provider: ai.provider, problem: null } : providerFromEnv(env)
  const { provider } = fromEnv
  const defaultModel = provider.type === 'anthropic' ? DEFAULT_AI_MODEL : provider.type === 'openrouter' ? DEFAULT_OPENROUTER_MODEL : ''
  const model = clean(ai.model) ?? clean(env.BUILDER_AI_MODEL) ?? defaultModel
  let problem = fromEnv.problem
  if (!problem && !model) problem = `Set the model for ${LABELS[provider.type]}: BUILDER_AI_MODEL in .env, or the plugin option ai.model.`
  if (!problem && provider.type === 'cloudflare' && (!provider.accountId || !provider.gatewayId)) {
    problem = 'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_GATEWAY_ID in .env (or provider.accountId and provider.gatewayId).'
  }
  if (!problem && provider.type === 'openai-compatible' && !hostOf(provider.baseURL)) {
    problem = 'Set BUILDER_AI_BASE_URL in .env (or provider.baseURL) to the API base URL, for example https://api.openai.com/v1.'
  }
  const label = provider.type === 'openai-compatible' ? (hostOf(provider.baseURL) ?? LABELS[provider.type]) : LABELS[provider.type]
  return { provider, model, label, identity: `${provider.type}:${model}`, keyEnv: keyEnvOf(provider), problem }
}

/** `BuilderClientConfig.ai` for the editor. */
export function aiClientConfig(ai: AiOptions, endpoint: string, env: Env = process.env): AiClientConfig {
  const resolved = resolveAi(ai, env)
  const setupProblem = resolved.problem ?? missingCredential(resolved.provider, env)
  return {
    endpoint,
    model: resolved.model,
    provider: resolved.provider.type,
    providerLabel: resolved.label,
    keyEnv: resolved.keyEnv,
    ready: setupProblem === null,
    setupProblem,
  }
}

/**
 * Why the assistant cannot answer yet (no key in the server environment), or null. Read when the
 * server starts. Anthropic also accepts `ant auth login` credentials, which cannot be seen here,
 * so the Anthropic message says "probably".
 */
function missingCredential(provider: AiProvider, env: Env): string | null {
  if (provider.type === 'anthropic') {
    if (clean(env.ANTHROPIC_API_KEY) || clean(env.ANTHROPIC_AUTH_TOKEN)) return null
    return 'The AI assistant is probably not set up: the server has no ANTHROPIC_API_KEY. Ask your developer to add an API key.'
  }
  const missing = openAiTarget(provider, { env }).missingKey
  return missing ? `The AI assistant is not set up yet. ${missing}` : null
}

/** The history identity the editor uses: `${provider}:${model}`. */
export function clientIdentity(config: Pick<AiClientConfig, 'provider' | 'model'>): string {
  return `${config.provider ?? 'anthropic'}:${config.model}`
}

// ---------------------------------------------------------------------------
// OpenAI-compatible targets
// ---------------------------------------------------------------------------

export type OpenAiTarget = {
  label: string
  /** The full Chat Completions URL. */
  url: string
  /** Request headers, credentials included. Never log them. */
  headers: Record<string, string>
  /** Set when a needed credential is missing: the setup hint. */
  missingKey: string | null
  /** What to check after a 401. */
  keyHint: string
}

/** `${base}/chat/completions`, unless the base already is the full URL. */
export function chatCompletionsUrl(baseURL: string): string {
  const base = baseURL.trim().replace(/\/+$/, '')
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

const bearer = (key: string) => `Bearer ${key}`

/**
 * URL, headers and credentials for an OpenAI-compatible provider. `siteUrl` is sent to OpenRouter
 * as HTTP-Referer (app attribution).
 */
export function openAiTarget(provider: Exclude<AiProvider, { type: 'anthropic' }>, options: { env?: Env; siteUrl?: string | null } = {}): OpenAiTarget {
  const env = options.env ?? process.env
  const fromEnv = (name: string | undefined) => (name ? clean(env[name]) : undefined)

  if (provider.type === 'openrouter') {
    const keyEnv = provider.apiKeyEnv ?? 'OPENROUTER_API_KEY'
    const key = provider.apiKey ?? fromEnv(keyEnv)
    const site = clean(options.siteUrl ?? undefined)
    const hint = `Set ${keyEnv} in the server environment (.env) and restart the server. Create a key at https://openrouter.ai/keys.`
    return {
      label: LABELS.openrouter,
      url: chatCompletionsUrl(OPENROUTER_BASE_URL),
      headers: {
        ...(key ? { Authorization: bearer(key) } : {}),
        ...(site ? { 'HTTP-Referer': site } : {}),
        'X-Title': AI_APP_TITLE,
        'X-OpenRouter-Title': AI_APP_TITLE,
      },
      missingKey: key ? null : `No OpenRouter API key. ${hint}`,
      keyHint: hint,
    }
  }

  if (provider.type === 'cloudflare') {
    const key = provider.apiKey ?? fromEnv(provider.apiKeyEnv ?? 'BUILDER_AI_API_KEY')
    const token = provider.gatewayToken ?? fromEnv(provider.gatewayTokenEnv ?? 'CF_AIG_TOKEN')
    const hint =
      'Set CF_AIG_TOKEN (the gateway token, for stored provider keys or unified billing) and/or BUILDER_AI_API_KEY (a provider key) in .env and restart the server.'
    return {
      label: LABELS.cloudflare,
      url: `${CLOUDFLARE_GATEWAY_URL}/${encodeURIComponent(provider.accountId)}/${encodeURIComponent(provider.gatewayId)}/compat/chat/completions`,
      headers: {
        ...(key ? { Authorization: bearer(key) } : {}),
        ...(token ? { 'cf-aig-authorization': bearer(token) } : {}),
      },
      missingKey: key || token ? null : `No Cloudflare AI Gateway credentials. ${hint}`,
      keyHint: hint,
    }
  }

  const keyEnv = provider.apiKeyEnv
  const key = provider.apiKey ?? (keyEnv ? fromEnv(keyEnv) : (fromEnv('BUILDER_AI_API_KEY') ?? fromEnv('OPENAI_API_KEY')))
  return {
    label: hostOf(provider.baseURL) ?? LABELS['openai-compatible'],
    url: chatCompletionsUrl(provider.baseURL),
    // No key is fine for local servers (Ollama, LM Studio): a 401 then says what to set.
    headers: { ...(key ? { Authorization: bearer(key) } : {}), ...provider.headers },
    missingKey: null,
    keyHint: `Set ${keyEnv ?? 'BUILDER_AI_API_KEY'} in the server environment (.env) and restart the server.`,
  }
}

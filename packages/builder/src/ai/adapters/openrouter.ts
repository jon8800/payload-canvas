// OpenRouter as an AiAdapter: one key for hundreds of models.
//
//   import { openRouterAdapter } from '@payload-toolkit/builder/ai/openrouter'
//   ai: { adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }) }

import { bearer, chatCompletionsUrl, clean, createOpenAIFormatAdapter, type OpenAIFormatTransportOptions } from '../openai-format'
import type { AiAdapter } from '../types'

/** Cheap, fast, tool-capable. See docs/ai/providers.md for other options. */
export const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-6-luna'
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
/** Sent to OpenRouter as the app name. */
export const OPENROUTER_APP_TITLE = 'Payload Website Builder'

export type OpenRouterAdapterOptions = OpenAIFormatTransportOptions & {
  /** The OpenRouter key. Without it the panel shows the setup card. */
  apiKey?: string | null
  /** Default "openai/gpt-6-luna". */
  model?: string
  /** Your site URL, sent as HTTP-Referer: the app shows up in your OpenRouter activity. */
  siteUrl?: string | null
  /** Sent as X-Title. Default "Payload Website Builder". */
  appTitle?: string
  /** Default https://openrouter.ai/api/v1. */
  baseURL?: string
}

/**
 * Models that take `cache_control` breakpoints on OpenRouter. Other models cache on their own
 * (OpenAI, DeepSeek, Grok) or not at all.
 */
const EXPLICIT_CACHE = /^(anthropic|google)\//

export function openRouterAdapter(options: OpenRouterAdapterOptions = {}): AiAdapter {
  const { apiKey: rawKey, model: rawModel, siteUrl, appTitle, baseURL, ...transport } = options
  const apiKey = clean(rawKey)
  const model = clean(rawModel) ?? OPENROUTER_DEFAULT_MODEL
  const site = clean(siteUrl)
  const title = appTitle ?? OPENROUTER_APP_TITLE
  const keyHint = 'Set OPENROUTER_API_KEY in the server environment (.env) and restart the server. Create a key at https://openrouter.ai/keys.'
  return createOpenAIFormatAdapter({
    ...transport,
    name: 'openrouter',
    label: 'OpenRouter',
    model,
    url: chatCompletionsUrl(baseURL ?? OPENROUTER_BASE_URL),
    authHeaders: {
      ...(apiKey ? { Authorization: bearer(apiKey) } : {}),
      ...(site ? { 'HTTP-Referer': site } : {}),
      'X-Title': title,
      'X-OpenRouter-Title': title,
    },
    ready: Boolean(apiKey),
    setupProblem: apiKey ? null : `No OpenRouter API key. ${keyHint}`,
    keyEnv: 'OPENROUTER_API_KEY',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint,
    cacheControl: EXPLICIT_CACHE.test(model),
    // OpenRouter normalizes reasoning effort across models. It has no "max": use its highest.
    extraBody: ({ effort }) => (effort ? { reasoning: { effort: effort === 'max' ? 'xhigh' : effort } } : undefined),
  })
}

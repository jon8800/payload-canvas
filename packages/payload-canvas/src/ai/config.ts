// The plugin option `ai` as the editor sees it. Client-safe: the editor imports clientIdentity.

import { IMAGE_ASPECT_RATIOS } from './images/ratios'
import type { AiAdapter, AiClientConfig, AiImageAdapter, AiImagesClientConfig, AiOptions } from './types'

/**
 * What the server knows at request time: which uses have a key in the AI settings, and the
 * settings page (null when settings are off or the user may not open them).
 */
export type AiRequestState = { keys?: { chat?: boolean; images?: boolean }; settingsUrl?: string | null }

/** The adapter can run: ready from its options, or only the key was missing and the AI settings have one. */
export function adapterReady(adapter: Pick<AiAdapter | AiImageAdapter, 'ready' | 'missingKey' | 'acceptsApiKey'>, settingsKey: boolean | string | undefined): boolean {
  return adapter.ready || Boolean(adapter.missingKey && adapter.acceptsApiKey && settingsKey)
}

/** Appended to a setup problem when the AI settings can take the key. */
export const SETTINGS_KEY_HINT = 'Or paste an API key in the admin: AI settings.'

/** The adapter's setup problem, plus the AI settings hint when a key there would fix it. */
export function setupProblemOf(adapter: Pick<AiAdapter | AiImageAdapter, 'label' | 'setupProblem' | 'missingKey' | 'acceptsApiKey'>, settings: boolean, what = ''): string {
  const problem = adapter.setupProblem?.trim() || `${adapter.label}${what} is not set up.`
  return settings && adapter.missingKey && adapter.acceptsApiKey ? `${problem} ${SETTINGS_KEY_HINT}` : problem
}

/** `AiClientConfig.images`: null unless an image adapter is ready. */
export function imagesClientConfig(ai: AiOptions, endpoint: string, state: AiRequestState = {}): AiImagesClientConfig | null {
  const images = ai.images
  if (!images || !adapterReady(images, state.keys?.images)) return null
  return { endpoint: `${endpoint}/image`, label: images.label, model: images.model, collection: ai.mediaCollection ?? 'media', aspectRatios: [...IMAGE_ASPECT_RATIOS] }
}

/** Shown when `ai` is set without an adapter. */
export const NO_ADAPTER_PROBLEM =
  'No AI adapter is configured. Add one to the plugin options, for example ai: { adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }) } from "payload-canvas/ai/openrouter".'

/** Shown when a config still uses the removed `ai.provider` option. */
export const PROVIDER_REMOVED_PROBLEM =
  'The ai.provider option and the BUILDER_AI_* environment variables were replaced by adapters. Set ai.adapter instead, for example openRouterAdapter() from "payload-canvas/ai/openrouter". See docs/ai/providers.md.'

/** Why the assistant has no adapter: no adapter at all, or a config written for the old `provider` option. */
export function missingAdapterProblem(ai: AiOptions): string {
  return 'provider' in ai ? PROVIDER_REMOVED_PROBLEM : NO_ADAPTER_PROBLEM
}

/**
 * `BuilderClientConfig.ai` for the editor. `state`: the AI settings at request time (the builder
 * view passes it). Without it, readiness comes from the adapter options only.
 */
export function aiClientConfig(ai: AiOptions, endpoint: string, state: AiRequestState = {}): AiClientConfig {
  const adapter = ai.adapter
  const settingsUrl = state.settingsUrl ?? null
  if (!adapter) {
    return {
      endpoint,
      adapter: 'none',
      label: 'No adapter',
      model: '',
      ready: false,
      setupProblem: missingAdapterProblem(ai),
      keyEnv: null,
      keyUrl: null,
      images: imagesClientConfig(ai, endpoint, state),
      settingsUrl: null,
    }
  }
  const ready = adapterReady(adapter, state.keys?.chat)
  return {
    endpoint,
    adapter: adapter.name,
    label: adapter.label,
    model: adapter.model,
    ready,
    setupProblem: ready ? null : setupProblemOf(adapter, ai.settings !== false),
    keyEnv: adapter.keyEnv ?? null,
    keyUrl: adapter.keyUrl ?? null,
    images: imagesClientConfig(ai, endpoint, state),
    // Only when a key there makes the assistant work.
    settingsUrl: adapter.acceptsApiKey ? settingsUrl : null,
  }
}

/** The history identity the editor uses: `${adapter}:${model}`, the same as the server's. */
export function clientIdentity(config: Pick<AiClientConfig, 'adapter' | 'model'>): string {
  return `${config.adapter}:${config.model}`
}

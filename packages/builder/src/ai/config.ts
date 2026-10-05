// The plugin option `ai` as the editor sees it. Client-safe: the editor imports clientIdentity.

import { IMAGE_ASPECT_RATIOS } from './images/ratios'
import type { AiClientConfig, AiImagesClientConfig, AiOptions } from './types'

/** `AiClientConfig.images`: null unless an image adapter is ready. */
export function imagesClientConfig(ai: AiOptions, endpoint: string): AiImagesClientConfig | null {
  const images = ai.images
  if (!images?.ready) return null
  return { endpoint: `${endpoint}/image`, label: images.label, model: images.model, collection: ai.mediaCollection ?? 'media', aspectRatios: [...IMAGE_ASPECT_RATIOS] }
}

/** Shown when `ai` is set without an adapter. */
export const NO_ADAPTER_PROBLEM =
  'No AI adapter is configured. Add one to the plugin options, for example ai: { adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }) } from "@payload-toolkit/builder/ai/openrouter".'

/** Shown when a config still uses the removed `ai.provider` option. */
export const PROVIDER_REMOVED_PROBLEM =
  'The ai.provider option and the BUILDER_AI_* environment variables were replaced by adapters. Set ai.adapter instead, for example openRouterAdapter() from "@payload-toolkit/builder/ai/openrouter". See docs/ai/providers.md.'

/** Why the assistant has no adapter: no adapter at all, or a config written for the old `provider` option. */
export function missingAdapterProblem(ai: AiOptions): string {
  return 'provider' in ai ? PROVIDER_REMOVED_PROBLEM : NO_ADAPTER_PROBLEM
}

/** `BuilderClientConfig.ai` for the editor. */
export function aiClientConfig(ai: AiOptions, endpoint: string): AiClientConfig {
  const adapter = ai.adapter
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
      images: imagesClientConfig(ai, endpoint),
    }
  }
  return {
    endpoint,
    adapter: adapter.name,
    label: adapter.label,
    model: adapter.model,
    ready: adapter.ready,
    setupProblem: adapter.ready ? null : adapter.setupProblem?.trim() || `${adapter.label} is not set up.`,
    keyEnv: adapter.keyEnv ?? null,
    keyUrl: adapter.keyUrl ?? null,
    images: imagesClientConfig(ai, endpoint),
  }
}

/** The history identity the editor uses: `${adapter}:${model}`, the same as the server's. */
export function clientIdentity(config: Pick<AiClientConfig, 'adapter' | 'model'>): string {
  return `${config.adapter}:${config.model}`
}

// The OpenAI Images API (and servers that copy it) as an AiImageAdapter:
//   POST {baseURL}/images/generations  { model, prompt, n, size, quality?, output_format? }
//   -> { data: [{ b64_json } | { url }], usage: { input_tokens, output_tokens } }
//
//   import { openAIImageAdapter } from 'payload-canvas/ai/images/openai'
//   ai: { images: openAIImageAdapter({ apiKey: process.env.OPENAI_API_KEY }) }

import { isPlainObject } from '../../core/tree'
import { bearer } from '../openai-format'
import type { AiImageAdapter, AiImageAspectRatio, AiImageResult, AiImageUsage } from '../types'
import {
  AiImageError,
  clean,
  closestRatio,
  decodeImageData,
  downloadImage,
  postImageRequest,
  readJson,
  sizeForRatio,
  toGeneratedImage,
  type ImageTransportOptions,
} from './shared'

export const OPENAI_IMAGE_DEFAULT_MODEL = 'gpt-image-2.5-flare'
export const OPENAI_BASE_URL = 'https://api.openai.com/v1'

/** The three sizes every gpt-image model accepts. */
const STANDARD_SIZES: Record<'1:1' | '3:2' | '2:3', string> = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' }

/**
 * The `size` for a ratio. gpt-image-2 and newer take any WIDTHxHEIGHT in multiples of 16 (long
 * edge 1536 here); older models take only the three standard sizes.
 */
export function openAIImageSize(model: string, ratio: AiImageAspectRatio): string {
  if (/^gpt-image-[2-9]/.test(model)) {
    const { width, height } = sizeForRatio(ratio, 1536, 16)
    return `${width}x${height}`
  }
  return STANDARD_SIZES[closestRatio(ratio, ['1:1', '3:2', '2:3'] as const)]
}

export type OpenAIImageAdapterOptions = ImageTransportOptions & {
  /** Sent as `Authorization: Bearer …`. */
  apiKey?: string | null
  /** Default "gpt-image-2.5-flare". */
  model?: string | null
  /** Default https://api.openai.com/v1. Any server with the same /images/generations API works. */
  baseURL?: string | null
  /** "low", "medium", "high" or "auto". Default: not sent (the model's default). */
  quality?: string
  /** "png", "jpeg" or "webp". Default: not sent (PNG). */
  outputFormat?: 'png' | 'jpeg' | 'webp'
  /** Replaces the size mapping, e.g. for a server with its own sizes. Return null to send no size. */
  size?: (ratio: AiImageAspectRatio, model: string) => string | null
  /** Short id. Default "openai". */
  name?: string
  /** Shown in the editor. Default "OpenAI" (or the host of baseURL). */
  label?: string
  /** The env var that holds the key, for setup messages. Default "OPENAI_API_KEY". */
  keyEnv?: string
  /** Extra body fields. */
  extraBody?: Record<string, unknown>
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

function usageOf(value: unknown): AiImageUsage | undefined {
  if (!isPlainObject(value)) return undefined
  const input = num(value.input_tokens) ?? num(value.prompt_tokens)
  const output = num(value.output_tokens) ?? num(value.completion_tokens)
  const cost = num(value.cost)
  const usage: AiImageUsage = { ...(input !== undefined ? { inputTokens: input } : {}), ...(output !== undefined ? { outputTokens: output } : {}), ...(cost !== undefined ? { cost } : {}) }
  return Object.keys(usage).length > 0 ? usage : undefined
}

export function openAIImageAdapter(options: OpenAIImageAdapterOptions = {}): AiImageAdapter {
  const { apiKey: rawKey, model: rawModel, baseURL: rawBase, quality, outputFormat, size, name, label: rawLabel, keyEnv: rawKeyEnv, extraBody, ...transport } = options
  const apiKey = clean(rawKey)
  const model = clean(rawModel) ?? OPENAI_IMAGE_DEFAULT_MODEL
  const base = (clean(rawBase) ?? OPENAI_BASE_URL).replace(/\/+$/, '')
  const official = base === OPENAI_BASE_URL
  const label = rawLabel ?? (official ? 'OpenAI' : (hostOf(base) ?? 'Images API'))
  const keyEnv = rawKeyEnv ?? 'OPENAI_API_KEY'
  const keyHint = `Check ${keyEnv} in .env and restart the server.`
  const context = { label, model, keyHint }
  // Only OpenAI itself needs a key for sure; a local server may not.
  const setupProblem = !hostOf(base) ? 'Set baseURL to the API base URL, for example https://api.openai.com/v1.' : official && !apiKey ? `No OpenAI API key for image generation. Set ${keyEnv} in .env and restart the server.` : null
  const url = base.endsWith('/images/generations') ? base : `${base}/images/generations`

  return {
    name: name ?? 'openai',
    label,
    model,
    ready: setupProblem === null,
    setupProblem,
    keyEnv,
    keyUrl: official ? 'https://platform.openai.com/api-keys' : null,
    async generate(request): Promise<AiImageResult> {
      if (setupProblem) throw new AiImageError('auth', setupProblem)
      const sizeValue = size ? size(request.aspectRatio, model) : openAIImageSize(model, request.aspectRatio)
      const response = await postImageRequest({
        ...transport,
        url,
        headers: { ...(apiKey ? { Authorization: bearer(apiKey) } : {}), ...transport.headers },
        body: {
          model,
          prompt: request.prompt,
          n: request.n,
          ...(sizeValue ? { size: sizeValue } : {}),
          ...(quality ? { quality } : {}),
          ...(outputFormat ? { output_format: outputFormat } : {}),
          ...extraBody,
        },
        signal: request.signal,
        context,
      })
      const json = await readJson(response, context)
      const items = Array.isArray(json.data) ? json.data.filter(isPlainObject) : []
      const declared = outputFormat ? `image/${outputFormat}` : null
      const images = []
      for (const item of items) {
        if (typeof item.b64_json === 'string' && item.b64_json) {
          images.push(toGeneratedImage(decodeImageData(item.b64_json).data, declared))
        } else if (typeof item.url === 'string' && item.url) {
          const decoded = item.url.startsWith('data:') ? decodeImageData(item.url) : await downloadImage(item.url, { fetch: transport.fetch, signal: request.signal })
          images.push(toGeneratedImage(decoded.data, decoded.mimeType ?? declared))
        }
      }
      if (images.length === 0) throw new AiImageError('no_image', `${label} returned no image. Try another prompt.`)
      const revised = items.find((item) => typeof item.revised_prompt === 'string')?.revised_prompt
      const usage = usageOf(json.usage)
      return { images, ...(typeof revised === 'string' ? { revisedPrompt: revised } : {}), ...(usage ? { usage } : {}) }
    },
  }
}

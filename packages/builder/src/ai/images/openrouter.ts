// OpenRouter image generation as an AiImageAdapter. Uses OpenRouter's Images API
//   POST https://openrouter.ai/api/v1/images  { model, prompt, n, aspect_ratio }
//   -> { data: [{ b64_json, media_type }], usage: { cost } }
// It serves every image model on OpenRouter (FLUX, Recraft, Seedream, Gemini image, gpt-image …)
// with one request shape. The adapter reads the model's supported parameters once from
// GET /api/v1/images/models (no key needed) and maps the aspect ratio and `n` to them.
//
//   import { openRouterImageAdapter } from '@payload-toolkit/builder/ai/images/openrouter'
//   ai: { images: openRouterImageAdapter({ apiKey: process.env.OPENROUTER_API_KEY }) }

import { isPlainObject } from '../../core/tree'
import { bearer } from '../openai-format'
import type { AiImageAdapter, AiImageResult, AiImageUsage } from '../types'
import {
  AiImageError,
  clean,
  closestRatio,
  decodeImageData,
  downloadImage,
  postImageRequest,
  readJson,
  toGeneratedImage,
  type ImageTransportOptions,
} from './shared'

/** Photo-real, about one US cent for a 16:9 image (0.014 USD per megapixel, October 2026). */
export const OPENROUTER_IMAGE_DEFAULT_MODEL = 'black-forest-labs/flux.2-klein-4b'
export const OPENROUTER_IMAGES_BASE_URL = 'https://openrouter.ai/api/v1'

export type OpenRouterImageAdapterOptions = ImageTransportOptions & {
  /** The OpenRouter key. Without it the adapter is not ready and the Generate action stays hidden. */
  apiKey?: string | null
  /** An image model id from openrouter.ai/models?output_modalities=image. Default "black-forest-labs/flux.2-klein-4b". */
  model?: string | null
  /** Sent as `output_format` when the model supports it: "png", "jpeg" or "webp". Default: the model's default. */
  outputFormat?: 'png' | 'jpeg' | 'webp'
  /** Sent as `resolution` when the model supports it, e.g. "1K" or "2K". Default: the model's default. */
  resolution?: string
  /** Your site URL, sent as HTTP-Referer. */
  siteUrl?: string | null
  /** Sent as X-Title. Default "Payload Website Builder". */
  appTitle?: string
  /** Default https://openrouter.ai/api/v1. */
  baseURL?: string
  /** Extra body fields, e.g. `{ provider: { sort: 'price' } }`. */
  extraBody?: Record<string, unknown>
}

/** What the model accepts, from GET /images/models. Null fields: unknown, send as is. */
type ModelParams = { aspectRatios: string[] | null; maxN: number | null; params: Set<string> | null }

const UNKNOWN: ModelParams = { aspectRatios: null, maxN: null, params: null }

function paramsOf(model: unknown): ModelParams {
  const supported = isPlainObject(model) && isPlainObject(model.supported_parameters) ? model.supported_parameters : null
  if (!supported) return UNKNOWN
  const ratio = supported.aspect_ratio
  const n = supported.n
  return {
    aspectRatios: isPlainObject(ratio) && Array.isArray(ratio.values) ? ratio.values.filter((v): v is string => typeof v === 'string' && v !== 'auto') : null,
    maxN: isPlainObject(n) && typeof n.max === 'number' ? n.max : null,
    params: new Set(Object.keys(supported)),
  }
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

function usageOf(value: unknown): AiImageUsage | undefined {
  if (!isPlainObject(value)) return undefined
  const usage: AiImageUsage = {}
  const cost = num(value.cost)
  const input = num(value.prompt_tokens) ?? num(value.input_tokens)
  const output = num(value.completion_tokens) ?? num(value.output_tokens)
  if (cost !== undefined) usage.cost = cost
  if (input !== undefined) usage.inputTokens = input
  if (output !== undefined) usage.outputTokens = output
  return Object.keys(usage).length > 0 ? usage : undefined
}

export function openRouterImageAdapter(options: OpenRouterImageAdapterOptions = {}): AiImageAdapter {
  const { apiKey: rawKey, model: rawModel, outputFormat, resolution, siteUrl, appTitle, baseURL, extraBody, ...transport } = options
  const apiKey = clean(rawKey)
  const model = clean(rawModel) ?? OPENROUTER_IMAGE_DEFAULT_MODEL
  const base = (baseURL ?? OPENROUTER_IMAGES_BASE_URL).trim().replace(/\/+$/, '')
  const site = clean(siteUrl)
  const title = appTitle ?? 'Payload Website Builder'
  const keyHint = 'Set OPENROUTER_API_KEY in the server environment (.env) and restart the server. Create a key at https://openrouter.ai/keys.'
  const context = { label: 'OpenRouter', model, keyHint }
  const doFetch = transport.fetch ?? fetch

  // The model's parameters, read once. A failed read is retried on the next call.
  let params: Promise<ModelParams> | null = null
  const modelParams = (): Promise<ModelParams> => {
    params ??= doFetch(`${base}/images/models`, { signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = (await response.json()) as unknown
        const list = isPlainObject(body) && Array.isArray(body.data) ? body.data : []
        const entry = list.find((m) => isPlainObject(m) && m.id === model)
        // An unknown model id: send the request anyway and let the API name the problem.
        return entry ? paramsOf(entry) : UNKNOWN
      })
      .catch(() => {
        params = null
        return UNKNOWN
      })
    return params
  }

  return {
    name: 'openrouter',
    label: 'OpenRouter',
    model,
    ready: Boolean(apiKey),
    setupProblem: apiKey ? null : `No OpenRouter API key for image generation. ${keyHint}`,
    keyEnv: 'OPENROUTER_API_KEY',
    keyUrl: 'https://openrouter.ai/keys',
    async generate(request): Promise<AiImageResult> {
      if (!apiKey) throw new AiImageError('auth', `No OpenRouter API key. ${keyHint}`)
      const supported = await modelParams()
      const has = (name: string) => supported.params === null || supported.params.has(name)
      const aspectRatio = supported.aspectRatios?.length ? closestRatio(request.aspectRatio, supported.aspectRatios) : request.aspectRatio
      const n = Math.max(1, Math.min(request.n, supported.maxN ?? request.n))
      const body: Record<string, unknown> = {
        model,
        prompt: request.prompt,
        ...(has('n') ? { n } : {}),
        ...(has('aspect_ratio') ? { aspect_ratio: aspectRatio } : {}),
        ...(outputFormat && has('output_format') ? { output_format: outputFormat } : {}),
        ...(resolution && has('resolution') ? { resolution } : {}),
        ...extraBody,
      }
      const response = await postImageRequest({
        ...transport,
        url: `${base}/images`,
        headers: {
          Authorization: bearer(apiKey),
          ...(site ? { 'HTTP-Referer': site } : {}),
          'X-Title': title,
          'X-OpenRouter-Title': title,
          ...transport.headers,
        },
        body,
        signal: request.signal,
        context,
      })
      const json = await readJson(response, context)
      const items = Array.isArray(json.data) ? json.data.filter(isPlainObject) : []
      const images = []
      for (const item of items) {
        if (typeof item.b64_json === 'string' && item.b64_json) {
          const decoded = decodeImageData(item.b64_json)
          images.push(toGeneratedImage(decoded.data, typeof item.media_type === 'string' ? item.media_type : decoded.mimeType))
        } else if (typeof item.url === 'string' && item.url) {
          const decoded = item.url.startsWith('data:') ? decodeImageData(item.url) : await downloadImage(item.url, { fetch: doFetch, signal: request.signal })
          images.push(toGeneratedImage(decoded.data, decoded.mimeType))
        }
      }
      if (images.length === 0) throw new AiImageError('no_image', `${model} returned no image. Try another prompt.`)
      const revised = items.find((item) => typeof item.revised_prompt === 'string')?.revised_prompt
      const usage = usageOf(json.usage)
      return { images, ...(typeof revised === 'string' ? { revisedPrompt: revised } : {}), ...(usage ? { usage } : {}) }
    },
  }
}

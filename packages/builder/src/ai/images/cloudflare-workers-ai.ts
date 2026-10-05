// Cloudflare Workers AI image models as an AiImageAdapter, through the REST endpoint
//   POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
// Request and response differ per model family:
// - FLUX.2 (`@cf/black-forest-labs/flux-2-*`): multipart form (prompt, width, height) -> JSON { result: { image: base64 } }
// - FLUX.1 schnell: JSON { prompt, steps } (no size: 1024x1024) -> JSON { result: { image } }
// - others (Leonardo, Stable Diffusion): JSON { prompt, width, height } -> JSON { result: { image } } or the raw image bytes
// The adapter reads whichever comes back (JSON or image bytes).
//
//   import { cloudflareWorkersAIImageAdapter } from '@payload-toolkit/builder/ai/images/cloudflare-workers-ai'
//   ai: {
//     images: cloudflareWorkersAIImageAdapter({
//       accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
//       apiToken: process.env.CLOUDFLARE_API_TOKEN,
//     }),
//   }

import { isPlainObject } from '../../core/tree'
import { bearer } from '../openai-format'
import type { AiImageAdapter, AiImageResult } from '../types'
import { AiImageError, clean, decodeImageData, postImageRequest, sizeForRatio, toGeneratedImage, type ImageTransportOptions } from './shared'

/** About 0.1 US cent per 1280x720 image (October 2026). */
export const WORKERS_AI_IMAGE_DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b'
export const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4'

export type CloudflareWorkersAIImageAdapterOptions = ImageTransportOptions & {
  /** Cloudflare account id. */
  accountId?: string | null
  /** A Cloudflare API token with the Workers AI permission. */
  apiToken?: string | null
  /** A Workers AI text-to-image model. Default "@cf/black-forest-labs/flux-2-klein-4b". */
  model?: string | null
  /** The long edge in pixels for models that take a size. Default 1280 (FLUX.2 allows up to 1920). */
  longEdge?: number
  /** Route the requests through this AI Gateway (`cf-aig-gateway-id`). */
  gatewayId?: string | null
  /** Extra input fields, e.g. `{ steps: 8 }` or `{ guidance: 4 }`. */
  extraInput?: Record<string, unknown>
}

type Family = 'multipart' | 'schnell' | 'json'

function familyOf(model: string): Family {
  if (/\/flux-2-/.test(model)) return 'multipart'
  if (model.endsWith('/flux-1-schnell')) return 'schnell'
  return 'json'
}

export function cloudflareWorkersAIImageAdapter(options: CloudflareWorkersAIImageAdapterOptions = {}): AiImageAdapter {
  const { accountId: rawAccount, apiToken: rawToken, model: rawModel, longEdge = 1280, gatewayId: rawGateway, extraInput, ...transport } = options
  const accountId = clean(rawAccount)
  const token = clean(rawToken)
  const gatewayId = clean(rawGateway)
  const model = clean(rawModel) ?? WORKERS_AI_IMAGE_DEFAULT_MODEL
  const family = familyOf(model)
  const keyHint = 'Set CLOUDFLARE_API_TOKEN (an API token with the Workers AI permission) in .env and restart the server.'
  const context = { label: 'Cloudflare Workers AI', model, keyHint }
  let setupProblem: string | null = null
  if (!accountId) setupProblem = 'Set the Cloudflare account id (CLOUDFLARE_ACCOUNT_ID in .env) for image generation.'
  else if (!token) setupProblem = `No Cloudflare API token for image generation. ${keyHint}`

  return {
    name: 'cloudflare-workers-ai',
    label: 'Cloudflare Workers AI',
    model,
    ready: setupProblem === null,
    setupProblem,
    keyEnv: 'CLOUDFLARE_API_TOKEN',
    keyUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    async generate(request): Promise<AiImageResult> {
      if (setupProblem) throw new AiImageError('auth', setupProblem)
      const { width, height } = sizeForRatio(request.aspectRatio, longEdge, 16)
      let body: Record<string, unknown> | FormData
      if (family === 'multipart') {
        const form = new FormData()
        form.set('prompt', request.prompt)
        form.set('width', String(width))
        form.set('height', String(height))
        for (const [key, value] of Object.entries(extraInput ?? {})) form.set(key, String(value))
        body = form
      } else if (family === 'schnell') {
        body = { prompt: request.prompt, ...extraInput }
      } else {
        body = { prompt: request.prompt, width, height, ...extraInput }
      }
      const url = `${CLOUDFLARE_API_URL}/accounts/${encodeURIComponent(accountId ?? '')}/ai/run/${model}`
      const headers = { Authorization: bearer(token ?? ''), ...(gatewayId ? { 'cf-aig-gateway-id': gatewayId } : {}), ...transport.headers }
      // One image per call: Workers AI models return one.
      const images = []
      for (let i = 0; i < Math.max(1, request.n); i++) {
        const response = await postImageRequest({ ...transport, url, headers, body, signal: request.signal, context })
        const type = response.headers.get('content-type') ?? ''
        if (type.startsWith('image/')) {
          images.push(toGeneratedImage(new Uint8Array(await response.arrayBuffer()), type.split(';')[0]))
          continue
        }
        const text = await response.text()
        let json: unknown = null
        try {
          json = JSON.parse(text)
        } catch {
          throw new AiImageError('api_error', `Cloudflare Workers AI returned a response that is neither JSON nor an image: ${text.slice(0, 200)}`)
        }
        const result = isPlainObject(json) ? json.result : null
        const image = isPlainObject(result) ? result.image : null
        if (typeof image !== 'string' || !image) {
          const errors = isPlainObject(json) && Array.isArray(json.errors) ? json.errors : []
          const message = isPlainObject(errors[0]) && typeof errors[0].message === 'string' ? `: ${errors[0].message}` : ''
          throw new AiImageError('no_image', `${model} returned no image${message}.`)
        }
        const decoded = decodeImageData(image)
        images.push(toGeneratedImage(decoded.data, decoded.mimeType))
      }
      return { images }
    },
  }
}

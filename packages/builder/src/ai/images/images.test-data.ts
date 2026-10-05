// Recorded response shapes of the image APIs, for the adapter tests. Image data is replaced by a
// tiny PNG; everything else is as the APIs returned it (October 2026).

import { gradientPng } from './fake'

/** A 4x3 PNG. */
export const TINY_PNG = new Uint8Array(gradientPng(4, 3, 'fixture'))
export const TINY_PNG_BASE64 = Buffer.from(TINY_PNG).toString('base64')

/** GET https://openrouter.ai/api/v1/images/models (two entries of 57, trimmed). */
export const OPENROUTER_IMAGE_MODELS = {
  data: [
    {
      id: 'black-forest-labs/flux.2-klein-4b',
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
      supports_streaming: false,
      supported_parameters: {
        aspect_ratio: { type: 'enum', values: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9', 'auto'] },
        output_format: { type: 'enum', values: ['png', 'jpeg'] },
        n: { type: 'range', min: 1, max: 1 },
        input_references: { type: 'range', min: 0, max: 4 },
        seed: { type: 'boolean' },
      },
    },
    {
      id: 'recraft/recraft-v4.1-flash',
      architecture: { input_modalities: ['text'], output_modalities: ['image'] },
      supports_streaming: false,
      supported_parameters: {
        aspect_ratio: { type: 'enum', values: ['1:1', '4:3', '3:4', '16:9', '9:16', 'auto'] },
        n: { type: 'range', min: 1, max: 6 },
      },
    },
  ],
}

/** POST https://openrouter.ai/api/v1/images (the image data replaced). */
export function openRouterImagesResponse(b64 = TINY_PNG_BASE64) {
  return {
    created: 1791234567,
    data: [{ b64_json: b64, media_type: 'image/png' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0.015 },
  }
}

/** POST https://api.openai.com/v1/images/generations (gpt-image models return base64 only). */
export function openAIImagesResponse(b64 = TINY_PNG_BASE64) {
  return {
    created: 1791234567,
    data: [{ b64_json: b64 }],
    usage: { total_tokens: 1100, input_tokens: 40, output_tokens: 1060, input_tokens_details: { text_tokens: 40, image_tokens: 0 } },
  }
}

/** POST https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/@cf/black-forest-labs/flux-2-klein-4b */
export function cloudflareImageResponse(b64 = TINY_PNG_BASE64) {
  return { result: { image: b64 }, success: true, errors: [], messages: [] }
}

export type FakeCall = { url: string; init: RequestInit }

/** A fetch that answers by URL and records every call. `answer` returns a Response or an error to throw. */
export function fakeFetch(answer: (url: string, init: RequestInit, index: number) => Response | Error) {
  const calls: FakeCall[] = []
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    const result = answer(url, init, calls.length - 1)
    if (result instanceof Error) throw result
    return result
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

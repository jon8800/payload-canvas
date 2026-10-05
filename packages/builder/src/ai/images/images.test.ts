import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CLOUDFLARE_API_URL, cloudflareWorkersAIImageAdapter, WORKERS_AI_IMAGE_DEFAULT_MODEL } from './cloudflare-workers-ai'
import { fakeImageAdapter, gradientPng } from './fake'
import {
  cloudflareImageResponse,
  fakeFetch,
  json,
  OPENROUTER_IMAGE_MODELS,
  openAIImagesResponse,
  openRouterImagesResponse,
  TINY_PNG,
  TINY_PNG_BASE64,
} from './images.test-data'
import { openAIImageAdapter, openAIImageSize } from './openai'
import { OPENROUTER_IMAGE_DEFAULT_MODEL, openRouterImageAdapter } from './openrouter'
import { AiImageError, closestRatio, decodeImageData, imageSize, sizeForRatio, sniffImageType } from './shared'

const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, unknown>
const headersOf = (init: RequestInit) => new Headers(init.headers)

async function rejects(promise: Promise<unknown>, code: string, message: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AiImageError, `expected AiImageError, got ${String(error)}`)
    assert.equal(error.code, code)
    assert.match(error.message, message)
    return true
  })
}

describe('image helpers', () => {
  it('picks the closest ratio and sizes it', () => {
    assert.equal(closestRatio('21:9', ['1:1', '16:9', '9:16']), '16:9')
    assert.equal(closestRatio('3:4', ['1:1', '3:2', '2:3']), '2:3')
    assert.equal(closestRatio('1:1', ['4:3', '3:4', '1:1']), '1:1')
    assert.deepEqual(sizeForRatio('16:9', 1280, 16), { width: 1280, height: 720 })
    assert.deepEqual(sizeForRatio('9:16', 1280, 16), { width: 720, height: 1280 })
    assert.deepEqual(sizeForRatio('1:1', 1024), { width: 1024, height: 1024 })
  })

  it('decodes base64 and data URLs and reads PNG and JPEG headers', () => {
    assert.deepEqual(decodeImageData(TINY_PNG_BASE64).data, TINY_PNG)
    const fromUrl = decodeImageData(`data:image/png;base64,${TINY_PNG_BASE64}`)
    assert.equal(fromUrl.mimeType, 'image/png')
    assert.deepEqual(fromUrl.data, TINY_PNG)
    assert.equal(sniffImageType(TINY_PNG), 'image/png')
    assert.deepEqual(imageSize(TINY_PNG), { width: 4, height: 3 })
    // A minimal JPEG: SOI, an APP0 segment, then SOF0 with height 300 and width 400.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x03, 0, 0, 0, 0])
    assert.equal(sniffImageType(jpeg), 'image/jpeg')
    assert.deepEqual(imageSize(jpeg), { width: 400, height: 300 })
    assert.equal(sniffImageType(new Uint8Array([1, 2, 3, 4])), null)
  })
})

/** OpenRouter: the model list, then the image. */
const answer = (url: string) => (url.endsWith('/images/models') ? json(OPENROUTER_IMAGE_MODELS) : json(openRouterImagesResponse()))

/** OpenRouter: the model list, then an error. */
const errorFetch = (status: number, message: string) =>
  fakeFetch((url) => (url.endsWith('/images/models') ? json(OPENROUTER_IMAGE_MODELS) : json({ error: { code: status, message } }, status))).fetch

describe('openRouterImageAdapter', () => {

  it('is not ready without a key and never calls the API', async () => {
    const { fetch, calls } = fakeFetch(answer)
    const adapter = openRouterImageAdapter({ apiKey: '  ', fetch })
    assert.equal(adapter.ready, false)
    assert.match(String(adapter.setupProblem), /OPENROUTER_API_KEY/)
    await rejects(adapter.generate({ prompt: 'x', aspectRatio: '1:1', n: 1 }), 'auth', /OPENROUTER_API_KEY/)
    assert.equal(calls.length, 0)
  })

  it('posts to /images with the ratio the model supports and reads the image and the cost', async () => {
    const { fetch, calls } = fakeFetch(answer)
    const adapter = openRouterImageAdapter({ apiKey: 'sk-or-1', model: 'recraft/recraft-v4.1-flash', siteUrl: 'https://example.com', fetch })
    assert.equal(adapter.ready, true)
    const result = await adapter.generate({ prompt: 'Coffee beans', aspectRatio: '21:9', n: 1 })
    assert.equal(calls.length, 2)
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/images/models')
    assert.equal(calls[1].url, 'https://openrouter.ai/api/v1/images')
    const headers = headersOf(calls[1].init)
    assert.equal(headers.get('authorization'), 'Bearer sk-or-1')
    assert.equal(headers.get('http-referer'), 'https://example.com')
    // recraft has no 21:9: the closest supported ratio goes out.
    assert.deepEqual(bodyOf(calls[1].init), { model: 'recraft/recraft-v4.1-flash', prompt: 'Coffee beans', n: 1, aspect_ratio: '16:9' })
    assert.equal(result.images.length, 1)
    assert.equal(result.images[0].mimeType, 'image/png')
    assert.deepEqual(result.images[0].data, TINY_PNG)
    assert.equal(result.images[0].width, 4)
    assert.equal(result.usage?.cost, 0.015)
    // The model list is read once.
    await adapter.generate({ prompt: 'Again', aspectRatio: '1:1', n: 1 })
    assert.equal(calls.filter((c) => c.url.endsWith('/images/models')).length, 1)
  })

  it('sends only parameters the model has, and the default model', async () => {
    const { fetch, calls } = fakeFetch(answer)
    const adapter = openRouterImageAdapter({ apiKey: 'k', outputFormat: 'webp', resolution: '2K', fetch })
    assert.equal(adapter.model, OPENROUTER_IMAGE_DEFAULT_MODEL)
    await adapter.generate({ prompt: 'p', aspectRatio: '9:16', n: 3 })
    // flux.2-klein-4b: n is capped at 1, output_format exists, resolution does not.
    assert.deepEqual(bodyOf(calls[1].init), { model: OPENROUTER_IMAGE_DEFAULT_MODEL, prompt: 'p', n: 1, aspect_ratio: '9:16', output_format: 'webp' })
  })

  it('still generates when the model list cannot be read', async () => {
    const { fetch, calls } = fakeFetch((url) => (url.endsWith('/images/models') ? new Error('offline') : json(openRouterImagesResponse())))
    const adapter = openRouterImageAdapter({ apiKey: 'k', fetch })
    const result = await adapter.generate({ prompt: 'p', aspectRatio: '4:3', n: 1 })
    assert.equal(result.images.length, 1)
    assert.equal(bodyOf(calls[1].init).aspect_ratio, '4:3')
  })

  it('maps API errors to readable messages', async () => {
    await rejects(openRouterImageAdapter({ apiKey: 'k', fetch: errorFetch(401, 'User not found.') }).generate({ prompt: 'p', aspectRatio: '1:1', n: 1 }), 'auth', /rejected the API key \(401\): User not found/)
    await rejects(openRouterImageAdapter({ apiKey: 'k', fetch: errorFetch(402, 'Insufficient credits') }).generate({ prompt: 'p', aspectRatio: '1:1', n: 1 }), 'api_error', /no credits left/)
    await rejects(openRouterImageAdapter({ apiKey: 'k', fetch: errorFetch(400, 'Prompt flagged') }).generate({ prompt: 'p', aspectRatio: '1:1', n: 1 }), 'invalid_request', /Prompt flagged/)
  })

  it('retries a 502 once, then succeeds', async () => {
    let posts = 0
    const { fetch } = fakeFetch((url) => {
      if (url.endsWith('/images/models')) return json(OPENROUTER_IMAGE_MODELS)
      posts++
      return posts === 1 ? json({ error: { message: 'Provider failed' } }, 502) : json(openRouterImagesResponse())
    })
    const result = await openRouterImageAdapter({ apiKey: 'k', fetch, retryDelayMs: 1 }).generate({ prompt: 'p', aspectRatio: '1:1', n: 1 })
    assert.equal(posts, 2)
    assert.equal(result.images.length, 1)
  })

  it('reports a response without an image', async () => {
    const { fetch } = fakeFetch((url) => (url.endsWith('/images/models') ? json(OPENROUTER_IMAGE_MODELS) : json({ data: [], usage: { cost: 0 } })))
    await rejects(openRouterImageAdapter({ apiKey: 'k', fetch }).generate({ prompt: 'p', aspectRatio: '1:1', n: 1 }), 'no_image', /returned no image/)
  })

  it('cancels with the signal', async () => {
    const controller = new AbortController()
    const { fetch } = fakeFetch((url) => {
      if (url.endsWith('/images/models')) return json(OPENROUTER_IMAGE_MODELS)
      controller.abort()
      const error = new Error('aborted')
      error.name = 'AbortError'
      return error
    })
    await rejects(openRouterImageAdapter({ apiKey: 'k', fetch }).generate({ prompt: 'p', aspectRatio: '1:1', n: 1, signal: controller.signal }), 'aborted', /cancelled/)
  })
})

describe('openAIImageAdapter', () => {
  it('maps ratios to sizes per model generation', () => {
    assert.equal(openAIImageSize('gpt-image-1-mini', '16:9'), '1536x1024')
    assert.equal(openAIImageSize('gpt-image-1', '9:16'), '1024x1536')
    assert.equal(openAIImageSize('gpt-image-1', '1:1'), '1024x1024')
    assert.equal(openAIImageSize('gpt-image-2.5-flare', '16:9'), '1536x864')
    assert.equal(openAIImageSize('gpt-image-2', '3:4'), '1152x1536')
  })

  it('posts to /images/generations and reads base64 images and token usage', async () => {
    const { fetch, calls } = fakeFetch(() => json(openAIImagesResponse()))
    const adapter = openAIImageAdapter({ apiKey: 'sk-1', quality: 'low', fetch })
    assert.equal(adapter.label, 'OpenAI')
    const result = await adapter.generate({ prompt: 'Coffee', aspectRatio: '16:9', n: 1 })
    assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations')
    assert.equal(headersOf(calls[0].init).get('authorization'), 'Bearer sk-1')
    assert.deepEqual(bodyOf(calls[0].init), { model: 'gpt-image-2.5-flare', prompt: 'Coffee', n: 1, size: '1536x864', quality: 'low' })
    assert.deepEqual(result.images[0].data, TINY_PNG)
    assert.deepEqual(result.usage, { inputTokens: 40, outputTokens: 1060 })
  })

  it('downloads URL results from compatible servers and keeps revised prompts', async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.endsWith('/images/generations')
        ? json({ data: [{ url: 'http://localhost:9999/out/1.png', revised_prompt: 'A photo of coffee' }] })
        : new Response(TINY_PNG, { headers: { 'content-type': 'image/png' } }),
    )
    const adapter = openAIImageAdapter({ baseURL: 'http://localhost:9999/v1', model: 'sdxl', fetch, size: () => null })
    assert.equal(adapter.ready, true, 'a local server needs no key')
    assert.equal(adapter.label, 'localhost:9999')
    const result = await adapter.generate({ prompt: 'Coffee', aspectRatio: '1:1', n: 1 })
    assert.equal(calls[1].url, 'http://localhost:9999/out/1.png')
    assert.equal(bodyOf(calls[0].init).size, undefined)
    assert.equal(result.revisedPrompt, 'A photo of coffee')
    assert.equal(result.images[0].width, 4)
  })

  it('needs a key for OpenAI itself', () => {
    const adapter = openAIImageAdapter({})
    assert.equal(adapter.ready, false)
    assert.match(String(adapter.setupProblem), /OPENAI_API_KEY/)
  })
})

describe('cloudflareWorkersAIImageAdapter', () => {
  it('sends FLUX.2 models a multipart form with the size, and reads result.image', async () => {
    const { fetch, calls } = fakeFetch(() => json(cloudflareImageResponse()))
    const adapter = cloudflareWorkersAIImageAdapter({ accountId: 'acc', apiToken: 'tok', fetch })
    assert.equal(adapter.model, WORKERS_AI_IMAGE_DEFAULT_MODEL)
    const result = await adapter.generate({ prompt: 'Coffee', aspectRatio: '16:9', n: 1 })
    assert.equal(calls[0].url, `${CLOUDFLARE_API_URL}/accounts/acc/ai/run/@cf/black-forest-labs/flux-2-klein-4b`)
    assert.equal(headersOf(calls[0].init).get('authorization'), 'Bearer tok')
    assert.equal(headersOf(calls[0].init).get('content-type'), null, 'fetch sets the multipart boundary')
    const form = calls[0].init.body as FormData
    assert.ok(form instanceof FormData)
    assert.equal(form.get('prompt'), 'Coffee')
    assert.equal(form.get('width'), '1280')
    assert.equal(form.get('height'), '720')
    assert.deepEqual(result.images[0].data, TINY_PNG)
  })

  it('sends FLUX.1 schnell only the prompt, and other models JSON with the size', async () => {
    const { fetch, calls } = fakeFetch(() => json(cloudflareImageResponse()))
    await cloudflareWorkersAIImageAdapter({ accountId: 'a', apiToken: 't', model: '@cf/black-forest-labs/flux-1-schnell', fetch }).generate({ prompt: 'P', aspectRatio: '16:9', n: 1 })
    assert.deepEqual(bodyOf(calls[0].init), { prompt: 'P' })
    await cloudflareWorkersAIImageAdapter({ accountId: 'a', apiToken: 't', model: '@cf/leonardo/lucid-origin', longEdge: 1024, fetch }).generate({ prompt: 'P', aspectRatio: '3:4', n: 1 })
    assert.deepEqual(bodyOf(calls[1].init), { prompt: 'P', width: 768, height: 1024 })
  })

  it('reads raw image bytes (Stable Diffusion, Phoenix)', async () => {
    const { fetch } = fakeFetch(() => new Response(TINY_PNG, { headers: { 'content-type': 'image/png' } }))
    const result = await cloudflareWorkersAIImageAdapter({ accountId: 'a', apiToken: 't', model: '@cf/bytedance/stable-diffusion-xl-lightning', fetch }).generate({ prompt: 'P', aspectRatio: '1:1', n: 1 })
    assert.equal(result.images[0].mimeType, 'image/png')
    assert.deepEqual(result.images[0].data, TINY_PNG)
  })

  it('reports Cloudflare errors and missing settings', async () => {
    const { fetch } = fakeFetch(() => json({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, 401))
    await rejects(cloudflareWorkersAIImageAdapter({ accountId: 'a', apiToken: 't', fetch }).generate({ prompt: 'P', aspectRatio: '1:1', n: 1 }), 'auth', /Authentication error/)
    assert.match(String(cloudflareWorkersAIImageAdapter({ apiToken: 't' }).setupProblem), /CLOUDFLARE_ACCOUNT_ID/)
    assert.match(String(cloudflareWorkersAIImageAdapter({ accountId: 'a' }).setupProblem), /CLOUDFLARE_API_TOKEN/)
  })
})

describe('fakeImageAdapter', () => {
  it('draws a valid PNG in the asked ratio', async () => {
    const seen: string[] = []
    const result = await fakeImageAdapter({ onRequest: (r) => seen.push(r.prompt), costPerImage: 0.01 }).generate({ prompt: 'Beans', aspectRatio: '16:9', n: 2 })
    assert.deepEqual(seen, ['Beans'])
    assert.equal(result.images.length, 2)
    const [first] = result.images
    assert.equal(sniffImageType(first.data), 'image/png')
    assert.deepEqual(imageSize(first.data), { width: 640, height: 360 })
    assert.deepEqual({ width: first.width, height: first.height }, { width: 640, height: 360 })
    assert.equal(result.usage?.cost, 0.02)
    assert.notDeepEqual(gradientPng(8, 8, 'a'), gradientPng(8, 8, 'b'), 'colors follow the prompt')
  })

  it('fails or cancels on request', async () => {
    await rejects(fakeImageAdapter({ fail: new AiImageError('api_error', 'Boom') }).generate({ prompt: 'x', aspectRatio: '1:1', n: 1 }), 'api_error', /Boom/)
    const controller = new AbortController()
    const pending = fakeImageAdapter({ delayMs: 1000 }).generate({ prompt: 'x', aspectRatio: '1:1', n: 1, signal: controller.signal })
    controller.abort()
    await rejects(pending, 'aborted', /cancelled/)
  })
})

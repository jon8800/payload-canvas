// Shared code of the image adapters: errors, aspect ratios, image bytes, and one HTTP call with
// timeout and retries. Server only (uses Buffer).

import { isPlainObject } from '../../core/tree'
import { httpError, OpenAiApiError, retryable, sleep } from '../openai-format'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Why an image call failed:
 * - auth: the key was rejected. - aborted: the caller cancelled. - rate_limit: 429 from the provider.
 * - no_image: the model answered without an image (e.g. it refused). - invalid_request: bad input.
 * - api_error: anything else.
 */
export type AiImageErrorCode = 'auth' | 'aborted' | 'rate_limit' | 'no_image' | 'invalid_request' | 'api_error'

/** An image adapter failure with a message for the editor. */
export class AiImageError extends Error {
  readonly code: AiImageErrorCode
  constructor(code: AiImageErrorCode, message: string) {
    super(message)
    this.name = 'AiImageError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Aspect ratios
// ---------------------------------------------------------------------------

export { IMAGE_ASPECT_RATIOS, isAspectRatio } from './ratios'

/** Width divided by height, e.g. 1.777 for "16:9". Works for any "w:h" string. */
export function ratioValue(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number)
  return w > 0 && h > 0 ? w / h : 1
}

/** The supported ratio closest to `ratio` (compared on a log scale, so 2:1 and 1:2 are equally far from 1:1). */
export function closestRatio<T extends string>(ratio: string, supported: readonly T[]): T {
  const target = Math.log(ratioValue(ratio))
  let best = supported[0]
  for (const candidate of supported) {
    if (Math.abs(Math.log(ratioValue(candidate)) - target) < Math.abs(Math.log(ratioValue(best)) - target)) best = candidate
  }
  return best
}

/** Width and height for a ratio: the long edge is `longEdge`, both rounded to a multiple of `step`. */
export function sizeForRatio(ratio: string, longEdge: number, step = 16): { width: number; height: number } {
  const value = ratioValue(ratio)
  const round = (n: number) => Math.max(step, Math.round(n / step) * step)
  return value >= 1 ? { width: round(longEdge), height: round(longEdge / value) } : { width: round(longEdge * value), height: round(longEdge) }
}

// ---------------------------------------------------------------------------
// Image bytes
// ---------------------------------------------------------------------------

/** Decodes plain base64 or a `data:` URL. Returns the MIME type of the data URL when it has one. */
export function decodeImageData(value: string): { data: Uint8Array; mimeType: string | null } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value.trim())
  if (match) {
    const data = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8')
    return { data: new Uint8Array(data), mimeType: match[1] ?? null }
  }
  return { data: new Uint8Array(Buffer.from(value, 'base64')), mimeType: null }
}

/** The image type from the first bytes: PNG, JPEG, WebP or GIF. Null for anything else. */
export function sniffImageType(data: Uint8Array): string | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 4) === 'WEBP') return 'image/webp'
  if (data.length >= 6 && ascii(data, 0, 4) === 'GIF8') return 'image/gif'
  return null
}

function ascii(data: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...data.subarray(start, start + length))
}

/** Width and height from a PNG, JPEG or WebP header. Null when unknown. */
export function imageSize(data: Uint8Array): { width: number; height: number } | null {
  const type = sniffImageType(data)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (type === 'image/png' && data.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) }
  if (type === 'image/jpeg') {
    let i = 2
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null
      const marker = data[i + 1]
      const length = view.getUint16(i + 2)
      // SOF0-SOF15 hold the size, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) }
      }
      i += 2 + length
    }
    return null
  }
  if (type === 'image/webp' && data.length >= 30) {
    const chunk = ascii(data, 12, 4)
    if (chunk === 'VP8X') return { width: 1 + (data[24] | (data[25] << 8) | (data[26] << 16)), height: 1 + (data[27] | (data[28] << 8) | (data[29] << 16)) }
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
  }
  return null
}

/** An image from bytes: the sniffed type wins over the declared one, and the size is read from the header. */
export function toGeneratedImage(data: Uint8Array, declaredType?: string | null) {
  const mimeType = sniffImageType(data) ?? declaredType ?? 'image/png'
  const size = imageSize(data)
  return { data, mimeType, ...(size ? size : {}) }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/** Request options every built-in image adapter accepts. */
export type ImageTransportOptions = {
  /** Extra request headers. */
  headers?: Record<string, string>
  /** Tests: replaces fetch. */
  fetch?: typeof fetch
  /** Time to wait for the whole response. Default 120 s: image models are slow. */
  timeoutMs?: number
  /** Retries on 408, 429, 5xx and network errors. Default 1. */
  maxRetries?: number
  /** First retry delay; doubles each time. A Retry-After header wins (up to 20 s). Default 1000 ms. */
  retryDelayMs?: number
}

const DEFAULT_IMAGE_TIMEOUT_MS = 120_000

/** What an adapter's request names in its errors. */
export type ImageApiContext = { label: string; model: string; keyHint: string }

/** A readable AiImageError from an HTTP, network or timeout failure. */
export function describeImageError(error: unknown, context: ImageApiContext): AiImageError {
  if (error instanceof AiImageError) return error
  const { label, model, keyHint } = context
  if (error instanceof OpenAiApiError) {
    const detail = error.message ? `: ${error.message.trim().replace(/\.$/, '')}` : ''
    if (error.kind === 'timeout') return new AiImageError('api_error', `${label} did not answer in time${detail}. Try again.`)
    if (error.kind === 'network') return new AiImageError('api_error', `Could not reach ${label}${detail}.`)
    switch (error.status) {
      case 400:
        return new AiImageError('invalid_request', `${label} rejected the request (400)${detail}.`)
      case 401:
      case 403:
        return new AiImageError('auth', `${label} rejected the API key (${error.status})${detail}. ${keyHint}`)
      case 402:
        return new AiImageError('api_error', `${label} says the account has no credits left (402)${detail}.`)
      case 404:
        return new AiImageError('api_error', `${label} returned 404${detail}. Check the image model id "${model}".`)
      case 429:
        return new AiImageError('rate_limit', `${label} rate limit reached (429)${detail}. Wait a moment and try again.`)
    }
    return new AiImageError('api_error', `${label} returned an error${error.status ? ` (${error.status})` : ''}${detail}`)
  }
  if (error instanceof Error && error.name === 'AbortError') return new AiImageError('aborted', 'The request was cancelled.')
  return new AiImageError('api_error', error instanceof Error ? error.message : String(error))
}

/**
 * POSTs to an image API and returns the successful response. Retries 408 / 429 / 5xx and network
 * errors. Throws AiImageError with the provider's message.
 */
export async function postImageRequest(
  args: {
    url: string
    headers: Record<string, string>
    /** A JSON body (an object) or a FormData body. */
    body: Record<string, unknown> | FormData
    signal?: AbortSignal
    context: ImageApiContext
  } & ImageTransportOptions,
): Promise<Response> {
  const doFetch = args.fetch ?? fetch
  const maxRetries = args.maxRetries ?? 1
  const baseDelay = args.retryDelayMs ?? 1000
  const json = !(args.body instanceof FormData)
  const timeout = AbortSignal.timeout(args.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS)
  const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout
  for (let retry = 0; ; retry++) {
    let failure: OpenAiApiError
    try {
      const response = await doFetch(args.url, {
        method: 'POST',
        headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...args.headers },
        body: json ? JSON.stringify(args.body) : (args.body as FormData),
        signal,
      })
      if (response.ok) return response
      failure = await httpError(response)
    } catch (error) {
      if (args.signal?.aborted) throw new AiImageError('aborted', 'The request was cancelled.')
      if (timeout.aborted) failure = new OpenAiApiError('no response', { kind: 'timeout' })
      else failure = new OpenAiApiError(error instanceof Error ? error.message : String(error), { kind: 'network' })
    }
    const canRetry = failure.kind === 'network' || (failure.status !== null && retryable(failure.status))
    if (!canRetry || retry >= maxRetries) throw describeImageError(failure, args.context)
    try {
      await sleep(Math.min(20_000, failure.retryAfterMs ?? baseDelay * 2 ** retry), args.signal)
    } catch {
      throw new AiImageError('aborted', 'The request was cancelled.')
    }
  }
}

/** Reads a JSON response body. Throws AiImageError when it is not JSON. */
export async function readJson(response: Response, context: ImageApiContext): Promise<Record<string, unknown>> {
  const text = await response.text()
  try {
    const body = JSON.parse(text) as unknown
    if (isPlainObject(body)) return body
  } catch {
    // Not JSON.
  }
  throw new AiImageError('api_error', `${context.label} returned a response that is not JSON: ${text.slice(0, 200)}`)
}

/** Fetches an image URL (providers that return a link instead of the bytes). */
export async function downloadImage(url: string, options: { fetch?: typeof fetch; signal?: AbortSignal }): Promise<{ data: Uint8Array; mimeType: string | null }> {
  const response = await (options.fetch ?? fetch)(url, { signal: options.signal })
  if (!response.ok) throw new AiImageError('api_error', `Could not download the generated image (HTTP ${response.status}).`)
  return { data: new Uint8Array(await response.arrayBuffer()), mimeType: response.headers.get('content-type') }
}

/** A trimmed value, or undefined when empty. */
export const clean = (value: string | null | undefined): string | undefined => (value?.trim() ? value.trim() : undefined)

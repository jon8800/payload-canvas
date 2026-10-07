// Generates an image with the configured AiImageAdapter and saves it in an upload collection, as
// the request's user. Shared by the assistant tool, the editor's Generate action (endpoint) and the
// MCP tool, so they share one hourly limit per user, kept in Payload's KV store. Server only.

import type { KVAdapter, PayloadRequest } from 'payload'

import { isPlainObject } from '../../core/tree'
import type { AiImageAdapter, AiImageAspectRatio, AiImageLimits, AiOptions } from '../types'
import { AiImageError, IMAGE_ASPECT_RATIOS, isAspectRatio } from './shared'

/** Key under `config.custom` where the plugin stores the ImageService (the MCP tools read it). */
export const AI_IMAGES_KEY = 'websiteBuilderImages'

export const DEFAULT_IMAGES_PER_REQUEST = 3
export const DEFAULT_IMAGES_PER_HOUR = 20
const HOUR_MS = 60 * 60 * 1000
const MAX_PROMPT = 4000
const MAX_ALT = 300

/** Shown when image generation is not set up. */
export const IMAGES_NOT_CONFIGURED =
  'Image generation is not set up on this site. A developer adds an image adapter to the plugin options, for example ai: { images: openRouterImageAdapter({ apiKey: process.env.OPENROUTER_API_KEY }) } from "payload-canvas/ai/images/openrouter", and restarts the server. See docs/ai/images.md.'

/**
 * Where the hourly counts live: the part of Payload's key-value store (`payload.kv`) the limiter
 * uses. Payload's default KV adapter keeps the values in its hidden `payload-kv` collection.
 */
export type ImageCountStore = Pick<KVAdapter, 'get' | 'set' | 'delete'>

/** A store in server memory. Used when there is no `payload.kv` (unit tests). */
export function memoryCountStore(): ImageCountStore {
  const values = new Map<string, unknown>()
  return {
    get: async <T>(key: string) => (values.has(key) ? (structuredClone(values.get(key)) as T) : null),
    set: async (key, value) => void values.set(key, structuredClone(value)),
    delete: async (key) => void values.delete(key),
  }
}

/** The KV key of one user's count. */
const storeKey = (user: string) => `website-builder:image-count:${user}`

/** The stored value: when each image of the last hour was reserved (ms since 1970). */
type HourCount = { at: number[] }

/**
 * Counts generated images per user in a sliding hour. The count lives in a store (`payload.kv` by
 * default), so it survives a restart and all app servers share it. Calls for one user run one after
 * another inside one server process.
 */
export class HourlyLimiter {
  readonly perHour: number
  readonly #now: () => number
  readonly #store: ImageCountStore | null
  readonly #memory = memoryCountStore()
  readonly #queues = new Map<string, Promise<unknown>>()

  /** `store`: a fixed store. Without it each call uses the store it gets, else memory. */
  constructor(perHour: number, now: () => number = Date.now, store?: ImageCountStore) {
    this.perHour = perHour
    this.#now = now
    this.#store = store ?? null
  }

  #storeFor(kv?: ImageCountStore | null): ImageCountStore {
    return this.#store ?? kv ?? this.#memory
  }

  /** Runs `task` after the earlier tasks for the same user. */
  #serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const result = (this.#queues.get(key) ?? Promise.resolve()).then(task)
    const tail = result.catch(() => undefined)
    this.#queues.set(key, tail)
    void tail.then(() => {
      if (this.#queues.get(key) === tail) this.#queues.delete(key)
    })
    return result
  }

  async #recent(store: ImageCountStore, key: string): Promise<number[]> {
    const value = await store.get<HourCount>(storeKey(key))
    const since = this.#now() - HOUR_MS
    return (Array.isArray(value?.at) ? value.at : []).filter((t): t is number => typeof t === 'number' && t > since).toSorted((a, b) => a - b)
  }

  async #write(store: ImageCountStore, key: string, list: number[]): Promise<void> {
    if (list.length > 0) await store.set(storeKey(key), { at: list } satisfies HourCount)
    else await store.delete(storeKey(key))
  }

  async remaining(key: string, kv?: ImageCountStore | null): Promise<number> {
    return Math.max(0, this.perHour - (await this.#recent(this.#storeFor(kv), key)).length)
  }

  /** Minutes until the oldest image of the hour drops out. */
  async minutesUntilFree(key: string, kv?: ImageCountStore | null): Promise<number> {
    const oldest = (await this.#recent(this.#storeFor(kv), key))[0]
    return oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest + HOUR_MS - this.#now()) / 60_000))
  }

  /** Reserves one image. Returns the reservation, or null when the user is at the limit. */
  take(key: string, kv?: ImageCountStore | null): Promise<number | null> {
    const store = this.#storeFor(kv)
    return this.#serial(key, async () => {
      const list = await this.#recent(store, key)
      if (list.length >= this.perHour) return null
      const at = this.#now()
      await this.#write(store, key, [...list, at])
      return at
    })
  }

  /** Gives back a reservation (the generation failed). */
  release(key: string, reservation: number, kv?: ImageCountStore | null): Promise<void> {
    const store = this.#storeFor(kv)
    return this.#serial(key, async () => {
      const list = await this.#recent(store, key)
      const index = list.lastIndexOf(reservation)
      if (index === -1) return
      list.splice(index, 1)
      await this.#write(store, key, list)
    })
  }
}

/** The image settings the plugin resolved from `ai`. */
export type ImageService = {
  adapter: AiImageAdapter | null
  /** Default upload collection. */
  collection: string
  perRequest: number
  limiter: HourlyLimiter
  /** Field name for the "generated by" note, or false. */
  markerField: string | false
}

const positive = (value: number | undefined, fallback: number) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback)

/**
 * `store`: where the hourly counts live. Default: the request's `payload.kv`.
 * `now`: the clock, for tests.
 */
export function createImageService(
  ai: Pick<AiOptions, 'images' | 'imageLimits' | 'mediaCollection' | 'imageMarkerField'>,
  { now, store }: { now?: () => number; store?: ImageCountStore } = {},
): ImageService {
  const limits: AiImageLimits = ai.imageLimits ?? {}
  return {
    adapter: ai.images ?? null,
    collection: ai.mediaCollection ?? 'media',
    perRequest: positive(limits.perRequest, DEFAULT_IMAGES_PER_REQUEST),
    limiter: new HourlyLimiter(positive(limits.perHour, DEFAULT_IMAGES_PER_HOUR), now, store),
    markerField: ai.imageMarkerField === undefined ? 'generatedBy' : ai.imageMarkerField,
  }
}

/** The plugin's ImageService, or null when the plugin has no `ai` option. */
export function imageServiceOf(payload: { config: { custom?: Record<string, unknown> } }): ImageService | null {
  return (payload.config.custom?.[AI_IMAGES_KEY] as ImageService | undefined) ?? null
}

/** A setup problem, or null when the service can generate. */
export function imagesSetupProblem(service: ImageService | null): string | null {
  const adapter = service?.adapter
  if (!adapter) return IMAGES_NOT_CONFIGURED
  if (!adapter.ready) return `${adapter.setupProblem?.trim() || `${adapter.label} image generation is not set up.`} See docs/ai/images.md.`
  return null
}

/** One saved image, as the tools and the editor see it. */
export type GeneratedMedia = {
  id: string | number
  collection: string
  alt: string | null
  filename: string | null
  url: string | null
  thumbnailUrl: string | null
  mimeType: string | null
  width: number | null
  height: number | null
  filesize: number | null
}

export type GenerateImageInput = {
  prompt: unknown
  aspectRatio?: unknown
  alt?: unknown
  /** Upload collection. Default: the service's collection. */
  collection?: unknown
  signal?: AbortSignal
  /** Who asked, for the server log. */
  source: 'assistant' | 'editor' | 'mcp'
}

export type GenerateImageErrorCode = 'not_configured' | 'forbidden' | 'rate_limited' | 'invalid_request' | 'api_error' | 'aborted'

export type GenerateImageOutcome =
  | {
      ok: true
      media: GeneratedMedia
      adapter: string
      model: string
      aspectRatio: AiImageAspectRatio
      /** Time the image model took, in seconds. */
      seconds: number
      /** USD, when the provider reports it. */
      cost?: number
      revisedPrompt?: string
      /** Images the user may still generate this hour. */
      remainingThisHour: number
    }
  | { ok: false; code: GenerateImageErrorCode; status: number; message: string }

const failure = (code: GenerateImageErrorCode, status: number, message: string): GenerateImageOutcome => ({ ok: false, code, status, message })

type UploadConfig = {
  upload?: unknown
  fields: Array<{ name?: string; type?: string }>
  access?: { create?: (args: { req: PayloadRequest; data?: unknown }) => unknown }
}

const str = (value: unknown) => (typeof value === 'string' && value ? value : null)
const num = (value: unknown) => (typeof value === 'number' ? value : null)

/** The alt text: the given one, else the prompt's first sentence (short). */
export function altFromPrompt(prompt: string): string {
  const first = prompt.split(/(?<=[.!?])\s/)[0].trim()
  return first.length <= 120 ? first.replace(/[.!?]$/, '') : `${first.slice(0, 117).replace(/\s+\S*$/, '')}…`
}

/** "ai-fresh-coffee-beans-k3x9qa.png" */
export function generatedFilename(prompt: string, mimeType: string): string {
  const slug = prompt
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mimeType] ?? 'png'
  return `ai-${slug || 'image'}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

function acceptsImages(upload: unknown): boolean {
  if (!isPlainObject(upload)) return true
  const types = upload.mimeTypes
  if (!Array.isArray(types) || types.length === 0) return true
  return types.some((t) => typeof t === 'string' && (t === '*' || t === '*/*' || t.startsWith('image/')))
}

/** The user's key for the hourly limit. */
function userKey(req: PayloadRequest): string {
  const user = req.user as { collection?: unknown; id?: unknown } | null
  return `${String(user?.collection ?? 'users')}:${String(user?.id ?? 'anonymous')}`
}

/**
 * Generates one image and saves it in the upload collection as the request's user
 * (`overrideAccess: false`). Never throws.
 */
export async function generateImageToMedia(req: PayloadRequest, service: ImageService | null, input: GenerateImageInput): Promise<GenerateImageOutcome> {
  const problem = imagesSetupProblem(service)
  if (problem || !service?.adapter) return failure('not_configured', 501, problem ?? IMAGES_NOT_CONFIGURED)
  const adapter = service.adapter
  if (!req.user) return failure('forbidden', 401, 'Sign in to generate images.')

  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (prompt.length < 3) return failure('invalid_request', 400, 'Describe the image in the prompt (at least a few words).')
  if (prompt.length > MAX_PROMPT) return failure('invalid_request', 400, `The prompt is too long (more than ${MAX_PROMPT} characters).`)
  if (input.aspectRatio !== undefined && input.aspectRatio !== null && !isAspectRatio(input.aspectRatio)) {
    return failure('invalid_request', 400, `Unknown aspect ratio "${String(input.aspectRatio)}". Use one of: ${IMAGE_ASPECT_RATIOS.join(', ')}.`)
  }
  const aspectRatio: AiImageAspectRatio = isAspectRatio(input.aspectRatio) ? input.aspectRatio : '1:1'
  const altInput = typeof input.alt === 'string' ? input.alt.trim().slice(0, MAX_ALT) : ''

  const slug = typeof input.collection === 'string' && input.collection ? input.collection : service.collection
  const config = (req.payload.collections as Record<string, { config: UploadConfig } | undefined>)[slug]?.config
  if (!config) return failure('invalid_request', 400, `The collection "${slug}" does not exist.`)
  if (!config.upload) return failure('invalid_request', 400, `"${slug}" is not an upload collection.`)
  if (!acceptsImages(config.upload)) return failure('invalid_request', 400, `"${slug}" does not accept images (upload.mimeTypes).`)

  // Check create access before the paid call. Payload checks it again on create.
  const has = (name: string) => config.fields.some((f) => f.name === name)
  const altField = has('alt')
  const alt = altInput || altFromPrompt(prompt)
  const marker = service.markerField ? config.fields.find((f) => f.name === service.markerField && ['text', 'textarea', 'json'].includes(f.type ?? '')) : undefined
  const data: Record<string, unknown> = altField ? { alt } : {}
  if (marker?.name) {
    const note = { adapter: adapter.name, model: adapter.model, prompt, aspectRatio, source: input.source, at: new Date().toISOString() }
    data[marker.name] = marker.type === 'json' ? note : `AI image (${adapter.label}, ${adapter.model}, ${note.at.slice(0, 10)}): ${prompt}`
  }
  try {
    const access = config.access?.create
    const allowed = access ? await access({ req, data }) : Boolean(req.user)
    if (!allowed) return failure('forbidden', 403, `You may not upload to "${slug}", so you cannot generate images there.`)
  } catch {
    return failure('forbidden', 403, `You may not upload to "${slug}", so you cannot generate images there.`)
  }

  const key = userKey(req)
  const limiter = service.limiter
  const kv = (req.payload as { kv?: ImageCountStore }).kv ?? null
  if (limiter.perHour === 0) return failure('rate_limited', 429, 'Image generation is turned off on this site (ai.imageLimits.perHour is 0).')
  let reservation: number | null
  try {
    reservation = await limiter.take(key, kv)
  } catch (error) {
    req.payload.logger.error({ err: error }, 'website builder: could not read the hourly image count')
    return failure('api_error', 503, 'Could not check the hourly image limit, so no image was generated. Try again in a moment.')
  }
  if (reservation === null) {
    const minutes = await limiter.minutesUntilFree(key, kv).catch(() => 60)
    return failure(
      'rate_limited',
      429,
      `You reached the limit of ${limiter.perHour} generated images per hour. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    )
  }

  const taken = reservation
  /** Failed attempts do not count. */
  const giveBack = () =>
    limiter.release(key, taken, kv).catch((error: unknown) => req.payload.logger.error({ err: error }, 'website builder: could not give back an image reservation'))

  const started = Date.now()
  let result
  try {
    result = await adapter.generate({ prompt, aspectRatio, n: 1, signal: input.signal })
  } catch (error) {
    await giveBack()
    if (error instanceof AiImageError) {
      if (error.code === 'aborted') return failure('aborted', 499, error.message)
      if (error.code === 'invalid_request' || error.code === 'no_image') return failure('invalid_request', 400, error.message)
      if (error.code === 'rate_limit') return failure('rate_limited', 429, error.message)
      return failure('api_error', 502, error.message)
    }
    if (input.signal?.aborted) return failure('aborted', 499, 'The request was cancelled.')
    return failure('api_error', 502, error instanceof Error ? error.message : String(error))
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10
  const image = result.images[0]
  if (!image || image.data.length === 0) {
    await giveBack()
    return failure('invalid_request', 400, `${adapter.model} returned no image. Try another prompt.`)
  }
  const cost = result.usage?.cost

  let doc: Record<string, unknown>
  try {
    doc = (await req.payload.create({
      collection: slug as never,
      data: data as never,
      file: {
        data: Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength),
        mimetype: image.mimeType,
        name: generatedFilename(prompt, image.mimeType),
        size: image.data.byteLength,
      },
      overrideAccess: false,
      user: req.user,
      req,
    })) as unknown as Record<string, unknown>
  } catch (error) {
    // The image was made and paid for, so it counts: a broken media collection must not turn the
    // hourly limit off.
    const message = error instanceof Error ? error.message : String(error)
    return failure('api_error', 500, `The image was generated but could not be saved in "${slug}": ${message}`)
  }

  const sizes = isPlainObject(doc.sizes) ? doc.sizes : {}
  const thumbnail = isPlainObject(sizes.thumbnail) ? str(sizes.thumbnail.url) : null
  const media: GeneratedMedia = {
    id: doc.id as string | number,
    collection: slug,
    alt: altField ? (str(doc.alt) ?? alt) : null,
    filename: str(doc.filename),
    url: str(doc.url),
    thumbnailUrl: thumbnail,
    mimeType: str(doc.mimeType) ?? image.mimeType,
    width: num(doc.width) ?? image.width ?? null,
    height: num(doc.height) ?? image.height ?? null,
    filesize: num(doc.filesize) ?? image.data.byteLength,
  }
  req.payload.logger.info(
    { adapter: adapter.name, model: adapter.model, seconds, cost, media: media.id, source: input.source },
    'website builder: generated an AI image',
  )
  const remainingThisHour = await limiter.remaining(key, kv).catch(() => 0)
  return {
    ok: true,
    media,
    adapter: adapter.name,
    model: adapter.model,
    aspectRatio,
    seconds,
    ...(cost !== undefined ? { cost } : {}),
    ...(result.revisedPrompt ? { revisedPrompt: result.revisedPrompt } : {}),
    remainingThisHour,
  }
}

// The "AI settings" global: an admin pastes API keys for the assistant and image generation
// without a deploy. Server only.
//
// - A key there wins over the key in the adapter options (env). Not set: the options' key.
// - Keys are stored encrypted (./secret.ts). Reads through REST and the Local API never return
//   them: the global's afterRead hook removes them and adds `keyStatus` ("set, ends in …4f2a").
//   The global has no GraphQL schema.
// - The endpoints read and decrypt the key at request time (`keyFor`), straight from the database
//   adapter, so a new key works on the next request without a restart.
// - The DB schema stays the same for any adapter: two text columns, `chatApiKey` and
//   `imageApiKey`. The admin shows the ones the configured adapters use.

import { ValidationError, type GlobalAfterReadHook, type GlobalBeforeChangeHook, type GlobalConfig, type Payload, type PayloadRequest } from 'payload'

import { adapterReady, aiClientConfig, type AiRequestState } from '../config'
import type { AiAdapter, AiClientConfig, AiImageAdapter, AiModelEvent, AiOptions, AiSettingsOptions } from '../types'
import { isSealed, openSecret, sealSecret } from './secret'
import { KEY_STATUS_FIELD, type AiKeyFieldCustom, type AiKeyFieldName, type AiKeyStatus, type AiKeyUse } from './shared'

export { isSealed, openSecret, sealSecret } from './secret'
export { KEY_STATUS_FIELD, type AiKeyFieldCustom, type AiKeyFieldName, type AiKeyStatus, type AiKeyUse } from './shared'

/** Default slug of the AI settings global. */
export const DEFAULT_AI_SETTINGS_SLUG = 'builder-ai-settings'
/** Key under `config.custom` where the plugin stores the AiSettingsRuntime. */
export const AI_SETTINGS_KEY = 'websiteBuilderAiSettings'
const KEY_FIELD_COMPONENT = 'payload-canvas/client#AiKeyField'
/** Longest key the settings accept. */
const MAX_KEY_LENGTH = 2000

/** One key field and the adapters that use it. */
export type AiKeySlot = {
  name: AiKeyFieldName
  label: string
  uses: AiKeyUse[]
  /** The env var of the code key, e.g. "OPENROUTER_API_KEY". */
  keyEnv: string | null
  keyUrl: string | null
  /** The adapter options have no key either: without a key here the adapter does not work. */
  missingKey: boolean
}

/** Default access to the settings: a signed-in user of the admin user collection. */
export function defaultAiSettingsAccess({ req }: { req: PayloadRequest }): boolean {
  const user = req.user as { collection?: unknown } | null | undefined
  if (!user) return false
  const adminUser = req.payload?.config?.admin?.user
  return !adminUser || !user.collection || user.collection === adminUser
}

const acceptsKey = <T extends AiAdapter | AiImageAdapter>(adapter: T | null | undefined): T | null => (adapter?.acceptsApiKey ? adapter : null)

/**
 * The key fields in use. When the chat and image adapters read the same env var (for example both
 * use OPENROUTER_API_KEY), they share one field: `chatApiKey`.
 */
export function aiKeySlots(ai: AiOptions): AiKeySlot[] {
  const chat = acceptsKey(ai.adapter)
  const images = acceptsKey(ai.images)
  const shared = Boolean(chat && images && chat.keyEnv && chat.keyEnv === images.keyEnv)
  const slots: AiKeySlot[] = []
  if (chat) {
    slots.push({
      name: 'chatApiKey',
      label: shared ? `${chat.label} API key` : `${chat.label} API key (assistant)`,
      uses: shared ? ['chat', 'images'] : ['chat'],
      keyEnv: chat.keyEnv ?? null,
      keyUrl: chat.keyUrl ?? null,
      missingKey: Boolean(chat.missingKey) || (shared && Boolean(images?.missingKey)),
    })
  }
  if (images && !shared) {
    slots.push({
      name: 'imageApiKey',
      label: `${images.label} API key (images)`,
      uses: ['images'],
      keyEnv: images.keyEnv ?? null,
      keyUrl: images.keyUrl ?? null,
      missingKey: Boolean(images.missingKey),
    })
  }
  return slots
}

const ALL_FIELDS: AiKeyFieldName[] = ['chatApiKey', 'imageApiKey']

/** The status of one stored value. */
export function keyStatusOf(stored: unknown, secret: string): AiKeyStatus {
  if (typeof stored !== 'string' || !stored) return { state: 'unset' }
  const key = openSecret(stored, secret)
  if (key === null) return { state: 'unreadable' }
  return { state: 'set', last4: key.length >= 12 ? key.slice(-4) : null }
}

/**
 * What to store for one field. A non-empty string replaces the key, `null` clears it, anything
 * else (left out, empty) keeps the stored value. Throws a readable message for a bad key.
 */
export function nextStoredKey(incoming: unknown, stored: unknown, secret: string): string | null {
  const keep = typeof stored === 'string' && stored ? stored : null
  if (incoming === null) return null
  if (typeof incoming !== 'string' || !incoming.trim()) return keep
  const value = incoming.trim()
  // A value that is already encrypted with this secret (a copy of the raw row) stays as it is.
  if (isSealed(value) && openSecret(value, secret) !== null) return value
  if (value.length > MAX_KEY_LENGTH) throw new Error(`The API key is too long (more than ${MAX_KEY_LENGTH} characters).`)
  // Spaces and control characters would break the request header.
  if (/\s/.test(value) || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new Error('An API key has no spaces or line breaks. Paste only the key.')
  return sealSecret(value, secret)
}

/** Encrypts new keys, keeps the others. Runs on every write (admin, REST, Local API). */
const writeKeys: GlobalBeforeChangeHook = ({ data, originalDoc, req, global }) => {
  const next: Record<string, unknown> = { ...data }
  delete next[KEY_STATUS_FIELD]
  const errors: { path: string; message: string }[] = []
  for (const name of ALL_FIELDS) {
    try {
      next[name] = nextStoredKey(data?.[name], (originalDoc as Record<string, unknown> | undefined)?.[name], req.payload.secret)
    } catch (error) {
      errors.push({ path: name, message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (errors.length > 0) throw new ValidationError({ global: global.slug, errors, req })
  return next
}

/** Removes the stored keys from every read and adds their status. */
const hideKeys: GlobalAfterReadHook = ({ doc, req }) => {
  const out: Record<string, unknown> = { ...doc }
  const status: Partial<Record<AiKeyFieldName, AiKeyStatus>> = {}
  for (const name of ALL_FIELDS) {
    status[name] = keyStatusOf(out[name], req.payload.secret)
    delete out[name]
  }
  out[KEY_STATUS_FIELD] = status
  return out
}

function slotDescription(slot: AiKeySlot): string {
  const what = slot.uses.length === 2 ? 'the AI assistant and image generation' : slot.uses[0] === 'chat' ? 'the AI assistant' : 'image generation'
  const env = slot.keyEnv ? ` It wins over ${slot.keyEnv} in the server environment.` : ''
  return `Used for ${what}.${env} Saved encrypted. Nobody can read it back here.`
}

/** The AI settings global. Both key fields always exist; the unused one is hidden. */
export function aiSettingsGlobal(ai: AiOptions, options: AiSettingsOptions = {}): GlobalConfig {
  const slug = options.slug ?? DEFAULT_AI_SETTINGS_SLUG
  const access = options.access ?? defaultAiSettingsAccess
  const slots = aiKeySlots(ai)
  const field = (name: AiKeyFieldName, fallbackLabel: string): GlobalConfig['fields'][number] => {
    const slot = slots.find((s) => s.name === name)
    return {
      name,
      type: 'text',
      label: slot?.label ?? fallbackLabel,
      admin: {
        hidden: !slot,
        description: slot ? slotDescription(slot) : undefined,
        components: { Field: KEY_FIELD_COMPONENT },
        custom: {
          aiKey: { keyEnv: slot?.keyEnv ?? null, keyUrl: slot?.keyUrl ?? null, missingKey: slot?.missingKey ?? false, uses: slot?.uses ?? [] } satisfies AiKeyFieldCustom,
        },
      },
    }
  }
  return {
    slug,
    label: 'AI settings',
    // Keys never go through GraphQL.
    graphQL: false,
    access: { read: access, update: access },
    admin: {
      description:
        slots.length > 0
          ? 'API keys for the AI features. A key set here wins over the key in the server environment.'
          : 'The configured AI adapters take no API key from here.',
    },
    hooks: { beforeChange: [writeKeys], afterRead: [hideKeys] },
    fields: [
      field('chatApiKey', 'Assistant API key'),
      field('imageApiKey', 'Image API key'),
      { name: KEY_STATUS_FIELD, type: 'json', virtual: true, admin: { hidden: true, readOnly: true } },
    ],
  }
}

/** The decrypted key of one field. Undefined when none is stored, or it does not decrypt (logged). */
function decrypt(payload: Payload, row: Record<string, unknown> | null, slot: AiKeySlot | null): string | undefined {
  if (!slot) return undefined
  const stored = row?.[slot.name]
  if (typeof stored !== 'string' || !stored) return undefined
  const key = openSecret(stored, payload.secret)
  if (key === null) {
    payload.logger.warn(
      `website builder: the ${slot.label} in the AI settings cannot be decrypted (the Payload secret changed, or the value is damaged). It counts as not set. Paste the key again.`,
    )
    return undefined
  }
  return key
}

/** The AI settings at runtime, for the endpoints, the image service and the builder view. */
export type AiSettingsRuntime = {
  slug: string
  slots: AiKeySlot[]
  /** The admin's key for one use, decrypted. Undefined when none is set or it does not decrypt (logged). */
  keyFor(payload: Payload, use: AiKeyUse): Promise<string | undefined>
  /** The settings page in the admin, or null when this user may not open it. */
  urlFor(req: PayloadRequest): Promise<string | null>
  /** `AiClientConfig` with the readiness of this moment (keys in the settings count). */
  clientConfig(req: PayloadRequest): Promise<AiClientConfig>
}

/** The runtime of the AI settings global. `endpoint`: the AI endpoint prefix, e.g. "/api/builder/ai". */
export function aiSettingsRuntime(ai: AiOptions, options: AiSettingsOptions, endpoint: string): AiSettingsRuntime {
  const slug = options.slug ?? DEFAULT_AI_SETTINGS_SLUG
  const access = options.access ?? defaultAiSettingsAccess
  const slots = aiKeySlots(ai)
  const slotFor = (use: AiKeyUse) => slots.find((slot) => slot.uses.includes(use)) ?? null

  const readRow = async (payload: Payload): Promise<Record<string, unknown> | null> => {
    try {
      // The database adapter: no hooks, so the encrypted values are there.
      return ((await payload.db.findGlobal({ slug })) as Record<string, unknown> | null | undefined) ?? null
    } catch (error) {
      payload.logger.warn({ err: error }, `website builder: could not read the AI settings ("${slug}"). Using the keys from the server environment.`)
      return null
    }
  }

  const keyFor: AiSettingsRuntime['keyFor'] = async (payload, use) => {
    const slot = slotFor(use)
    if (!slot) return undefined
    return decrypt(payload, await readRow(payload), slot)
  }

  const urlFor: AiSettingsRuntime['urlFor'] = async (req) => {
    if (slots.length === 0 || !req.user) return null
    let allowed = false
    try {
      allowed = Boolean(await access({ req }))
    } catch {
      allowed = false
    }
    if (!allowed) return null
    const admin = req.payload.config.routes?.admin ?? '/admin'
    return `${admin === '/' ? '' : admin}/globals/${encodeURIComponent(slug)}`
  }

  return {
    slug,
    slots,
    keyFor,
    urlFor,
    async clientConfig(req) {
      const row = slots.length > 0 ? await readRow(req.payload) : null
      const state: AiRequestState = {
        keys: { chat: Boolean(decrypt(req.payload, row, slotFor('chat'))), images: Boolean(decrypt(req.payload, row, slotFor('images'))) },
        settingsUrl: await urlFor(req),
      }
      return aiClientConfig(ai, endpoint, state)
    },
  }
}

/** The plugin's AI settings runtime, or null when settings are off. */
export function aiSettingsOf(payload: { config: { custom?: Record<string, unknown> } }): AiSettingsRuntime | null {
  return (payload.config.custom?.[AI_SETTINGS_KEY] as AiSettingsRuntime | undefined) ?? null
}

/**
 * The chat adapter for one request: it gets the key from the settings (when there is one), and an
 * auth error says that the settings can take a key. Readiness follows the key.
 */
export function withSettingsKey(adapter: AiAdapter, key: string | undefined, hint: string | null): AiAdapter {
  const useKey = Boolean(key && adapter.acceptsApiKey)
  const addHint = Boolean(hint && adapter.acceptsApiKey && !useKey)
  if (!useKey && !addHint) return adapter
  return {
    name: adapter.name,
    label: adapter.label,
    model: adapter.model,
    ready: adapterReady(adapter, useKey ? key : undefined),
    setupProblem: adapter.setupProblem,
    keyEnv: adapter.keyEnv,
    keyUrl: adapter.keyUrl,
    acceptsApiKey: adapter.acceptsApiKey,
    missingKey: adapter.missingKey,
    async *stream(request): AsyncIterable<AiModelEvent> {
      for await (const event of adapter.stream(useKey ? { ...request, apiKey: key } : request)) {
        yield addHint && event.type === 'error' && event.code === 'auth' ? { ...event, message: `${event.message} ${hint}` } : event
      }
    },
  }
}

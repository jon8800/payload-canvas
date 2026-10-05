// The assistant's chat endpoint:
//   POST {api}/builder/ai/chat   AiChatRequest -> text/event-stream of AiStreamEvent
// The user must be signed in and allowed to update the document. The assistant edits the layout
// sent in the body (the editor's current state), never the database.

import { addDataAndFileToRequest, docAccessOperation, type Endpoint, type PayloadRequest, type Where } from 'payload'

import { TEMPLATE_TARGET_FIELD } from '../core/bindings'
import { knownLocale } from '../core/locale'
import { indexLayout, isPlainObject, normalizeLayout } from '../core/tree'
import type { BindingField, BlockDefinition, Layout, LocaleSettings, SectionDefinition, StyleTokens, TemplateContext } from '../core/types'
import { SSE_HEADERS, sseFrame } from '../live/endpoints'
import { loadSavedSections } from '../plugin/sections'
import { missingAdapterProblem } from './config'
import { adapterIdentity, runAgent } from './loop'
import { breakpointsPx, contextText, systemPrompt } from './prompt'
import { toolDefinitions, Workspace, type MediaItem, type ToolEnv } from './tools'
import type { AiChatRequest, AiMessage, AiOptions, AiStreamEvent, AiSystemPart } from './types'

/** Path of the assistant endpoints below the API route. */
export const AI_PATH = '/builder/ai'

const DEFAULT_MAX_STEPS = 12
const MAX_MESSAGES = 400
const HEARTBEAT_MS = 15_000

export type AiEndpointOptions = {
  ai: AiOptions
  /** Builder collections and their layout field names. */
  collections: Record<string, { field: string; localization?: LocaleSettings | null }>
  blocks: BlockDefinition[]
  sections: SectionDefinition[]
  /** Theme tokens for the system prompt (colors, fonts, breakpoints). Null when unavailable. */
  getTokens: () => Promise<StyleTokens | null>
  /** The templates collection and the bindable fields. Null when no collection uses templates. */
  templates: { slug: string; sources: Record<string, BindingField[]> } | null
  /** The saved sections collection. Each request loads the ones the user can read. Null or left out: off. */
  savedSections?: { slug: string } | null
  /** Tests: replaces the update-access check (default: Payload's docAccessOperation). */
  canUpdate?: (req: PayloadRequest, collection: string, id: string | number, field: string) => Promise<boolean>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(status: number, code: Extract<AiStreamEvent, { type: 'error' }>['code'], message: string): Response {
  return new Response(sseFrame('error', { type: 'error', code, message }), { status, headers: SSE_HEADERS })
}

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : 500
}

/** Checks the body. Returns the request or an error message. */
export function parseChatRequest(body: unknown): AiChatRequest | string {
  if (!isPlainObject(body)) return 'The body must be a JSON object'
  const { collection, id, messages, layout, selectedId, context, canvasWidth, locale } = body
  if (typeof collection !== 'string' || !collection) return '`collection` must be a string'
  if (!(typeof id === 'string' && id) && typeof id !== 'number') return '`id` must be a string or a number'
  if (!Array.isArray(messages) || messages.length === 0) return '`messages` must be a non-empty array'
  if (messages.length > MAX_MESSAGES) return `\`messages\` is too long (more than ${MAX_MESSAGES}). Start a new conversation.`
  for (const [i, message] of messages.entries()) {
    if (!isPlainObject(message) || (message.role !== 'user' && message.role !== 'assistant')) {
      return `messages[${i}].role must be "user" or "assistant"`
    }
    const content = message.content
    if (!(typeof content === 'string' && content) && !(Array.isArray(content) && content.length > 0 && content.every(isPlainObject))) {
      return `messages[${i}].content must be a non-empty string or an array of content blocks`
    }
  }
  if (messages[0].role !== 'user') return 'The first message must be a user message'
  const last = messages.at(-1) as Record<string, unknown>
  if (last.role !== 'user' || last.kind) return 'The last message must be the new user message'
  if (!isPlainObject(layout)) return '`layout` must be an object'
  if (selectedId !== undefined && selectedId !== null && typeof selectedId !== 'string') return '`selectedId` must be a string or null'
  if (context !== undefined && context !== null) {
    if (!isPlainObject(context) || typeof context.collection !== 'string' || !isPlainObject(context.doc)) {
      return '`context` must be { collection, doc } or null'
    }
  }
  if (canvasWidth !== undefined && canvasWidth !== null && (typeof canvasWidth !== 'number' || !Number.isFinite(canvasWidth))) {
    return '`canvasWidth` must be a number or null'
  }
  if (locale !== undefined && locale !== null && typeof locale !== 'string') return '`locale` must be a locale code or null'
  return {
    collection,
    id: id as string | number,
    messages: messages.map((m) => {
      const message = m as Record<string, unknown>
      const kind = message.kind === 'context' || message.kind === 'tool_results' ? message.kind : undefined
      const provider = typeof message.provider === 'string' && message.provider ? message.provider : undefined
      return { role: message.role as AiMessage['role'], content: message.content, ...(kind ? { kind } : {}), ...(provider ? { provider } : {}) }
    }),
    layout: layout as Layout,
    selectedId: (selectedId as string | null | undefined) ?? null,
    context: (context as TemplateContext | null | undefined) ?? null,
    canvasWidth: (canvasWidth as number | null | undefined) ?? null,
    locale: typeof locale === 'string' && locale ? locale : null,
  }
}

/** Ids and types from the root to a block, e.g. ["section b_1", "heading b_2"]. */
function pathOf(layout: Layout, id: string): string[] {
  const index = indexLayout(layout)
  const path: string[] = []
  let current = index.get(id)
  while (current) {
    path.unshift(`${current.block.type} ${current.block.id}${current.slot !== 'children' ? ` (slot "${current.slot}")` : ''}`)
    current = current.parentId ? index.get(current.parentId) : undefined
  }
  return path
}

/** Update permission from Payload's sanitized permissions (true, or { update: true | { permission } }). */
export function allowsUpdate(permissions: unknown, field: string): boolean {
  if (permissions === true) return true
  if (!isPlainObject(permissions)) return false
  const update = permissions.update
  const collectionOk = update === true || (isPlainObject(update) && update.permission === true)
  if (!collectionOk) return false
  // Field-level access: only an explicit field entry without update denies.
  const fields = permissions.fields
  if (!isPlainObject(fields)) return true
  const own = fields[field]
  if (own === undefined || own === true) return true
  if (!isPlainObject(own)) return false
  const fieldUpdate = own.update
  return fieldUpdate === true || (isPlainObject(fieldUpdate) && fieldUpdate.permission === true)
}

async function defaultCanUpdate(req: PayloadRequest, collection: string, id: string | number, field: string): Promise<boolean> {
  const target = (req.payload.collections as Record<string, Parameters<typeof docAccessOperation>[0]['collection'] | undefined>)[collection]
  if (!target) return false
  const permissions = await docAccessOperation({ collection: target, id, req })
  return allowsUpdate(permissions, field)
}

type MediaConfig = { fields: Array<{ name?: string; type?: string }> }

/** Field types a `like` query works on. Rich text and JSON (e.g. a rich text `caption`) are left out. */
const TEXT_FIELD_TYPES = new Set(['text', 'textarea', 'email'])

const str = (value: unknown) => (typeof value === 'string' && value ? value : null)
const num = (value: unknown) => (typeof value === 'number' ? value : null)

/** Searches an upload collection as the request's user. Images only when the collection has `mimeType`. */
export function mediaSearch(req: PayloadRequest, slug: string) {
  return async (query: string, limit: number): Promise<MediaItem[]> => {
    const config = (req.payload.collections as Record<string, { config: MediaConfig } | undefined>)[slug]?.config
    if (!config) throw new Error(`The media collection "${slug}" does not exist`)
    const has = (name: string) => config.fields.some((f) => f.name === name)
    const isText = (name: string) => config.fields.some((f) => f.name === name && TEXT_FIELD_TYPES.has(f.type ?? ''))
    const and: Where[] = []
    if (has('mimeType')) and.push({ mimeType: { contains: 'image' } })
    const searchable = ['alt', 'filename', 'title', 'caption'].filter(isText)
    if (query && searchable.length > 0) and.push({ or: searchable.map((name) => ({ [name]: { like: query } })) })
    const result = await req.payload.find({
      collection: slug as never,
      where: and.length > 0 ? { and } : {},
      limit,
      depth: 0,
      sort: '-createdAt',
      overrideAccess: false,
      user: req.user,
      req,
    })
    return (result.docs as Record<string, unknown>[]).map((doc) => ({
      id: doc.id as string | number,
      alt: str(doc.alt),
      filename: str(doc.filename),
      url: str(doc.url),
      width: num(doc.width),
      height: num(doc.height),
    }))
  }
}

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------

export function aiEndpoints(options: AiEndpointOptions): Endpoint[] {
  const { ai, collections, blocks, sections, templates } = options
  const savedSections = options.savedSections ?? null
  const adapter = ai.adapter ?? null
  const identity = adapter ? adapterIdentity(adapter) : null
  const env: Omit<ToolEnv, 'searchMedia'> = {
    blocks,
    sections,
    savedSections: savedSections !== null,
    bindingSources: templates?.sources ?? null,
  }
  // Built once, in a fixed order: tools and system prompt are the cached prompt prefix.
  const tools = toolDefinitions({ ...env, searchMedia: async () => [] })

  // The system prompt is built once (the theme is read once) and reused byte for byte.
  let prompt: Promise<{ system: AiSystemPart[]; breakpoints: Array<{ name: string; px: number }> }> | null = null
  const getPrompt = () => {
    prompt ??= options
      .getTokens()
      .catch(() => null)
      .then((tokens) => ({
        system: [
          {
            text: systemPrompt({
              blocks,
              sections,
              tokens,
              bindings: Boolean(templates),
              instructions: ai.instructions,
              savedSections: savedSections !== null,
            }),
            cache: true,
          },
        ],
        breakpoints: breakpointsPx(tokens),
      }))
    return prompt
  }

  const chat: Endpoint = {
    path: `${AI_PATH}/chat`,
    method: 'post',
    handler: async (req) => {
      if (!req.user) return errorResponse(401, 'forbidden', 'Sign in to use the assistant.')
      if (!adapter || !identity) return errorResponse(500, 'no_api_key', missingAdapterProblem(ai))
      if (req.data === undefined) {
        try {
          await addDataAndFileToRequest(req)
        } catch {
          return errorResponse(400, 'invalid_request', 'The body must be JSON.')
        }
      }
      const body = parseChatRequest(req.data)
      if (typeof body === 'string') return errorResponse(400, 'invalid_request', body)
      const target = collections[body.collection]
      if (!target) return errorResponse(404, 'invalid_request', `"${body.collection}" is not a builder collection.`)

      // Read and update access, as the user.
      const configs = req.payload.collections as Record<string, { config: { versions?: { drafts?: unknown }; admin?: { useAsTitle?: string } } } | undefined>
      const config = configs[body.collection]?.config
      let doc: Record<string, unknown>
      try {
        doc = (await req.payload.findByID({
          collection: body.collection as never,
          id: body.id,
          depth: 0,
          draft: Boolean(config?.versions?.drafts),
          overrideAccess: false,
          user: req.user,
          req,
        })) as Record<string, unknown>
      } catch (error) {
        const status = statusOf(error)
        return status === 403
          ? errorResponse(403, 'forbidden', 'You cannot read this document.')
          : errorResponse(404, 'invalid_request', 'Document not found.')
      }
      let allowed = false
      try {
        allowed = await (options.canUpdate ?? defaultCanUpdate)(req, body.collection, body.id, target.field)
      } catch {
        allowed = false
      }
      if (!allowed) return errorResponse(403, 'forbidden', 'You cannot edit this document, so the assistant cannot either.')

      // History from another adapter or model cannot be replayed (different message formats).
      const foreign = body.messages.find((m) => m.provider && m.provider !== identity)
      if (foreign) {
        return errorResponse(
          409,
          'invalid_request',
          `This chat was started with another AI model (${foreign.provider}). The assistant now uses ${identity}. Start a new chat.`,
        )
      }
      const { system, breakpoints } = await getPrompt()

      const layout = normalizeLayout(body.layout)
      // Localized layouts: the assistant reads and writes the editor's locale.
      const localization = target.localization ?? null
      const locale = localization ? knownLocale(localization, body.locale) : null
      const workspace = new Workspace(layout, blocks, { localization, locale })
      const selectedId = body.selectedId && indexLayout(layout).has(body.selectedId) ? body.selectedId : null
      const titleField = config?.admin?.useAsTitle
      const title = titleField && typeof doc[titleField] === 'string' ? (doc[titleField] as string) : undefined
      // Saved sections differ per user and change often: they go in the context, not the cached prompt.
      const saved = savedSections ? await loadSavedSections(req, savedSections.slug) : []
      const isTemplate = templates !== null && body.collection === templates.slug
      const templateTarget = isTemplate
        ? (typeof doc[TEMPLATE_TARGET_FIELD] === 'string' ? (doc[TEMPLATE_TARGET_FIELD] as string) : (body.context?.collection ?? null))
        : null
      const context: AiMessage = {
        role: 'user',
        kind: 'context',
        content: [
          {
            type: 'text',
            text: contextText({
              collection: body.collection,
              id: body.id,
              title,
              layout: workspace.view,
              locale: localization && locale ? { settings: localization, locale, untranslated: workspace.untranslatedCount() } : null,
              selectedId: body.selectedId,
              selectedPath: selectedId ? pathOf(layout, selectedId) : undefined,
              canvasWidth: body.canvasWidth,
              breakpoints,
              templateTarget,
              sample: isTemplate ? body.context : null,
              savedSections: saved,
            }),
          },
        ],
      }

      const controller = new AbortController()
      const requestSignal = (req as { signal?: AbortSignal }).signal
      const onAbort = () => controller.abort()
      if (requestSignal?.aborted) controller.abort()
      requestSignal?.addEventListener('abort', onAbort, { once: true })

      const encoder = new TextEncoder()
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const stream = new ReadableStream<Uint8Array>({
        start: async (out) => {
          let open = true
          const write = (chunk: string) => {
            if (!open) return
            try {
              out.enqueue(encoder.encode(chunk))
            } catch {
              open = false
            }
          }
          heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS)
          try {
            await runAgent({
              adapter,
              system,
              tools,
              effort: ai.effort,
              maxSteps: ai.maxSteps ?? DEFAULT_MAX_STEPS,
              messages: body.messages,
              context,
              workspace,
              env: { ...env, sections: [...sections, ...saved], searchMedia: mediaSearch(req, ai.mediaCollection ?? 'media') },
              emit: (event) => write(sseFrame(event.type, event)),
              signal: controller.signal,
            })
          } catch (error) {
            write(sseFrame('error', { type: 'error', code: 'api_error', message: error instanceof Error ? error.message : String(error) }))
          } finally {
            clearInterval(heartbeat)
            requestSignal?.removeEventListener('abort', onAbort)
            if (open) {
              open = false
              try {
                out.close()
              } catch {
                // The client is gone.
              }
            }
          }
        },
        cancel: () => {
          clearInterval(heartbeat)
          controller.abort()
        },
      })
      return new Response(stream, { headers: SSE_HEADERS })
    },
  }

  return [chat]
}

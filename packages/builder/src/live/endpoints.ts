// Payload endpoints of the live channel (multiplayer document sessions):
//   GET  {api}/builder/live/:collection/:id/events?clientId=&seq=&session=   Server-Sent Events
//   POST {api}/builder/live/:collection/:id/commit      LiveCommitRequest -> LiveCommitResponse
//   POST {api}/builder/live/:collection/:id/awareness   LiveAwarenessRequest -> { ok }
//   POST {api}/builder/live/:collection/:id/leave       { clientId } -> { ok } (a tab closes: drop its presence now)
//   POST {api}/builder/live/:collection/:id/flush       -> LiveFlushResponse (save the session now)
//   POST {api}/builder/live/:collection/:id/operations  { ops, clientId? } -> LiveOperationsResponse
// Payload passes the handler's Response body through unbuffered, so the stream works inside
// Next's route handler. `no-transform` stops compression, `X-Accel-Buffering: no` stops nginx
// from buffering.

import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'

import type { BlockDefinition } from '../core/types'
import { actorFromUser, type LiveDocStore } from './apply'
import type { LiveRuntime } from './runtime'
import { collaboratorName, type CommitResult, type SessionTarget } from './session'
import type { LiveActor, LiveCommitResponse, LiveError, LiveFlushResponse, LiveOperationsResponse, MultiplayerEvent } from './types'

/** Path of the live endpoints below the API route. */
export const LIVE_PATH = '/builder/live'

const noop = () => {}
const HEARTBEAT_MS = 10_000
const RETRY_MS = 3_000
const CLIENT_ID = /^[\w-]{1,64}$/
const MAX_BATCH_ID = 128

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}

export type LiveEndpointOptions = {
  /** Builder collections and their layout field names. */
  collections: Record<string, { field: string }>
  blocks: BlockDefinition[]
  runtime: LiveRuntime
  /** Heartbeat interval in ms. Default 10 s. A client that stops reading is dropped after one to two intervals. */
  heartbeatMs?: number
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : 500
}

/** The session target of a builder document, or null when the collection is not a builder collection. */
export function sessionTargetOf(
  payload: { collections: unknown },
  collections: LiveEndpointOptions['collections'],
  collection: string,
  id: string,
): SessionTarget | null {
  const options = collections[collection]
  if (!options || !id) return null
  const configs = payload.collections as Record<
    string,
    { config: { versions?: { drafts?: boolean | { autosave?: unknown } } } } | undefined
  >
  const drafts = configs[collection]?.config.versions?.drafts
  return {
    collection,
    id,
    field: options.field,
    drafts: Boolean(drafts),
    autosave: typeof drafts === 'object' && Boolean(drafts.autosave),
  }
}

/** The document of a live endpoint request (`:collection/:id`), or a 404 response. */
export function targetOf(req: PayloadRequest, collections: LiveEndpointOptions['collections']): SessionTarget | Response {
  const params = (req.routeParams ?? {}) as Record<string, unknown>
  const collection = typeof params.collection === 'string' ? params.collection : ''
  const id = typeof params.id === 'string' ? params.id : ''
  return sessionTargetOf(req.payload, collections, collection, id) ?? json({ ok: false, error: `"${collection}" is not a builder collection` }, 404)
}

/** The actor of a request: people by display name, API keys as AI agents. */
export function requestActor(user: unknown): LiveActor {
  const actor = actorFromUser(user)
  return actor.type === 'user' ? { ...actor, label: collaboratorName(user) } : actor
}

async function readBody(req: PayloadRequest): Promise<Record<string, unknown> | Response> {
  try {
    await addDataAndFileToRequest(req)
  } catch {
    return json({ ok: false, error: 'The body must be JSON' }, 400)
  }
  const data = req.data
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

/** `sessionId:seq` from Last-Event-ID, else `?seq=` (with `?session=`). */
function resumePoint(req: PayloadRequest, url: URL): { seq: number; sessionId?: string } | undefined {
  const lastEventId = req.headers.get('last-event-id')
  if (lastEventId) {
    const [sessionId, raw] = lastEventId.split(':')
    const seq = Number(raw)
    if (sessionId && Number.isInteger(seq)) return { seq, sessionId }
  }
  const raw = url.searchParams.get('seq')
  if (raw === null || raw === '') return undefined
  const seq = Number(raw)
  if (!Number.isInteger(seq) || seq < 0) return undefined
  const sessionId = url.searchParams.get('session') || undefined
  return { seq, ...(sessionId ? { sessionId } : {}) }
}

export function liveEndpoints(options: LiveEndpointOptions): Endpoint[] {
  const { collections, blocks, runtime } = options
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS

  /** Shared prelude of the POST endpoints: user, target, update access, body. */
  const prepare = async (req: PayloadRequest) => {
    if (!req.user) return json({ ok: false, error: 'Unauthorized' }, 401)
    const target = targetOf(req, collections)
    if (target instanceof Response) return target
    const body = await readBody(req)
    if (body instanceof Response) return body
    return { target, body }
  }

  const commit = async (
    req: PayloadRequest,
    target: SessionTarget,
    input: { ops: unknown[]; clientId?: string; batchId?: string; baseSeq?: number },
  ): Promise<CommitResult> => {
    if (!(await runtime.canUpdate(req, target.collection, target.id))) {
      return { ok: false, status: 403, error: 'You are not allowed to edit this document', seq: runtime.sessions.peek(target.collection, target.id)?.seq ?? 0 }
    }
    return runtime.sessions.commit({
      target,
      store: req.payload as unknown as LiveDocStore,
      user: req.user,
      actor: requestActor(req.user),
      blocks,
      ...input,
    })
  }

  const events: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/events`,
    method: 'get',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' }, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      try {
        // Read access check: the same rules as reading the document in the admin.
        await req.payload.findByID({
          collection: target.collection as never,
          id: target.id,
          depth: 0,
          draft: target.drafts,
          overrideAccess: false,
          user: req.user,
          req,
        })
      } catch (error) {
        return json({ ok: false, error: 'Document not found or not readable' }, statusOf(error) === 403 ? 403 : 404)
      }
      const url = new URL(req.url ?? '', 'http://localhost')
      const requested = url.searchParams.get('clientId') ?? ''
      const clientId = CLIENT_ID.test(requested) ? requested : globalThis.crypto.randomUUID()
      const stream = sessionStream({
        heartbeatMs,
        signal: (req as { signal?: AbortSignal }).signal,
        connect: (send, close) =>
          runtime.sessions.connect({
            target,
            store: req.payload as unknown as LiveDocStore,
            clientId,
            user: req.user,
            after: resumePoint(req, url),
            send,
            close,
          }),
      })
      return new Response(stream, { headers: SSE_HEADERS })
    },
  }

  const commitEndpoint: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/commit`,
    method: 'post',
    handler: async (req) => {
      const prepared = await prepare(req)
      if (prepared instanceof Response) return prepared
      const { target, body } = prepared
      const seqNow = () => runtime.sessions.peek(target.collection, target.id)?.seq ?? 0
      const fail = (status: number, error: string) => json({ ok: false, error, seq: seqNow() } satisfies LiveCommitResponse, status)
      if (typeof body.clientId !== 'string' || !CLIENT_ID.test(body.clientId)) return fail(400, '`clientId` is required')
      if (typeof body.batchId !== 'string' || !body.batchId || body.batchId.length > MAX_BATCH_ID) {
        return fail(400, '`batchId` is required')
      }
      if (!Array.isArray(body.ops)) return fail(400, '`ops` must be an array of operations')
      if (body.baseSeq !== undefined && !Number.isInteger(body.baseSeq)) return fail(400, '`baseSeq` must be an integer')

      const result = await commit(req, target, {
        ops: body.ops,
        clientId: body.clientId,
        batchId: body.batchId,
        ...(typeof body.baseSeq === 'number' ? { baseSeq: body.baseSeq } : {}),
      })
      if (!result.ok) {
        const response: LiveCommitResponse & { errors?: LiveError[] } = {
          ok: false,
          error: result.error,
          seq: result.seq,
          ...(result.errors ? { errors: result.errors } : {}),
        }
        return json(response, result.status)
      }
      return json({ ok: true, seq: result.seq } satisfies LiveCommitResponse)
    },
  }

  const awareness: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/awareness`,
    method: 'post',
    handler: async (req) => {
      const prepared = await prepare(req)
      if (prepared instanceof Response) return prepared
      const { target, body } = prepared
      if (typeof body.clientId !== 'string') return json({ ok: false, error: '`clientId` is required' }, 400)
      const owner = requestActor(req.user).id
      const ok = runtime.sessions.awareness(target.collection, target.id, body.clientId, body.awareness, owner)
      return ok ? json({ ok: true }) : json({ ok: false, error: 'This client is not connected to the document' }, 409)
    },
  }

  // A tab that closes or reloads leaves at once (navigator.sendBeacon on pagehide), so others do
  // not see a stale copy of it until the heartbeat notices.
  const leave: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/leave`,
    method: 'post',
    handler: async (req) => {
      const prepared = await prepare(req)
      if (prepared instanceof Response) return prepared
      const { target, body } = prepared
      if (typeof body.clientId !== 'string') return json({ ok: false, error: '`clientId` is required' }, 400)
      const owner = requestActor(req.user).id
      return json({ ok: runtime.sessions.disconnect(target.collection, target.id, body.clientId, owner) })
    },
  }

  // "Retry now" after a failed save: saves the session's unsaved commits at once.
  const flush: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/flush`,
    method: 'post',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' } satisfies LiveFlushResponse, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      if (!(await runtime.canUpdate(req, target.collection, target.id))) {
        return json({ ok: false, error: 'You are not allowed to edit this document' } satisfies LiveFlushResponse, 403)
      }
      const result = await runtime.sessions.flush(target.collection, target.id)
      return json(result, result.ok ? 200 : 503)
    },
  }

  const operations: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/operations`,
    method: 'post',
    handler: async (req) => {
      const prepared = await prepare(req)
      if (prepared instanceof Response) return prepared
      const { target, body } = prepared
      if (!Array.isArray(body.ops)) return json({ ok: false, error: '`ops` must be an array of operations' }, 400)
      const clientId = typeof body.clientId === 'string' && CLIENT_ID.test(body.clientId) ? body.clientId : undefined
      const result = await commit(req, target, { ops: body.ops, ...(clientId ? { clientId } : {}) })
      if (!result.ok) {
        const response: LiveOperationsResponse = { ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) }
        return json(response, result.status)
      }
      const response: LiveOperationsResponse = {
        ok: true,
        layout: result.layout,
        ops: result.ops,
        seq: result.seq,
        ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
      }
      return json(response)
    },
  }

  return [events, commitEndpoint, awareness, leave, flush, operations]
}

// ---------------------------------------------------------------------------
// The stream
// ---------------------------------------------------------------------------

/** One SSE frame. `data` is one JSON line, so it never needs splitting. */
export function sseFrame(event: string, data: unknown, id?: string): string {
  return `${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

type StreamArgs = {
  heartbeatMs: number
  signal?: AbortSignal
  /**
   * Joins the session. Initial events arrive through `send` before it resolves. `close` ends this
   * stream (the session calls it when the same clientId connects again).
   */
  connect: (send: (event: MultiplayerEvent, id?: string) => void, close: () => void) => Promise<{ leave(): void }>
  /** Clock, for tests. */
  now?: () => number
}

/**
 * The SSE body of one connection: the session events, a heartbeat, and leave on close.
 *
 * A closed connection must leave the session quickly, but the request's abort signal does not
 * always fire behind Next. So the stream also ends when: the stream is cancelled, an enqueue
 * fails, or the reader stops reading (the previous heartbeat is still unread one interval later).
 */
export function sessionStream(args: StreamArgs): ReadableStream<Uint8Array> {
  const { heartbeatMs, signal, connect } = args
  const now = args.now ?? Date.now
  const encoder = new TextEncoder()
  let cleanup = noop
  let lastRead = now()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      let leave = noop
      const close = () => {
        if (closed) return
        closed = true
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }
      function send(text: string) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          close()
        }
      }
      const timer = setInterval(() => {
        // Nobody read the last heartbeat for a whole interval: the client is gone.
        const unread = (controller.desiredSize ?? 1) <= 0
        if (unread && now() - lastRead >= heartbeatMs) return close()
        send(': ping\n\n')
      }, heartbeatMs)
      cleanup = () => {
        clearInterval(timer)
        leave()
      }
      if (signal?.aborted) return close()
      signal?.addEventListener('abort', close, { once: true })

      send(`retry: ${RETRY_MS}\n\n`)
      try {
        const connection = await connect((event, id) => send(sseFrame(event.type, event, id)), close)
        leave = () => connection.leave()
        if (closed) connection.leave()
      } catch (error) {
        send(sseFrame('error', { type: 'error', error: error instanceof Error ? error.message : String(error) }))
        close()
      }
    },
    pull() {
      // Called whenever the reader takes a chunk (and the queue has room).
      lastRead = now()
    },
    cancel() {
      cleanup()
    },
  })
}

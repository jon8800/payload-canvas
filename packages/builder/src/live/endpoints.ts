// Payload endpoints of the live channel:
//   GET  {api}/builder/live/:collection/:id/events      Server-Sent Events (operations, presence)
//   POST {api}/builder/live/:collection/:id/operations  { ops, clientId? } -> { ok, layout, errors? }
// Payload passes the handler's Response body through unbuffered, so the stream works inside
// Next's route handler. `no-transform` stops compression, `X-Accel-Buffering: no` stops nginx
// from buffering.

import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'

import type { BlockDefinition } from '../core/types'
import { actorFromUser, applyLiveOperations, type LiveDocStore } from './apply'
import { channelKey, type BusMessage, type LiveBus, type LiveMember, type ReplayQuery } from './bus'
import type { LiveRuntime } from './runtime'
import type { LiveOperationsResponse, PresenceMember } from './types'

/** Path of the live endpoints below the API route. */
export const LIVE_PATH = '/builder/live'

const noop = () => {}
const HEARTBEAT_MS = 20_000
const RETRY_MS = 3_000
const MAX_CLIENT_ID = 64

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
  /** Heartbeat interval in ms. Default 20 s. */
  heartbeatMs?: number
}

type Target = { collection: string; id: string; field: string; drafts: boolean }

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : 500
}

function targetOf(req: PayloadRequest, collections: LiveEndpointOptions['collections']): Target | Response {
  const params = (req.routeParams ?? {}) as Record<string, unknown>
  const collection = typeof params.collection === 'string' ? params.collection : ''
  const id = typeof params.id === 'string' ? params.id : ''
  const options = collections[collection]
  if (!options || !id) return json({ ok: false, error: `"${collection}" is not a builder collection` }, 404)
  const configs = req.payload.collections as Record<string, { config: { versions?: { drafts?: unknown } } } | undefined>
  const drafts = Boolean(configs[collection]?.config.versions?.drafts)
  return { collection, id, field: options.field, drafts }
}

export function liveEndpoints(options: LiveEndpointOptions): Endpoint[] {
  const { collections, blocks, runtime } = options
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS

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
      const afterEventId = req.headers.get('last-event-id') ?? url.searchParams.get('lastEventId') ?? undefined
      const afterTime = url.searchParams.get('since') ?? undefined
      const actor = actorFromUser(req.user)
      const member: LiveMember = {
        connectionId: globalThis.crypto.randomUUID(),
        userId: actor.id,
        name: actor.label,
        type: actor.type,
      }
      const stream = eventStream({
        bus: runtime.bus,
        channel: channelKey(target.collection, target.id),
        member,
        replay: afterEventId ? { afterEventId } : afterTime ? { afterTime } : null,
        heartbeatMs,
        signal: (req as { signal?: AbortSignal }).signal,
      })
      return new Response(stream, { headers: SSE_HEADERS })
    },
  }

  const operations: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/operations`,
    method: 'post',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' }, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      try {
        await addDataAndFileToRequest(req)
      } catch {
        return json({ ok: false, error: 'The body must be JSON' }, 400)
      }
      const body = (req.data ?? {}) as { ops?: unknown; clientId?: unknown }
      if (!Array.isArray(body.ops)) return json({ ok: false, error: '`ops` must be an array of operations' }, 400)
      const clientId =
        typeof body.clientId === 'string' && body.clientId.length <= MAX_CLIENT_ID ? body.clientId : undefined

      const result = await applyLiveOperations({
        payload: req.payload as unknown as LiveDocStore,
        req,
        user: req.user,
        collection: target.collection,
        id: target.id,
        field: target.field,
        drafts: target.drafts,
        blocks,
        ops: body.ops,
        actor: actorFromUser(req.user),
        clientId,
        runtime,
      })
      if (!result.ok) {
        const response: LiveOperationsResponse = { ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) }
        return json(response, result.status)
      }
      const response: LiveOperationsResponse = {
        ok: true,
        layout: result.layout,
        ops: result.ops,
        ...(result.version ? { version: result.version } : {}),
        ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
      }
      return json(response)
    },
  }

  return [events, operations]
}

// ---------------------------------------------------------------------------
// The stream
// ---------------------------------------------------------------------------

/** One SSE frame. `data` is one JSON line, so it never needs splitting. */
export function sseFrame(event: string, data: unknown, id?: string): string {
  return `${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/** Presence for one connection: one entry per person, names only, `self` marks the viewer. */
export function presenceFor(members: LiveMember[], me: LiveMember): PresenceMember[] {
  const byUser = new Map<string, PresenceMember>()
  for (const member of members) {
    if (byUser.has(member.userId)) continue
    byUser.set(member.userId, {
      name: member.name,
      type: member.type,
      ...(member.userId === me.userId ? { self: true } : {}),
    })
  }
  return [...byUser.values()]
}

type StreamArgs = {
  bus: LiveBus
  channel: string
  member: LiveMember
  /** Events to replay first, or null for none. */
  replay: ReplayQuery | null
  heartbeatMs: number
  signal?: AbortSignal
}

/**
 * The SSE body for one connection. It subscribes before it replays, so nothing published during
 * the replay is lost, and it drops replayed events that also arrive live.
 */
export function eventStream(args: StreamArgs): ReadableStream<Uint8Array> {
  const { bus, channel, member, replay, heartbeatMs, signal } = args
  const encoder = new TextEncoder()
  let cleanup: () => void = noop

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
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
      const send = (text: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          close()
        }
      }
      const forward = (message: BusMessage) => {
        if (message.type === 'operations') send(sseFrame('operations', message, message.eventId))
        else send(sseFrame('presence', { type: 'presence', members: presenceFor(message.members, member) }))
      }

      let replaying = true
      const pending: BusMessage[] = []
      const unsubscribe = bus.subscribe(channel, (message) => {
        if (replaying) pending.push(message)
        else forward(message)
      })
      let leave: () => void = noop
      const timer = setInterval(() => send(': ping\n\n'), heartbeatMs)
      cleanup = () => {
        clearInterval(timer)
        unsubscribe()
        leave()
      }
      if (signal?.aborted) return close()
      signal?.addEventListener('abort', close, { once: true })

      leave = await bus.join(channel, member)
      if (closed) return leave()

      send(`retry: ${RETRY_MS}\n\n`)
      const head = await bus.head(channel)
      const members = presenceFor(await bus.members(channel), member)
      // Without a replay, the ready frame carries the head id, so a native reconnect resumes there.
      send(sseFrame('ready', { type: 'ready', eventId: head, members }, replay ? undefined : (head ?? undefined)))

      const seen = new Set<string>()
      if (replay) {
        const missed = await bus.replay(channel, replay)
        if (missed === null) {
          send(sseFrame('resync', { type: 'resync', reason: 'Some changes are too old to replay. Reload the document.' }))
        } else {
          for (const event of missed) {
            seen.add(event.eventId)
            forward(event)
          }
        }
      }
      replaying = false
      for (const message of pending) {
        if (message.type === 'operations' && seen.has(message.eventId)) continue
        forward(message)
      }
    },
    cancel() {
      cleanup()
    },
  })
}

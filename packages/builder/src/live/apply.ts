// The one server code path for live edits. The POST endpoint and the MCP `applyOperations` and
// `insertSection` tools all call `applyLiveOperations`, so every change reaches open editors.

import { applyOperation } from '../core/operations'
import { findBlock, findLocation, normalizeLayout } from '../core/tree'
import type { BlockDefinition, Layout, Operation } from '../core/types'
import { validateLayout, type LayoutError } from '../core/validate'
import { channelKey } from './bus'
import type { LiveRuntime } from './runtime'
import type { LiveActor, LiveOperationsEvent } from './types'

/**
 * The part of the Payload Local API this module uses. Loose on purpose: tests pass a fake, and
 * callers cast `req.payload` to it.
 */
export type LiveDocStore = {
  findByID(args: Record<string, unknown>): Promise<Record<string, unknown>>
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>
}

type Resolved = { ok: true; layout: Layout; ops: Operation[] } | { ok: false; error: string }

/**
 * Applies operations in order, all or nothing, and returns the operations to broadcast.
 * A `duplicate` regenerates child ids at random, so it is broadcast as the `insert` of the
 * finished copy: every client then gets the same ids.
 */
export function resolveOperations(layout: Layout, ops: unknown): Resolved {
  if (!Array.isArray(ops)) return { ok: false, error: 'Operations must be an array' }
  if (ops.length === 0) return { ok: false, error: 'No operations given' }
  let current = layout
  const out: Operation[] = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] as Operation
    const result = applyOperation(current, op)
    if (!result.ok) {
      const type = typeof op === 'object' && op !== null && typeof op.type === 'string' ? op.type : 'invalid'
      return { ok: false, error: `Operation ${i} (${type}): ${result.error}` }
    }
    current = result.layout
    if (op.type === 'duplicate') {
      const copy = findBlock(current, op.newId)
      const location = findLocation(current, op.newId)
      if (!copy || !location) return { ok: false, error: `Operation ${i} (duplicate): the copy is missing` }
      out.push({ type: 'insert', block: copy, to: { parentId: location.parentId, slot: location.slot, index: location.index } })
    } else {
      out.push(op)
    }
  }
  return { ok: true, layout: current, ops: out }
}

/**
 * Drafts may hold unfinished blocks: missing required props, unknown props and unknown keys are
 * warnings (the save hook treats them the same way). Everything else blocks the save.
 */
export function splitLayoutErrors(errors: LayoutError[]): { blocking: LayoutError[]; warnings: LayoutError[] } {
  const blocking = errors.filter((e) => e.code === 'invalid')
  const warnings = errors.filter((e) => e.code !== 'invalid')
  return { blocking, warnings }
}

export type ApplyLiveArgs = {
  payload: LiveDocStore
  /** The Payload request. Passed on to the Local API (transactions, hooks). */
  req?: unknown
  /** The user the change runs as. Access control applies (`overrideAccess: false`). */
  user: unknown
  collection: string
  id: string | number
  /** Name of the layout field. */
  field: string
  /** True when the collection has drafts. The change is then saved as a draft. */
  drafts: boolean
  blocks: BlockDefinition[]
  /** Operations, or a function that builds them from the current draft layout (inside the lock). */
  ops: unknown[] | ((layout: Layout) => Operation[] | string)
  actor: LiveActor
  clientId?: string
  runtime: LiveRuntime
}

export type ApplyLiveResult =
  | {
      ok: true
      layout: Layout
      /** The operations as broadcast (duplicates turned into inserts). */
      ops: Operation[]
      version?: string
      warnings: LayoutError[]
      event: LiveOperationsEvent
    }
  | { ok: false; status: number; error: string; errors?: LayoutError[] }

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : 500
}

function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  // Payload's ValidationError lists the field problems in `data.errors`.
  const details = (error as { data?: { errors?: { message?: string }[] } }).data?.errors
  const extra = details?.map((d) => d.message).filter(Boolean).join('\n')
  return extra ? `${error.message}\n${extra}` : error.message
}

function isoOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return undefined
}

/**
 * Loads the latest draft, applies the operations, validates, saves a draft (the normal save hook
 * runs, so the CSS is regenerated) and publishes the operations to open editors. Runs under the
 * per-document lock, so concurrent calls apply one after another and none is lost.
 */
export async function applyLiveOperations(args: ApplyLiveArgs): Promise<ApplyLiveResult> {
  const { payload, req, user, collection, id, field, drafts, blocks, actor, clientId, runtime } = args
  const channel = channelKey(collection, id)

  return runtime.mutex.run(channel, async (): Promise<ApplyLiveResult> => {
    let doc: Record<string, unknown>
    try {
      doc = await payload.findByID({ collection, id, depth: 0, draft: drafts, overrideAccess: false, user, req })
    } catch (error) {
      return { ok: false, status: statusOf(error), error: messageOf(error) }
    }

    const base = normalizeLayout(doc[field])
    let ops: unknown[]
    if (typeof args.ops === 'function') {
      const built = args.ops(base)
      if (typeof built === 'string') return { ok: false, status: 400, error: built }
      ops = built
    } else {
      ops = args.ops
    }

    const resolved = resolveOperations(base, ops)
    if (!resolved.ok) return { ok: false, status: 400, error: resolved.error }

    const { blocking, warnings } = splitLayoutErrors(validateLayout(resolved.layout, blocks))
    if (blocking.length > 0) {
      return { ok: false, status: 400, error: 'The resulting layout is invalid. Nothing was saved.', errors: blocking }
    }

    let saved: Record<string, unknown>
    try {
      saved = await payload.update({
        collection,
        id,
        data: { [field]: resolved.layout },
        depth: 0,
        draft: drafts,
        overrideAccess: false,
        user,
        req,
      })
    } catch (error) {
      return { ok: false, status: statusOf(error), error: messageOf(error) }
    }

    const version = isoOf(saved.updatedAt)
    const event = await runtime.bus.publish(channel, {
      type: 'operations',
      ops: resolved.ops,
      actor,
      ...(clientId ? { clientId } : {}),
      ...(isoOf(doc.updatedAt) ? { baseVersion: isoOf(doc.updatedAt) } : {}),
      ...(version ? { version } : {}),
      at: version ?? new Date().toISOString(),
    })
    return { ok: true, layout: resolved.layout, ops: resolved.ops, version, warnings, event }
  })
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

type UserLike = { id?: unknown; name?: unknown; email?: unknown; _mcpKey?: { keyId?: unknown } }

/** Display name of a user: `name`, then `email`, then "Someone". */
export function userLabel(user: unknown): string {
  const u = (user ?? {}) as UserLike
  if (typeof u.name === 'string' && u.name.trim()) return u.name.trim()
  if (typeof u.email === 'string' && u.email) return u.email
  return 'Someone'
}

/**
 * The actor for a request. A user signed in with a payload-mcp-toolkit API key (the key's bearer
 * strategy sets `_mcpKey`) is an AI agent, also when it calls the REST endpoint.
 */
export function actorFromUser(user: unknown, aiLabel?: string): LiveActor {
  const u = (user ?? {}) as UserLike
  const userId = String(u.id ?? 'unknown')
  if (u._mcpKey) {
    return { type: 'ai', id: `mcp-key:${String(u._mcpKey.keyId ?? userId)}`, label: aiLabel ?? `AI agent (${userLabel(user)})` }
  }
  return { type: 'user', id: `user:${userId}`, label: userLabel(user) }
}

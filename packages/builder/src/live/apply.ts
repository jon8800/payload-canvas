// Shared helpers of the live channel: resolving operations, splitting validation problems and
// naming actors. Edits themselves go through the document session (session.ts).

import { applyOperation } from '../core/operations'
import { findBlock, findLocation } from '../core/tree'
import type { Layout, Operation } from '../core/types'
import type { LayoutError } from '../core/validate'
import type { LiveActor } from './types'

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

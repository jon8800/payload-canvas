// Shared helpers of the live channel: resolving operations, splitting validation problems and
// naming actors. Edits themselves go through the document session (session.ts).

import { localizeOperations } from '../core/locale'
import { applyOperation } from '../core/operations'
import { findBlock, findLocation } from '../core/tree'
import type { BlockDefinition, Layout, LocaleSettings, Operation } from '../core/types'
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
 * finished copy: every client then gets the same ids. With block definitions, `update`
 * operations with a `locale` are put in canonical form first (`localizeOperations`): the default
 * locale is dropped, and props that are not localized move to an operation without a locale.
 */
export function resolveOperations(
  layout: Layout,
  ops: unknown,
  blocks?: readonly BlockDefinition[],
  localization?: LocaleSettings | null,
): Resolved {
  if (!Array.isArray(ops)) return { ok: false, error: 'Operations must be an array' }
  if (ops.length === 0) return { ok: false, error: 'No operations given' }
  if (blocks) {
    const localized = localizeOperations(layout, ops, blocks, localization)
    if (!localized.ok) return localized
    ops = localized.ops
  }
  let current = layout
  const out: Operation[] = []
  const list = ops as unknown[]
  for (let i = 0; i < list.length; i++) {
    const op = list[i] as Operation
    // With block definitions, inserts and moves also follow the slot rules (allow / disallow).
    const result = applyOperation(current, op, blocks ? { blocks } : undefined)
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

/** One field error of a Payload ValidationError. */
export type PayloadFieldError = { path: string; message: string; label?: string }

function humanizePath(path: string): string {
  const name = path.split('.').at(-1)?.replace(/\[\d+\]/g, '') ?? path
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

function labelText(label: unknown): string | undefined {
  if (typeof label === 'string' && label) return label
  if (label && typeof label === 'object') {
    const first = (label as Record<string, unknown>).en ?? Object.values(label)[0]
    if (typeof first === 'string' && first) return first
  }
  return undefined
}

/** The field errors of a Payload ValidationError (empty for other errors). */
export function payloadFieldErrors(error: unknown): PayloadFieldError[] {
  const data = (error as { data?: { errors?: { message?: unknown; path?: unknown; label?: unknown }[] } })?.data
  const out: PayloadFieldError[] = []
  for (const e of data?.errors ?? []) {
    if (typeof e.message !== 'string' || !e.message) continue
    const label = labelText(e.label)
    out.push({ path: typeof e.path === 'string' ? e.path : '', message: e.message, ...(label ? { label } : {}) })
  }
  return out
}

/**
 * The error message of a failed Payload call. A ValidationError gives one line per problem,
 * named after its field ("Title: This field is required."), without duplicates.
 */
export function payloadErrorMessage(error: unknown, layoutField?: string): string {
  const lines = new Set<string>()
  for (const e of payloadFieldErrors(error)) {
    // The layout field's message is already one readable line per block problem.
    if (!e.path || e.path === layoutField) lines.add(e.message)
    else lines.add(`${e.label?.split(' > ').at(-1) ?? humanizePath(e.path)}: ${e.message}`)
  }
  if (lines.size > 0) return [...lines].join('\n')
  return error instanceof Error ? error.message : String(error)
}

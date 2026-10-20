// Read access to the live session's state. The session holds the document as editors see it now:
// its unsaved changes are a draft that is in the database nowhere yet, and it sends that state to
// every editor (events, operations, MCP). Payload's read access (`access.read`) is true, false or
// a Where, and a user may read exactly the documents whose stored values match that Where. This
// asks the same question of the live state: may this user read the document as a draft, now?
//
// - `access.read` true: yes. False: no.
// - A Where: its `_status` conditions are decided for "draft" (every state of the session is one,
//   also before anything is saved). What is left (a tenant, an author, …) runs as Payload's own
//   query (`find` with `draft: true`) on the newest stored version: the session changes only the
//   builder field, every other field is stored. A condition on the builder field itself cannot
//   be decided from stored data (the session's layout is not stored yet), so it counts as false.
// - A collection without drafts has no draft state: the Where runs as it is, on the document.
// Nothing is cached: every check runs the access and the query again, so a change of either (a
// save in the settings drawer, a region, REST, a changed rule) applies to the next check.

import { executeAccess, type PayloadRequest, type Where } from 'payload'

import type { Layout, Operation } from '../core/types'

/** Why the builder refuses a user who may not read the document as a draft. */
export const DRAFT_NOT_READABLE_MESSAGE = 'You may not read the latest draft of this document, so the builder cannot show it.'

type Target = { collection: string; id: string | number; field: string; drafts: boolean }

type ReadAccess = Parameters<typeof executeAccess>[1]

const STATUS_KEYS = new Set(['_status', 'version._status'])

/** The values of an `in` / `not_in` condition, as Payload reads them (a list or comma-separated text). */
const listOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : String(value).split(','))

/** A `_status` condition, decided for a draft. Any other operator counts as false. */
function statusMatches(condition: unknown): boolean {
  if (condition === null || typeof condition !== 'object') return false
  const entries = Object.entries(condition as Record<string, unknown>)
  if (entries.length === 0) return false
  return entries.every(([op, value]) => {
    switch (op) {
      case 'equals':
        return String(value) === 'draft'
      case 'not_equals':
        return (typeof value === 'string' || typeof value === 'number') && String(value) !== 'draft'
      case 'in':
        return listOf(value).includes('draft')
      case 'not_in':
        return !listOf(value).includes('draft')
      case 'exists':
        return value === true || value === 'true'
      default:
        return false
    }
  })
}

/** All parts of one level of a Where (its keys are ANDed): false wins, true parts drop out. */
function allOf(parts: (boolean | Where)[]): boolean | Where {
  if (parts.includes(false)) return false
  const rest = parts.filter((part): part is Where => part !== true)
  if (rest.length === 0) return true
  return rest.length === 1 ? rest[0] : { and: rest }
}

/**
 * The Where with its `_status` conditions decided for a draft (`drafts`): true (always), false
 * (never), or what is left for Payload's query. A condition on `field` (the builder field) or
 * one this cannot read counts as false. Payload's Where has no negation of a nested Where, so a
 * part that counts as false only ever refuses more, never less.
 */
export function decideForDraft(where: Where, field: string, drafts: boolean): boolean | Where {
  if (where === null || typeof where !== 'object' || Array.isArray(where)) return false
  const parts: (boolean | Where)[] = []
  for (const [key, condition] of Object.entries(where)) {
    const lower = key.toLowerCase()
    if (lower === 'and' || lower === 'or') {
      if (!Array.isArray(condition)) return false
      // An empty list: Payload's query decides what it means.
      if (condition.length === 0) {
        parts.push({ [lower]: [] } as Where)
        continue
      }
      const items = (condition as Where[]).map((w) => decideForDraft(w, field, drafts))
      if (lower === 'and') {
        parts.push(allOf(items))
        continue
      }
      if (items.includes(true)) {
        parts.push(true)
        continue
      }
      const rest = items.filter((item): item is Where => item !== false)
      parts.push(rest.length === 0 ? false : rest.length === 1 ? rest[0] : { or: rest })
      continue
    }
    const path = key.startsWith('version.') ? key.slice('version.'.length) : key
    if (drafts && STATUS_KEYS.has(key)) {
      parts.push(statusMatches(condition))
      continue
    }
    if (path === field || path.startsWith(`${field}.`)) return false
    parts.push({ [key]: condition } as Where)
  }
  return allOf(parts)
}

/**
 * Null when the request's user may read the document as the live session holds it (a draft, for
 * collections with drafts), else why the builder refuses. Payload's own access and query decide.
 * Throws when the access or the query fails: callers refuse then.
 */
export async function liveReadProblem(req: PayloadRequest, target: Target): Promise<string | null> {
  const config = (req.payload.collections as Record<string, { config: { access?: { read?: ReadAccess } } } | undefined>)[target.collection]?.config
  if (!config) return DRAFT_NOT_READABLE_MESSAGE
  // Without `access.read` (never after Payload's sanitizing), executeAccess allows signed-in users.
  const result: unknown = await executeAccess({ id: target.id, slug: target.collection, disableErrors: true, req }, config.access?.read as ReadAccess)
  if (!result) return DRAFT_NOT_READABLE_MESSAGE
  // As in Payload: anything but a Where that is not false allows.
  if (typeof result !== 'object') return null
  const decided = decideForDraft(result as Where, target.field, target.drafts)
  if (decided === true) return null
  if (decided === false) return DRAFT_NOT_READABLE_MESSAGE
  // What is left: Payload's own query on the newest stored version (or the document, without drafts).
  const found = await req.payload.find({
    collection: target.collection as never,
    where: { and: [{ id: { equals: target.id } }, decided] },
    draft: target.drafts,
    depth: 0,
    limit: 1,
    pagination: false,
    select: { id: true } as never,
    overrideAccess: true,
    req,
  })
  return found.docs.length > 0 ? null : DRAFT_NOT_READABLE_MESSAGE
}

type CommitAccess = (args: { before: Layout; after: Layout; ops: readonly Operation[]; doc: Record<string, unknown> }) => Promise<string | null>

/**
 * A commit's access check that first asks `liveReadProblem` again, inside the commit (its lock,
 * on the document as stored when the check ends), because the result goes back to the user. A
 * failing check refuses.
 */
export function withLiveReadCheck(req: PayloadRequest, target: Target, access?: CommitAccess): CommitAccess {
  return async (args) => {
    const problem = await liveReadProblem(req, target).catch(() => DRAFT_NOT_READABLE_MESSAGE)
    if (problem) return problem
    return access ? access(args) : null
  }
}

// Where editable classes are used, and renaming or removing a class in every layout that uses it.
// Server-only.
//
// Class names live inside layout strings (`className`, `partClassName`), not in relationship
// fields, and a page may use a name before the class exists (import from the site's CSS), so the
// usage comes from a scan of the layouts (one query per builder collection, latest drafts, open
// live sessions first) instead of the references index. Changes go through each document's live
// session, the same path as people's edits: open editors see them at once, and the session saves
// a draft with Payload's hooks, access and versions.

import type { PayloadRequest, SanitizedCollectionConfig } from 'payload'

import { normalizeLayout, walkBlocks } from '../core/tree'
import type { Layout, Operation } from '../core/types'
import { actorFromUser, type LiveDocStore } from '../live/apply'
import { canEditDesign } from '../live/contentMode'
import { builderConfigOf } from '../live/document'
import { DRAFT_NOT_READABLE_MESSAGE, liveReadProblem, withLiveReadCheck } from '../live/draftAccess'
import { sessionTargetOf } from '../live/endpoints'
import { liveRuntimeOf } from '../live/runtime'
import { RAW_LAYOUT_CONTEXT } from '../plugin/hook'
import { savedSectionsConfigOf } from '../plugin/sections'
import { classesConfigOf } from './config'
import { bareClass, classTokens, replaceClass, usesClass, type ClassUsage } from './shared'

/** One layout of a builder document. */
export type ScannedLayout = { collection: string; id: string | number; title: string; layout: Layout }

/** The class names a block uses (its own classes and its parts'), without variant prefixes. */
function blockClassNames(block: { className?: string | null; partClassName?: Record<string, string | null> | null }): Set<string> {
  const names = new Set<string>()
  for (const token of classTokens(block.className)) names.add(bareClass(token))
  for (const value of Object.values(block.partClassName ?? {})) {
    if (typeof value === 'string') for (const token of classTokens(value)) names.add(bareClass(token))
  }
  return names
}

/** Blocks per class name in one layout, for the names asked for. */
export function countClassUses(layout: Layout, names: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>()
  walkBlocks(layout, (block) => {
    for (const name of blockClassNames(block)) if (names.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1)
  })
  return counts
}

/** The operations that rename (or with `to: null` remove) class `from` in a layout. */
export function replaceClassOps(layout: Layout, from: string, to: string | null): Operation[] {
  const ops: Operation[] = []
  walkBlocks(layout, (block) => {
    if (usesClass(block.className, from)) ops.push({ type: 'update', id: block.id, className: replaceClass(block.className, from, to) || null })
    const parts = Object.entries(block.partClassName ?? {}).filter(([, value]) => typeof value === 'string' && usesClass(value, from))
    if (parts.length > 0) {
      ops.push({ type: 'update', id: block.id, partClassName: Object.fromEntries(parts.map(([part, value]) => [part, replaceClass(value, from, to) || null])) })
    }
  })
  return ops
}

const configOf = (req: PayloadRequest, collection: string) =>
  (req.payload.collections as Record<string, { config: SanitizedCollectionConfig } | undefined>)[collection]?.config

/**
 * Every layout of the builder collections (JSON layouts; a Payload blocks field holds no classes):
 * the latest drafts, with the open live session's layout instead where one is open. `asUser`:
 * only the documents the request's user may read. `published`: the published layouts instead (what
 * the live site renders; a collection without drafts: every document), saved sections left out.
 */
export async function scanLayouts(req: PayloadRequest, asUser: boolean, published = false): Promise<ScannedLayout[]> {
  const builder = builderConfigOf(req.payload)
  if (!builder) return []
  const sessions = liveRuntimeOf(req.payload).sessions
  const sectionsSlug = savedSectionsConfigOf(req.payload)?.slug ?? null
  const out: ScannedLayout[] = []
  for (const [collection, options] of Object.entries(builder.collections)) {
    if (options.payloadBlocks) continue
    const config = configOf(req, collection)
    if (!config) continue
    // The site never renders a saved section on its own.
    if (published && collection === sectionsSlug) continue
    // Saved sections keep their blocks in `blocks`; the builder's `layout` there is virtual.
    const field = collection === sectionsSlug ? 'blocks' : options.field
    const drafts = Boolean(config.versions?.drafts)
    const title = config.admin?.useAsTitle && config.admin.useAsTitle !== 'id' ? config.admin.useAsTitle : null
    const result = await req.payload.find({
      collection: collection as never,
      depth: 0,
      pagination: false,
      draft: drafts && !published,
      ...(published && drafts ? { where: { _status: { equals: 'published' } } } : {}),
      select: { [field]: true, ...(title ? { [title]: true } : {}) } as never,
      context: { [RAW_LAYOUT_CONTEXT]: true },
      overrideAccess: !asUser,
      ...(asUser ? { user: req.user } : {}),
      req,
    })
    for (const doc of result.docs as unknown as Record<string, unknown>[]) {
      const id = doc.id as string | number
      const open = published ? undefined : sessions.peek(collection, id)
      const stored = collection === sectionsSlug ? { version: 1, blocks: doc.blocks } : doc[field]
      const name = title ? doc[title] : null
      out.push({ collection, id, title: typeof name === 'string' && name.trim() ? name.trim() : String(id), layout: open?.layout ?? normalizeLayout(stored) })
    }
  }
  return out
}

/**
 * Where each of `names` is used: blocks and documents. `asUser` (default true): only documents the
 * request's user may read; the delete check counts every document.
 */
export async function classUsage(req: PayloadRequest, names: Iterable<string>, options: { asUser?: boolean } = {}): Promise<Record<string, ClassUsage>> {
  const wanted = new Set(names)
  const usage: Record<string, ClassUsage> = Object.fromEntries([...wanted].map((name) => [name, { blocks: 0, documents: [] }]))
  if (wanted.size === 0) return usage
  for (const { collection, id, title, layout } of await scanLayouts(req, options.asUser ?? true)) {
    for (const [name, blocks] of countClassUses(layout, wanted)) {
      const entry = usage[name]!
      entry.blocks += blocks
      entry.documents.push({ collection, id, title, blocks })
    }
  }
  return usage
}

/**
 * The published documents whose published layout uses one of `names` (the live site renders those
 * layouts), as the request's user may read them. Each document once, with the block count.
 */
export async function publishedClassUsage(req: PayloadRequest, names: Iterable<string>): Promise<ClassUsage['documents']> {
  const wanted = new Set(names)
  if (wanted.size === 0) return []
  const out: ClassUsage['documents'] = []
  for (const { collection, id, title, layout } of await scanLayouts(req, true, true)) {
    let blocks = 0
    for (const count of countClassUses(layout, wanted).values()) blocks += count
    if (blocks > 0) out.push({ collection, id, title, blocks })
  }
  return out
}

/**
 * The names among `names` that any layout uses: the latest drafts, open live sessions and the
 * published layouts of every document (no access check: deleting must not miss a page).
 */
export async function usedClassNames(req: PayloadRequest, names: Iterable<string>): Promise<Set<string>> {
  const wanted = new Set(names)
  const used = new Set<string>()
  if (wanted.size === 0) return used
  const [drafts, published] = await Promise.all([scanLayouts(req, false), scanLayouts(req, false, true)])
  for (const { layout } of [...drafts, ...published]) for (const name of countClassUses(layout, wanted).keys()) used.add(name)
  return used
}

export type ReplaceResult = {
  /** Documents changed. */
  documents: number
  /** Blocks changed. */
  blocks: number
  /** Documents that could not be changed, with the reason. */
  failed: Array<{ collection: string; id: string | number; title: string; error: string }>
}

const NOTHING = '__nothing_to_change__'

/**
 * Renames class `from` to `to` (or removes it, with `to: null`) in every layout that uses it, as
 * the request's user, through each document's live session. Documents the user may not update are
 * reported in `failed`.
 */
export async function replaceClassInLayouts(req: PayloadRequest, from: string, to: string | null): Promise<ReplaceResult> {
  const result: ReplaceResult = { documents: 0, blocks: 0, failed: [] }
  const builder = builderConfigOf(req.payload)
  if (!builder) return result
  const runtime = liveRuntimeOf(req.payload)
  const usage = (await classUsage(req, [from]))[from]
  for (const doc of usage?.documents ?? []) {
    const fail = (error: string) => result.failed.push({ collection: doc.collection, id: doc.id, title: doc.title, error })
    const target = sessionTargetOf(req.payload, builder.collections, doc.collection, String(doc.id))
    if (!target) continue
    if (!(await runtime.canUpdate(req, doc.collection, doc.id))) {
      fail('You may not edit this document.')
      continue
    }
    const stale = await liveReadProblem(req, target).catch(() => DRAFT_NOT_READABLE_MESSAGE)
    if (stale) {
      fail(stale)
      continue
    }
    let changed = 0
    const commit = await runtime.sessions.commit({
      target,
      store: req.payload as unknown as LiveDocStore,
      user: req.user,
      actor: actorFromUser(req.user),
      ops: (layout) => {
        const ops = replaceClassOps(layout, from, to)
        changed = ops.length
        return ops.length > 0 ? ops : NOTHING
      },
      blocks: classesConfigOf(req.payload)?.blocks ?? [],
      localization: builder.collections[doc.collection]?.localization ?? null,
      contentOnly: !(await canEditDesign(req)),
      access: withLiveReadCheck(req, target),
    })
    if (commit.ok) {
      result.documents++
      result.blocks += changed
    } else if (commit.error !== NOTHING) {
      fail(commit.error)
    }
  }
  return result
}

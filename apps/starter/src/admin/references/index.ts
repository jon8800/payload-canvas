import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  CollectionSlug,
  Field,
  GlobalAfterChangeHook,
  GlobalConfig,
  Payload,
  PayloadRequest,
  Plugin,
  Where,
} from 'payload'
import { DEFAULT_COMMENTS_SLUG, layoutReferences, referencesConfigOf } from 'payload-canvas'
import { fieldReferences } from 'payload-canvas/core'

import { docTitle, linkProblem } from '@/admin/dashboard/lib'
import { NOT_FOUND_LOG } from '@/lib/notFoundLog'
import { planRows, type Ref, type SourceRefs, type StoredRow } from './rows'

// The reference index: one row for each document that points at another document (an image in
// a layout, a link, an upload field, a relationship). Hooks keep it current on every save and
// delete, so the dashboard asks the database small questions ("media with no row", "rows with a
// problem") instead of reading every page.

export const REFERENCE_INDEX = 'reference-index'

/** The join field on each upload collection: the index rows that point at the upload. */
export const USES_FIELD = 'indexedUses'

/** The KV key that is set once the index holds every document. */
const BUILT_KEY = 'reference-index:built'

/** Documents a rebuild writes at the same time. */
const WRITE_BATCH = 8

/** Reads the whole stored layout (every locale), as the plugin's references code does. */
const RAW_LAYOUT = { builderRawLayout: true }

/** Hook context that skips the index (the rebuild writes the rows itself). */
const SKIP = 'skipReferenceIndex'

/** Collections that never point at content: Payload's own, the logs, comments and the index. */
const isInternal = (slug: string) =>
  slug.startsWith('payload-') || slug === REFERENCE_INDEX || slug === NOT_FOUND_LOG || slug === DEFAULT_COMMENTS_SLUG

/** The name of the relationship field that points at an upload collection: `mediaUpload`. */
export const uploadFieldName = (slug: string) => `${slug.replace(/[-_](\w)/g, (_, letter: string) => letter.toUpperCase())}Upload`

const hasDrafts = (config: { versions?: unknown }) =>
  Boolean(config.versions && typeof config.versions === 'object' && (config.versions as { drafts?: unknown }).drafts)

type Doc = Record<string, unknown> & { id?: string | number }
type Row = StoredRow & { problem?: string | null; targetTitle?: string | null }

function indexCollection(uploads: string[]): CollectionConfig {
  return {
    slug: REFERENCE_INDEX,
    labels: { singular: 'Reference', plural: 'References' },
    admin: { hidden: true, useAsTitle: 'source' },
    // Only the server writes it (with `overrideAccess`). Signed-in users may read it, so the media
    // list can filter by it ("View all" in the Unused media widget).
    access: { read: ({ req }) => Boolean(req.user), create: () => false, update: () => false, delete: () => false },
    timestamps: false,
    versions: false,
    authorship: false,
    indexes: [{ fields: ['relationTo', 'value'] }],
    fields: [
      /** `pages:12` or `global:site-settings`. */
      { name: 'source', type: 'text', required: true, index: true },
      { name: 'sourceCollection', type: 'text', index: true },
      { name: 'sourceId', type: 'text' },
      { name: 'sourceTitle', type: 'text' },
      { name: 'relationTo', type: 'text', required: true },
      { name: 'value', type: 'text', required: true },
      /** Used by the published document, by the latest version, and in the latest layout. */
      { name: 'published', type: 'checkbox', index: true },
      { name: 'latest', type: 'checkbox', index: true },
      { name: 'layout', type: 'checkbox', index: true },
      /** For links: `deleted` or `unpublished` when the target is. */
      { name: 'problem', type: 'text', index: true },
      { name: 'targetTitle', type: 'text' },
      // A real relationship for upload targets, so an upload collection can join its rows.
      ...uploads.map((slug): Field => ({ name: uploadFieldName(slug), type: 'relationship', relationTo: slug as CollectionSlug, index: true })),
    ],
  }
}

const sourceKey = (kind: 'collection' | 'global', slug: string, id?: string | number) => (kind === 'global' ? `global:${slug}` : `${slug}:${String(id)}`)

/** References of one document's data, without itself and without collections that do not exist. */
function referencesOf(payload: Payload, fields: readonly unknown[], doc: Doc, self?: string): Ref[] {
  return fieldReferences(fields, doc).filter(
    (ref) =>
      Boolean(payload.collections[ref.relationTo as CollectionSlug]) &&
      !isInternal(ref.relationTo) &&
      !(ref.relationTo === self && String(ref.value) === String(doc.id)),
  )
}

/** Links of a builder document's layout (not images): the ones "Broken links" checks. */
function layoutLinksOf(payload: Payload, slug: string, doc: Doc): Ref[] {
  const config = referencesConfigOf(payload)
  if (!config) return []
  return (layoutReferences(config, slug, doc) ?? []).filter((ref) => {
    const target = payload.collections[ref.relationTo as CollectionSlug]
    return Boolean(target && !target.config.upload) && !(ref.relationTo === slug && String(ref.value) === String(doc.id))
  })
}

/** Problems of link targets, one query per collection: deleted or not published. Uploads have none. */
async function targetStates(payload: Payload, refs: readonly Ref[], req?: PayloadRequest): Promise<Map<string, { problem: string | null; title: string | null }>> {
  const states = new Map<string, { problem: string | null; title: string | null }>()
  const byCollection = new Map<string, Set<string>>()
  for (const ref of refs) {
    const target = payload.collections[ref.relationTo as CollectionSlug]
    if (!target || target.config.upload) continue
    byCollection.set(ref.relationTo, (byCollection.get(ref.relationTo) ?? new Set()).add(String(ref.value)))
  }
  for (const [slug, ids] of byCollection) {
    const { config } = payload.collections[slug as CollectionSlug]
    const drafts = hasDrafts(config)
    try {
      const found = await payload.find({
        collection: slug as CollectionSlug,
        depth: 0,
        draft: false,
        limit: ids.size,
        overrideAccess: true,
        pagination: false,
        where: { id: { in: [...ids] } },
        ...(req ? { req } : {}),
      })
      const docs = new Map((found.docs as unknown as Doc[]).map((doc) => [String(doc.id), doc]))
      for (const id of ids) {
        const doc = docs.get(id)
        states.set(`${slug}:${id}`, {
          problem: linkProblem({ found: Boolean(doc), drafts, status: doc?._status }),
          title: doc ? docTitle(doc, config.admin.useAsTitle) : null,
        })
      }
    } catch {
      // A failed check marks nothing, rather than calling every link broken.
    }
  }
  return states
}

/** Makes the stored rows of one document match its references. */
async function writeSource(args: {
  payload: Payload
  req?: PayloadRequest
  key: string
  collection: string
  id: string
  title: string
  refs: SourceRefs
  /** The rows the index has for this document, when the caller knows them (a rebuild starts empty). */
  stored?: Row[]
}) {
  const { payload, req, key } = args
  const stored =
    args.stored ??
    ((await payload.db.find({ collection: REFERENCE_INDEX, where: { source: { equals: key } }, limit: 0, pagination: false, req })).docs as unknown as Row[])
  const plan = planRows(stored, args.refs)
  const titleChanged = stored.some((row) => (row as { sourceTitle?: unknown }).sourceTitle !== args.title)
  if (!plan.create.length && !plan.update.length && !plan.remove.length && !titleChanged) return

  if (plan.remove.length) await payload.db.deleteMany({ collection: REFERENCE_INDEX, where: { id: { in: plan.remove } }, req })
  for (const row of plan.update) {
    await payload.db.updateOne({ collection: REFERENCE_INDEX, id: row.id, data: { published: row.published, latest: row.latest, layout: row.layout }, req, returning: false })
  }
  if (titleChanged) {
    await payload.db.updateMany({ collection: REFERENCE_INDEX, where: { source: { equals: key } }, data: { sourceTitle: args.title }, req })
  }
  const states = await targetStates(payload, plan.create, req)
  for (const row of plan.create) {
    const state = states.get(`${row.relationTo}:${row.value}`)
    const upload = payload.collections[row.relationTo as CollectionSlug]?.config.upload
    await payload.db.create({
      collection: REFERENCE_INDEX,
      data: {
        source: key,
        sourceCollection: args.collection,
        sourceId: args.id,
        sourceTitle: args.title,
        ...row,
        problem: state?.problem ?? null,
        targetTitle: state?.title ?? null,
        ...(upload ? { [uploadFieldName(row.relationTo)]: Number.isNaN(Number(row.value)) ? row.value : Number(row.value) } : {}),
      },
      req,
      returning: false,
    })
  }
}

/** Marks the rows that point at one document with its current problem (deleted, unpublished, none). */
async function updateTarget(payload: Payload, slug: string, id: string | number, req: PayloadRequest, deleted: boolean) {
  const where: Where = { and: [{ relationTo: { equals: slug } }, { value: { equals: String(id) } }] }
  const { totalDocs } = await payload.db.count({ collection: REFERENCE_INDEX, where, req })
  if (!totalDocs) return
  const state = deleted ? { problem: 'deleted', title: null } : (await targetStates(payload, [{ relationTo: slug, value: id }], req)).get(`${slug}:${String(id)}`)
  if (!state) return
  await payload.db.updateMany({
    collection: REFERENCE_INDEX,
    where,
    data: { problem: state.problem, ...(state.title ? { targetTitle: state.title } : {}) },
    req,
  })
}

function collectionHooks(collection: CollectionConfig): { afterChange: CollectionAfterChangeHook; afterDelete: CollectionAfterDeleteHook } {
  const drafts = hasDrafts(collection)
  return {
    afterChange: async ({ doc, operation, req, context }) => {
      if (context?.[SKIP]) return doc
      const { payload } = req
      const id = String(doc.id)
      const key = sourceKey('collection', collection.slug, doc.id)
      const trashed = Boolean(doc.deletedAt)
      // A draft save changes the latest version only; the published document stays as it was.
      const draftSave = drafts && operation === 'update' && doc._status === 'draft'
      const refs = trashed ? [] : referencesOf(payload, collection.fields, doc, collection.slug)
      await writeSource({
        payload,
        req,
        key,
        collection: collection.slug,
        id,
        title: docTitle(doc, collection.admin?.useAsTitle),
        refs: { published: draftSave ? null : refs, latest: refs, layout: trashed ? [] : layoutLinksOf(payload, collection.slug, doc) },
      })
      if (!collection.upload) await updateTarget(payload, collection.slug, doc.id, req, trashed)
      return doc
    },
    afterDelete: async ({ doc, req, context }) => {
      if (context?.[SKIP]) return doc
      const { payload } = req
      await payload.db.deleteMany({ collection: REFERENCE_INDEX, where: { source: { equals: sourceKey('collection', collection.slug, doc.id) } }, req })
      if (!collection.upload) await updateTarget(payload, collection.slug, doc.id, req, true)
      return doc
    },
  }
}

function globalHook(global: GlobalConfig): GlobalAfterChangeHook {
  const drafts = hasDrafts(global)
  return async ({ doc, req, context }) => {
    if (context?.[SKIP]) return doc
    const refs = referencesOf(req.payload, global.fields, doc)
    await writeSource({
      payload: req.payload,
      req,
      key: sourceKey('global', global.slug),
      collection: `global:${global.slug}`,
      id: global.slug,
      title: typeof global.label === 'string' ? global.label : global.slug,
      refs: { published: drafts && doc._status === 'draft' ? null : refs, latest: refs, layout: [] },
    })
    return doc
  }
}

/** Every document of one collection in pages, as the published and the latest version. */
async function* documentsOf(payload: Payload, slug: string, draft: boolean) {
  for (let page = 1; ; page++) {
    const result = await payload.find({ collection: slug as CollectionSlug, context: RAW_LAYOUT, depth: 0, draft, limit: 250, overrideAccess: true, page, sort: 'id' })
    yield result.docs as unknown as Doc[]
    if (!result.hasNextPage) return
  }
}

/**
 * Writes the index from scratch: reads every document once (published and latest version) and
 * replaces each document's rows. For a new install, a restore from a backup, or after writes that
 * skipped hooks. It reads everything, so it runs in the background or from the script, never on
 * a dashboard load.
 */
export async function rebuildReferenceIndex(payload: Payload): Promise<{ sources: number; ms: number }> {
  const started = Date.now()
  // The widgets say "checking" until the build is done, so an empty index never reads as "unused".
  await payload.kv.delete(BUILT_KEY)
  await payload.db.deleteMany({ collection: REFERENCE_INDEX, where: { id: { exists: true } } })
  let sources = 0
  for (const { config } of Object.values(payload.collections)) {
    if (isInternal(config.slug)) continue
    const drafts = hasDrafts(config)
    const docs = new Map<string, { published: Ref[]; latest: Ref[] | null; layout: Ref[]; title: string }>()
    for await (const batch of documentsOf(payload, config.slug, false)) {
      for (const doc of batch) {
        if (doc.deletedAt) continue
        docs.set(String(doc.id), { published: referencesOf(payload, config.fields, doc, config.slug), latest: null, layout: layoutLinksOf(payload, config.slug, doc), title: docTitle(doc, config.admin.useAsTitle) })
      }
    }
    if (drafts) {
      for await (const batch of documentsOf(payload, config.slug, true)) {
        for (const doc of batch) {
          const entry = docs.get(String(doc.id))
          if (!entry) continue
          entry.latest = referencesOf(payload, config.fields, doc, config.slug)
          entry.layout = layoutLinksOf(payload, config.slug, doc)
          entry.title = docTitle(doc, config.admin.useAsTitle)
        }
      }
    }
    const entries = [...docs]
    // A few documents at a time: the writes share the database pool with the running site.
    for (let i = 0; i < entries.length; i += WRITE_BATCH) {
      await Promise.all(
        entries.slice(i, i + WRITE_BATCH).map(([id, entry]) =>
          writeSource({
            payload,
            key: sourceKey('collection', config.slug, id),
            collection: config.slug,
            id,
            title: entry.title,
            refs: { published: entry.published, latest: entry.latest ?? entry.published, layout: entry.layout },
            stored: [],
          }),
        ),
      )
    }
    sources += entries.length
  }
  for (const global of payload.config.globals) {
    const doc = (await payload.findGlobal({ slug: global.slug as never, depth: 0, draft: hasDrafts(global), overrideAccess: true })) as Doc
    const refs = referencesOf(payload, global.fields, doc)
    await writeSource({ payload, key: sourceKey('global', global.slug), collection: `global:${global.slug}`, id: global.slug, title: global.slug, refs: { published: refs, latest: refs, layout: [] }, stored: [] })
    sources++
  }
  await payload.kv.set(BUILT_KEY, { at: new Date().toISOString(), sources })
  return { sources, ms: Date.now() - started }
}

/** True once the index holds every document (the first rebuild finished). */
export async function referenceIndexReady(payload: Payload): Promise<boolean> {
  return payload.kv.has(BUILT_KEY)
}

/**
 * The reference index: a hidden collection, the hooks that keep it current on every collection
 * and global, a join field on each upload collection, and a first build in the background when
 * the index was never built. Add it after the plugins that add collections (it indexes them too).
 */
export function referenceIndex(): Plugin {
  return (config) => {
    const uploads = (config.collections ?? []).filter((collection) => collection.upload && !isInternal(collection.slug)).map((collection) => collection.slug)
    const collections = (config.collections ?? []).map((collection): CollectionConfig => {
      if (isInternal(collection.slug)) return collection
      const hooks = collectionHooks(collection)
      return {
        ...collection,
        fields: uploads.includes(collection.slug)
          ? [
              ...collection.fields,
              {
                name: USES_FIELD,
                type: 'join',
                collection: REFERENCE_INDEX as CollectionSlug,
                on: uploadFieldName(collection.slug),
                // Only for "unused" queries: one row is enough, and the edit view does not show it.
                defaultLimit: 1,
                maxDepth: 0,
                admin: { hidden: true, disabled: { column: true, filter: true } },
              },
            ]
          : collection.fields,
        hooks: {
          ...collection.hooks,
          afterChange: [...(collection.hooks?.afterChange ?? []), hooks.afterChange],
          afterDelete: [...(collection.hooks?.afterDelete ?? []), hooks.afterDelete],
        },
      }
    })
    const globals = (config.globals ?? []).map(
      (global): GlobalConfig => ({ ...global, hooks: { ...global.hooks, afterChange: [...(global.hooks?.afterChange ?? []), globalHook(global)] } }),
    )
    return {
      ...config,
      collections: [...collections, indexCollection(uploads)],
      globals,
      onInit: async (payload) => {
        await config.onInit?.(payload)
        // Only in the running site: not in `next build`, and not in CLI scripts (`payload run`,
        // `generate:types`), which exit before a build could finish.
        if (!process.env.NEXT_RUNTIME || process.env.NEXT_PHASE === 'phase-production-build') return
        if (await referenceIndexReady(payload)) return
        // First start (or the index was never finished): build it without holding up the start.
        payload.logger.info('[reference-index] Building the reference index in the background.')
        void rebuildReferenceIndex(payload)
          .then(({ sources, ms }) => payload.logger.info(`[reference-index] Indexed ${sources} documents in ${ms} ms.`))
          .catch((error: unknown) => payload.logger.error({ err: error, msg: '[reference-index] Building the index failed.' }))
      },
    }
  }
}

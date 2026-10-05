// References and "Used in": a hidden polymorphic relationship field on every builder collection
// (and saved sections) that lists the documents the layout points at. Payload then knows which
// pages use which media and documents: referenced collections get "Used in" join fields and refuse
// to delete documents that are still used.

import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
  type CollectionSlug,
  type Field,
  type JoinField,
  type Payload,
  type PayloadRequest,
  type RelationshipField,
  type Where,
} from 'payload'
import { collectReferences, readReferences, referenceKey, referenceTargets, sameReferences, type Reference } from '../core/references'
import { normalizeLayout } from '../core/tree'
import type { BlockDefinition, Layout } from '../core/types'
import { collectionLabel } from './labels'

export type ReferencesOptions = {
  /** Name of the hidden references field on builder collections. Default "builderRefs". */
  field?: string
  /**
   * Collections whose edit view lists the builder documents that use them ("Used in"). Default:
   * the upload collections the blocks point at (for example "media").
   */
  usedIn?: string[]
  /**
   * Collections whose documents cannot be deleted while a builder document uses them. Default:
   * the same upload collections. Pass `context: { builderForceDelete: true }` to the Local API
   * `delete` to skip the check.
   */
  protectDelete?: string[]
  /** How many documents the "cannot delete" message names. Default 5. */
  maxListed?: number
}

export const DEFAULT_REFERENCES_FIELD = 'builderRefs'

/** `context` flag that skips the delete protection: `payload.delete({ …, context: { builderForceDelete: true } })`. */
export const FORCE_DELETE_CONTEXT = 'builderForceDelete'

/** Server-only key in `config.custom`: the references config, for `backfillReferences` and `findReferrers`. */
export const REFERENCES_CONFIG_KEY = 'websiteBuilderReferences'

/** A collection that stores references, and where its layout lives. */
export type ReferenceSource = {
  /** Name of the layout field. */
  layout: string
  /** The field holds a list of blocks (saved sections), not a whole layout. */
  blocksOnly?: boolean
  drafts: boolean
  /** Field shown as the document's name in messages. */
  title: string
  label: string
}

export type ReferencesServerConfig = {
  field: string
  /** Collections that store references, by slug. */
  sources: Record<string, ReferenceSource>
  /** Collections a reference may point at (the field's `relationTo`). */
  relationTo: string[]
  usedIn: string[]
  protectDelete: string[]
  maxListed: number
  blocks: BlockDefinition[]
}

/** Reads the references config the plugin stored on the Payload config. `null` when turned off. */
export function referencesConfigOf(payload: { config: { custom?: Record<string, unknown> } }): ReferencesServerConfig | null {
  const value = payload.config.custom?.[REFERENCES_CONFIG_KEY] as ReferencesServerConfig | undefined
  return value && typeof value.field === 'string' && value.sources ? value : null
}

const hasDrafts = (collection: CollectionConfig) =>
  Boolean(collection.versions && typeof collection.versions === 'object' && collection.versions.drafts)

/**
 * The references config from the plugin options. `sources` maps each collection that stores a
 * layout to its layout field. `null` when references are off or nothing can be referenced.
 */
export function resolveReferences(args: {
  options: ReferencesOptions | false | undefined
  collections: CollectionConfig[]
  sources: Record<string, Pick<ReferenceSource, 'layout' | 'blocksOnly'>>
  blocks: BlockDefinition[]
}): ReferencesServerConfig | null {
  const { options, collections, blocks } = args
  if (options === false) return null
  const bySlug = new Map(collections.map((c) => [c.slug, c]))
  const isUpload = (slug: string) => Boolean(bySlug.get(slug)?.upload)
  const targets = referenceTargets(blocks)
  const field = options?.field ?? DEFAULT_REFERENCES_FIELD
  const uploads = targets.collections.filter(isUpload)
  const usedIn = options?.usedIn ?? uploads
  const protectDelete = options?.protectDelete ?? uploads
  for (const slug of [...usedIn, ...protectDelete]) {
    if (!bySlug.has(slug)) throw new Error(`[websiteBuilder] references: collection "${slug}" does not exist.`)
  }
  // Rich text can hold uploads of any upload collection.
  const richTextUploads = targets.richText ? collections.filter((c) => c.upload).map((c) => c.slug) : []
  const relationTo = [...new Set([...targets.collections, ...richTextUploads, ...usedIn, ...protectDelete])].filter((slug) =>
    bySlug.has(slug),
  )
  if (relationTo.length === 0) return null

  const sources: Record<string, ReferenceSource> = {}
  for (const [slug, source] of Object.entries(args.sources)) {
    const collection = bySlug.get(slug)
    if (!collection) continue
    if (collection.fields.some((f) => 'name' in f && f.name === field)) {
      throw new Error(
        `[websiteBuilder] Collection "${slug}" already has a field named "${field}". The plugin needs this name for the layout's references; set \`references.field\` to another name.`,
      )
    }
    sources[slug] = {
      ...source,
      drafts: hasDrafts(collection),
      title: collection.admin?.useAsTitle ?? 'id',
      label: collectionLabel(collection),
    }
  }
  return { field, sources, relationTo, usedIn, protectDelete, maxListed: options?.maxListed ?? 5, blocks }
}

type Id = string | number

/** True when `id` fits the collection's ID type (a text ID never matches a number column). */
function fitsIdType(payload: Payload, collection: string, id: Id): boolean {
  const entry = payload.collections[collection as CollectionSlug]
  if (!entry) return false
  const type = entry.customIDType ?? payload.db.defaultIDType
  return type !== 'number' || /^\d+$/.test(String(id))
}

/**
 * Keeps the references whose documents exist, with the database's ID values. References already
 * stored (`known`) are trusted: Postgres removes stored references when their document goes away.
 * The rest are checked with one query per collection. A failed query drops its references, so a
 * save never fails on a dangling ID.
 */
async function keepExisting(args: { payload: Payload; req?: PayloadRequest; wanted: Reference[]; known: Reference[] }): Promise<Reference[]> {
  const { payload, req, wanted } = args
  const known = new Map(args.known.map((ref) => [referenceKey(ref), ref]))
  const missing = new Map<string, Id[]>()
  for (const ref of wanted) {
    if (known.has(referenceKey(ref)) || !fitsIdType(payload, ref.relationTo, ref.value)) continue
    missing.set(ref.relationTo, [...(missing.get(ref.relationTo) ?? []), ref.value])
  }
  const found = new Map<string, Reference>()
  // One after another: the queries share the save's transaction.
  for (const [collection, ids] of missing) {
    try {
      const result = await payload.find({
        collection: collection as CollectionSlug,
        where: { id: { in: ids } },
        depth: 0,
        limit: ids.length,
        pagination: false,
        select: { id: true } as never,
        overrideAccess: true,
        ...(req ? { req } : {}),
      })
      for (const doc of result.docs as Array<{ id: Id }>) {
        const ref = { relationTo: collection, value: doc.id }
        found.set(referenceKey(ref), ref)
      }
    } catch (error) {
      payload.logger.warn({ err: error, msg: `[websiteBuilder] Could not check the referenced "${collection}" documents. Left them out.` })
    }
  }
  return wanted.flatMap((ref) => {
    const key = referenceKey(ref)
    const hit = known.get(key) ?? found.get(key)
    return hit ? [hit] : []
  })
}

/** The layout stored in a source document's data, or `undefined` when the data has none. */
function layoutOf(source: Pick<ReferenceSource, 'layout' | 'blocksOnly'>, data: Record<string, unknown>): Layout | undefined {
  const value = data[source.layout]
  if (value === undefined) return undefined
  return source.blocksOnly ? normalizeLayout({ version: 1, blocks: value }) : normalizeLayout(value)
}

/** The references of one document's layout, checked against the database. */
async function computeReferences(args: {
  payload: Payload
  req?: PayloadRequest
  config: ReferencesServerConfig
  layout: Layout
  stored: unknown
}): Promise<Reference[]> {
  const { config } = args
  const allowed = new Set(config.relationTo)
  const wanted = collectReferences(args.layout, config.blocks).filter((ref) => allowed.has(ref.relationTo))
  const known = readReferences(args.stored)
  if (sameReferences(wanted, known)) return known
  return keepExisting({ payload: args.payload, req: args.req, wanted, known })
}

/**
 * Fills the references field from the layout on every save that sends the layout (the session's
 * drafts, publish, the Edit view, the REST and Local APIs). The field is server-owned: what the
 * client sends is ignored. A save without the layout keeps the stored references. Runs after the
 * layout hook, so it sees the layout the session guard put in.
 */
export function referencesBeforeChange(config: ReferencesServerConfig, slug: string): CollectionBeforeChangeHook {
  const source = config.sources[slug]
  return async ({ data, originalDoc, req }) => {
    if (!data || !source) return data
    delete data[config.field]
    const layout = layoutOf(source, data)
    if (!layout) return data
    data[config.field] = await computeReferences({ payload: req.payload, req, config, layout, stored: originalDoc?.[config.field] })
    return data
  }
}

/** The hidden references field. */
export function referencesField(config: ReferencesServerConfig): RelationshipField {
  return {
    name: config.field,
    type: 'relationship',
    relationTo: config.relationTo as CollectionSlug[],
    hasMany: true,
    index: true,
    label: 'Builder references',
    admin: {
      hidden: true,
      readOnly: true,
      description: 'Filled by the website builder from the layout on every save.',
    },
  }
}

/** Field name of the "Used in" join for one source collection: "pages" -> "usedInPages". */
export function usedInFieldName(source: string): string {
  const words = source.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return `usedIn${words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`
}

/** The "Used in" joins: one per source collection, in a collapsible. Empty joins are hidden. */
export function usedInFields(config: ReferencesServerConfig): Field[] {
  const joins = Object.entries(config.sources).map(([slug, source]): JoinField => {
    const name = usedInFieldName(slug)
    return {
      name,
      type: 'join',
      label: source.label,
      collection: slug as CollectionSlug,
      on: config.field,
      defaultLimit: 10,
      defaultSort: '-updatedAt',
      maxDepth: 0,
      admin: {
        allowCreate: false,
        defaultColumns: [source.title, ...(source.drafts ? ['_status'] : []), 'updatedAt'],
        condition: (data) => hasJoinDocs(data?.[name]),
      },
    }
  })
  const names = Object.keys(config.sources).map(usedInFieldName)
  return [
    {
      type: 'collapsible',
      label: 'Used in',
      admin: {
        description: 'Builder pages, templates and sections that use this document. Updated when they are saved.',
        initCollapsed: false,
        condition: (data) => names.some((name) => hasJoinDocs(data?.[name])),
      },
      fields: joins,
    },
  ]
}

function hasJoinDocs(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const docs = (value as { docs?: unknown }).docs
  return Array.isArray(docs) && docs.length > 0
}

/** One document that uses another. */
export type Referrer = { collection: string; id: Id; title: string; label: string }

/**
 * The builder documents whose layout uses a document: the published state and the latest draft.
 * At most `limit` per source collection. `total` counts every one found (up to `limit` per query).
 */
export async function findReferrers(
  payload: Payload,
  target: Reference,
  options: { req?: PayloadRequest; limit?: number } = {},
): Promise<{ docs: Referrer[]; total: number }> {
  const config = referencesConfigOf(payload)
  if (!config || !config.relationTo.includes(target.relationTo)) return { docs: [], total: 0 }
  const limit = options.limit ?? 100
  const uses: Where = { [config.field]: { equals: { relationTo: target.relationTo, value: target.value } } }
  // With drafts, the main document counts only while published: a draft-only document keeps the
  // data it was created with there, and its latest draft is checked anyway.
  const published: Where = { and: [uses, { _status: { equals: 'published' } }] }
  const found = new Map<string, Referrer>()
  for (const [slug, source] of Object.entries(config.sources)) {
    for (const draft of source.drafts ? [false, true] : [false]) {
      const result = await payload.find({
        collection: slug as CollectionSlug,
        where: source.drafts && !draft ? published : uses,
        draft,
        depth: 0,
        limit,
        pagination: false,
        select: { [source.title]: true } as never,
        overrideAccess: true,
        ...(options.req ? { req: options.req } : {}),
      })
      for (const doc of result.docs as unknown as Array<Record<string, unknown>>) {
        const id = doc.id as Id
        // A document never blocks deleting itself.
        if (slug === target.relationTo && String(id) === String(target.value)) continue
        const key = `${slug}:${String(id)}`
        if (found.has(key)) continue
        const title = doc[source.title]
        found.set(key, { collection: slug, id, title: typeof title === 'string' && title ? title : `#${String(id)}`, label: source.label })
      }
    }
  }
  return { docs: [...found.values()], total: found.size }
}

/** "Used by Home (Pages), About (Pages) and 3 more." */
export function usedByMessage(docs: readonly Referrer[], maxListed: number): string {
  const named = docs.slice(0, maxListed).map((doc) => `${doc.title} (${doc.label})`)
  const more = docs.length - named.length
  const list = more > 0 ? `${named.join(', ')} and ${more} more` : named.join(', ')
  return `This document is still used by ${list}. Remove it from ${docs.length === 1 ? 'that document' : 'those documents'} first.`
}

/** Refuses to delete a document that a builder layout still uses. `context.builderForceDelete` skips it. */
export function protectDeleteHook(config: ReferencesServerConfig, slug: string): CollectionBeforeDeleteHook {
  return async ({ id, req, context }) => {
    if (context?.[FORCE_DELETE_CONTEXT]) return
    const { docs } = await findReferrers(req.payload, { relationTo: slug, value: id }, { req })
    if (docs.length === 0) return
    throw new APIError(usedByMessage(docs, config.maxListed), 409, { usedBy: docs }, true)
  }
}

/** Adds the references field and hook (sources), the "Used in" joins and the delete protection. */
export function addReferences(collection: CollectionConfig, config: ReferencesServerConfig): CollectionConfig {
  const slug = collection.slug
  const isSource = Boolean(config.sources[slug])
  const usedIn = config.usedIn.includes(slug)
  const protect = config.protectDelete.includes(slug)
  if (!isSource && !usedIn && !protect) return collection
  if (usedIn) {
    const taken = Object.keys(config.sources).map(usedInFieldName).find((name) => collection.fields.some((f) => 'name' in f && f.name === name))
    if (taken) throw new Error(`[websiteBuilder] Collection "${slug}" already has a field named "${taken}". The plugin needs it for "Used in".`)
  }
  return {
    ...collection,
    fields: [...collection.fields, ...(isSource ? [referencesField(config)] : []), ...(usedIn ? usedInFields(config) : [])],
    hooks: {
      ...collection.hooks,
      ...(isSource ? { beforeChange: [...(collection.hooks?.beforeChange ?? []), referencesBeforeChange(config, slug)] } : {}),
      ...(protect ? { beforeDelete: [...(collection.hooks?.beforeDelete ?? []), protectDeleteHook(config, slug)] } : {}),
    },
  }
}

export type BackfillResult = { collection: string; checked: number; updated: number; draftsChecked: number; draftsUpdated: number }

/**
 * Fills the references field of every existing builder document (the published or main document
 * and the latest draft), for data saved before references existed. Writes only the references
 * field, through the database adapter: no hooks, no new versions, `updatedAt` stays. Safe to run
 * again; documents that are already right are skipped. Every later save fills the field anyway.
 */
export async function backfillReferences(payload: Payload, options: { collections?: string[] } = {}): Promise<BackfillResult[]> {
  const config = referencesConfigOf(payload)
  if (!config) return []
  const results: BackfillResult[] = []
  const pageSize = 100
  for (const [slug, source] of Object.entries(config.sources)) {
    if (options.collections && !options.collections.includes(slug)) continue
    const result: BackfillResult = { collection: slug, checked: 0, updated: 0, draftsChecked: 0, draftsUpdated: 0 }
    const collection = slug as CollectionSlug

    for (let page = 1; ; page++) {
      // The stored layout (every locale), not one locale's view: translations reference documents too.
      const batch = await payload.find({ collection, depth: 0, limit: pageSize, page, sort: 'id', draft: false, overrideAccess: true, context: { builderRawLayout: true } })
      for (const doc of batch.docs as unknown as Array<Record<string, unknown>>) {
        result.checked++
        const layout = layoutOf(source, doc)
        if (!layout) continue
        const stored = readReferences(doc[config.field])
        const refs = await computeReferences({ payload, config, layout, stored })
        if (sameReferences(refs, stored)) continue
        await payload.db.updateOne({ collection, id: doc.id as Id, data: { [config.field]: refs, updatedAt: null }, returning: false })
        result.updated++
      }
      if (!batch.hasNextPage) break
    }

    if (source.drafts) {
      for (let page = 1; ; page++) {
        const batch = await payload.db.findVersions({ collection, where: { latest: { equals: true } }, limit: pageSize, page, sort: 'id' })
        for (const version of batch.docs as Array<{ id: Id; version: Record<string, unknown> }>) {
          result.draftsChecked++
          const layout = layoutOf(source, version.version)
          if (!layout) continue
          const stored = readReferences(version.version[config.field])
          const refs = await computeReferences({ payload, config, layout, stored })
          if (sameReferences(refs, stored)) continue
          await payload.db.updateVersion({
            collection,
            id: version.id,
            versionData: { version: { [config.field]: refs, updatedAt: null }, updatedAt: null } as never,
            returning: false,
          })
          result.draftsUpdated++
        }
        if (!batch.hasNextPage) break
      }
    }
    results.push(result)
  }
  return results
}

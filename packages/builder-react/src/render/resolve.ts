// Replaces upload/relationship IDs in block props with documents.

import type { Payload, Where } from 'payload'
import { resolveBindings, type Block, type BlockDefinition, type Layout, type TemplateContext } from '@payload-toolkit/builder/core'
import { isRecord, mapFieldValues, type FieldLike, type VisitField } from './fields'
import { attachListItems, listQueries, type ListQuery } from './lists'
import type { FetchDocs, ResolveLink } from './types'
import { localeArgs, localizeLayout, type LocaleArgs, type RenderLocale } from './locale'

type Id = string | number
type Resolve = (collection: string, id: Id) => unknown

const isId = (value: unknown): value is Id => typeof value === 'string' || typeof value === 'number'

/** Maps one relationship/upload value (single or hasMany, plain or polymorphic). */
function mapReference(value: unknown, field: FieldLike, resolve: Resolve): unknown {
  if (Array.isArray(value)) return value.map((item) => mapReference(item, field, resolve))
  if (Array.isArray(field.relationTo)) {
    // Polymorphic values are `{ relationTo, value }`.
    if (!isRecord(value) || typeof value.relationTo !== 'string' || !isId(value.value)) return value
    return { ...value, value: resolve(value.relationTo, value.value) }
  }
  if (typeof field.relationTo !== 'string' || !isId(value)) return value
  return resolve(field.relationTo, value)
}

type LexicalNode = Record<string, unknown> & { children?: unknown; fields?: unknown }

/** A `{ relationTo, value }` pair whose value is still an ID. */
function mapRelationPair(pair: unknown, resolve: Resolve): unknown {
  if (!isRecord(pair) || typeof pair.relationTo !== 'string' || !isId(pair.value)) return pair
  return { ...pair, value: resolve(pair.relationTo, pair.value) }
}

/**
 * Maps the references inside Lexical rich text: upload and relationship nodes
 * (`{ relationTo, value }`) and internal links (`fields.doc`). Unchanged nodes keep their identity.
 */
function mapLexicalNode(node: unknown, resolve: Resolve): unknown {
  if (!isRecord(node)) return node
  let next: LexicalNode = node
  if (node.type === 'upload' || node.type === 'relationship') {
    next = mapRelationPair(node, resolve) as LexicalNode
  }
  if ((node.type === 'link' || node.type === 'autolink') && isRecord(node.fields) && node.fields.doc) {
    const doc = mapRelationPair(node.fields.doc, resolve)
    if (doc !== node.fields.doc) next = { ...next, fields: { ...node.fields, doc } }
  }
  if (Array.isArray(node.children)) {
    const children = node.children.map((child) => mapLexicalNode(child, resolve))
    if (children.some((child, i) => child !== (node.children as unknown[])[i])) next = { ...next, children }
  }
  return next
}

function mapRichText(value: unknown, resolve: Resolve): unknown {
  if (!isRecord(value) || !isRecord(value.root)) return value
  const root = mapLexicalNode(value.root, resolve)
  return root === value.root ? value : { ...value, root }
}

/** Replaces the IDs in upload, relationship and rich text values. */
function referenceVisitor(resolve: Resolve): VisitField {
  return (field, value) => {
    if (field.type === 'upload' || field.type === 'relationship') return mapReference(value, field, resolve)
    if (field.type === 'richText') return mapRichText(value, resolve)
    return value
  }
}

function mapBlocks(
  blocks: Block[],
  definitions: Map<string, BlockDefinition>,
  resolve: Resolve,
): Block[] {
  const visit = referenceVisitor(resolve)
  return blocks.map((block) => {
    const fields = definitions.get(block.type)?.fields as FieldLike[] | undefined
    const next: Block = { ...block }
    if (block.props && fields) next.props = mapFieldValues(block.props, fields, visit)
    if (block.slots) {
      next.slots = Object.fromEntries(
        Object.entries(block.slots).map(([slot, children]) => [
          slot,
          mapBlocks(children, definitions, resolve),
        ]),
      )
    }
    return next
  })
}

function lookup(docs: Map<Id, Record<string, unknown>> | undefined, id: Id): unknown {
  if (!docs) return id
  // The layout may store "5" while the database returns 5, or the other way round.
  return docs.get(id) ?? docs.get(String(id)) ?? docs.get(Number(id)) ?? id
}

/** Replaces upload/relationship IDs in block props with documents, using `fetchDocs`. Never mutates. */
export async function resolveLayoutData(
  layout: Layout,
  blocks: BlockDefinition[],
  fetchDocs: FetchDocs,
): Promise<Layout> {
  const definitions = new Map(blocks.map((definition) => [definition.type, definition]))

  // Pass 1: collect the IDs per collection.
  const wanted = new Map<string, Set<Id>>()
  mapBlocks(layout.blocks, definitions, (collection, id) => {
    const ids = wanted.get(collection) ?? new Set<Id>()
    ids.add(id)
    wanted.set(collection, ids)
    return id
  })
  if (wanted.size === 0) return layout

  // One fetch per collection.
  const entries = [...wanted]
  const results = await Promise.all(
    entries.map(([collection, ids]) => fetchDocs(collection, [...ids])),
  )
  const loaded = new Map(entries.map(([collection], i) => [collection, results[i]]))

  // Pass 2: replace the IDs.
  return {
    ...layout,
    blocks: mapBlocks(layout.blocks, definitions, (collection, id) =>
      lookup(loaded.get(collection), id),
    ),
  }
}

/** The URL of a context document from a link resolver (for the `$url` binding path). */
export function urlResolver(resolveLink: ResolveLink): (context: TemplateContext) => string | null {
  return (context) => resolveLink({ type: 'reference', reference: { relationTo: context.collection, value: context.doc } })
}

export type LoadLayoutOptions = RenderLocale & {
  /** Load drafts (draft mode). Otherwise collection lists show published documents only. */
  draft?: boolean
  /**
   * The document a template renders. Its bindings and Field blocks are resolved here. Load the
   * document with `depth: 1` (or more), so bound uploads and relationships are documents, not IDs.
   * Pass the same context to `RenderLayout`.
   */
  context?: TemplateContext | null
  /** The site's link resolver, for the `$url` binding path. `RenderLayout` resolves it otherwise. */
  resolveLink?: ResolveLink
  /**
   * The visitor (the signed-in user, or none). Collection lists load their documents with this
   * user's access (`overrideAccess: false`), so a list never shows documents or populated fields
   * the visitor may not read, such as a user's email. Pass the user in draft mode.
   */
  user?: unknown
}

/**
 * Server helper: prepares a layout for `RenderLayout` with Payload's Local API.
 * 1. Resolves bindings and Field blocks against `options.context` (when given).
 * 2. Loads every collection list's documents (`depth: 1`; published only unless `draft`), with the
 *    access of `options.user` (anonymous without it).
 * 3. Replaces upload/relationship IDs in block props with documents (one batched `find` per collection).
 */
export async function loadLayoutData(
  layout: Layout,
  blocks: BlockDefinition[],
  payload: Payload,
  options?: LoadLayoutOptions,
): Promise<Layout> {
  const draft = options?.draft ?? false
  const context = options?.context ?? null
  // Localized sites: the layout and its documents in the render's locale (render/locale.ts).
  const locale = localeArgs(options)
  const localized = localizeLayout(layout, blocks, payload, options)
  const bound = context
    ? resolveBindings(localized, context, blocks, options?.resolveLink ? { url: urlResolver(options.resolveLink) } : undefined)
    : localized

  const queries = listQueries(bound, context)
  const items = new Map<string, Array<Record<string, unknown>>>()
  await Promise.all(
    queries.map(async (query) => {
      items.set(query.blockId, await findListItems(payload, query, draft, options?.user ?? null, locale))
    }),
  )
  const withItems = attachListItems(bound, items)

  return resolveLayoutData(withItems, blocks, async (collection, ids) => {
    const result = await payload.find({
      // The collection slug is dynamic, so it cannot match the generated slug union.
      collection: collection as never,
      where: { id: { in: ids } },
      depth: 0,
      draft,
      limit: ids.length,
      pagination: false,
      // Join fields (for example media's "Used in") are not needed to render; skip their subqueries.
      joins: false,
      ...locale,
    })
    return new Map(
      (result.docs as Array<Record<string, unknown>>).map((doc) => [doc.id as Id, doc]),
    )
  })
}

/** One collection list's documents. An unknown collection or a failed query gives an empty list. */
async function findListItems(
  payload: Payload,
  query: ListQuery,
  draft: boolean,
  user: unknown,
  locale: LocaleArgs,
): Promise<Array<Record<string, unknown>>> {
  const config = (payload.collections as Record<string, { config: { versions?: { drafts?: unknown } } } | undefined>)[query.collection]?.config
  if (!config) return []
  const where: Where[] = []
  if (query.exclude !== undefined) where.push({ id: { not_equals: query.exclude } })
  if (!draft && config.versions?.drafts) where.push({ _status: { equals: 'published' } })
  try {
    const result = await payload.find({
      collection: query.collection as never,
      where: where.length > 0 ? { and: where } : {},
      sort: query.sort,
      limit: query.limit,
      depth: 1,
      draft,
      // The visitor's access: unreadable documents and relationships stay out (or stay IDs).
      overrideAccess: false,
      user: user as never,
      ...locale,
    })
    return result.docs as Array<Record<string, unknown>>
  } catch (error) {
    payload.logger.error({ err: error, msg: `[builder] Collection list "${query.collection}" failed to load.` })
    return []
  }
}

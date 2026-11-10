// Replaces upload/relationship IDs in block props with documents.

import { withSavedFormFields } from '../../forms/pageSync'
import type { Payload, Where } from 'payload'
import { resolveBindings, type Block, type BlockDefinition, type Layout, type TemplateContext } from '../../core'
import { isRecord, mapFieldValues, type FieldLike, type VisitField } from './fields'
import { arrangeListDocs, attachListItems, listQueries, listRequest, pageLinks, withPageParams, type ListPages, type ListQuery, type ListQueryParams } from './lists'
import type { FetchDocs, ResolveLink } from './types'
import { localeArgs, localizeLayout, type LocaleArgs, type RenderLocale } from './locale'
import { relationsOf, withRelations } from './relations'
import { savedSectionsSlugOf } from '../../blocks/builtins/sectionRef'
import { attachSections } from './sections'

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
  /**
   * The request's URL query (`URLSearchParams`, or a Next.js page's awaited `searchParams`).
   * Collection lists apply their `queryFilters` with it. Without it the filters are off. A route
   * that filters lists by the URL should send `noindex, follow` for filtered URLs.
   */
  query?: ListQueryParams | null
  /**
   * The page's path (`/guides`). The page links of paginated lists start with it, so the link to
   * page 1 is the bare path. Without it they are relative (`?page=2`, and `?` for page 1).
   */
  path?: string
  /**
   * The seed of `sort: "$random"` lists: the same seed gives the same order. Default: a new seed
   * per call, so a cached page shuffles once per cache build.
   */
  randomSeed?: number
  /**
   * Also load the collection lists inside hidden blocks. Off by default: the site never renders
   * them. The canvas server turns it on, because the editor shows hidden blocks dimmed.
   */
  includeHidden?: boolean
}

/**
 * Server helper: prepares a layout for `RenderLayout` with Payload's Local API.
 * 0. Puts the current blocks of each live saved section (`sectionRef`) into the layout.
 * 1. Resolves bindings, visibility conditions and Field blocks against `options.context` (when given).
 *    `<path>.$url` bindings read the relationship fields' collections from the Payload config.
 * 2. Loads every collection list's documents (`depth: 1` or the list's `depth`; published only unless `draft`), with the
 *    access of `options.user` (anonymous without it).
 * 3. Replaces upload/relationship IDs in block props with documents (one batched `find` per collection).
 * 4. Gives each Form block that shows a saved form that form's fields as its children (`withSavedFormFields`).
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
  const fetchDocs: FetchDocs = async (collection, ids) => {
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
  }
  // Live saved sections first, so their blocks get the same bindings, lists and documents.
  const withSections = await attachSections(layout, blocks, fetchDocs, savedSectionsSlugOf(payload.config) ?? undefined)
  const localized = localizeLayout(withSections, blocks, payload, options)
  // Which collection each relationship field points to, for `<path>.$url` bindings.
  const relations = relationsOf(payload)
  const bound = context
    ? resolveBindings(localized, context, blocks, {
        ...(options?.resolveLink ? { url: urlResolver(options.resolveLink) } : {}),
        relations,
      })
    : localized

  const queries = listQueries(bound, context, options?.query, { includeHidden: options?.includeHidden === true })
  const items = new Map<string, Array<Record<string, unknown>>>()
  const pages = new Map<string, ListPages>()
  const seed = options?.randomSeed ?? Math.floor(Math.random() * 4_294_967_296)
  await Promise.all(
    queries.map(async (query) => {
      const result = await findListItems(payload, query, draft, options?.user ?? null, locale)
      items.set(query.blockId, arrangeListDocs(result.docs, query, seed))
      if (query.page) pages.set(query.blockId, pageLinks(options?.query, query.page, result.totalPages, query.pageParam, options?.path))
    }),
  )
  const withItems = withPageParams(attachListItems(bound, items, pages), queries)

  // List items and repeat rows resolve their bindings in `RenderLayout`: they take the relations along.
  const loaded = await resolveLayoutData(withRelations(withItems, relations), blocks, fetchDocs)
  // A Form block that shows a saved form renders that form's fields as its own blocks.
  return withSavedFormFields(loaded)
}

/**
 * One collection list's documents. An unknown collection, a filter that matches nothing (`none`) or
 * a failed query gives an empty list.
 */
async function findListItems(
  payload: Payload,
  query: ListQuery,
  draft: boolean,
  user: unknown,
  locale: LocaleArgs,
): Promise<{ docs: Array<Record<string, unknown>>; totalPages: number }> {
  const config = (payload.collections as Record<string, { config: { versions?: { drafts?: unknown } } } | undefined>)[query.collection]?.config
  if (!config || query.none) return { docs: [], totalPages: 0 }
  const where: Where[] = []
  if (query.exclude !== undefined) where.push({ id: { not_equals: query.exclude } })
  if (query.ids) where.push({ id: { in: query.ids } })
  if (query.where) where.push(query.where)
  const request = listRequest(query)
  if (!draft && config.versions?.drafts) where.push({ _status: { equals: 'published' } })
  try {
    const result = await payload.find({
      collection: query.collection as never,
      where: where.length > 0 ? { and: where } : {},
      sort: request.sort,
      // Payload has no offset: load the skipped documents too (`arrangeListDocs` drops them).
      limit: request.limit,
      ...(request.page ? { page: request.page } : {}),
      depth: query.depth ?? 1,
      draft,
      // The visitor's access: unreadable documents and relationships stay out (or stay IDs).
      overrideAccess: false,
      user: user as never,
      ...locale,
    })
    return { docs: result.docs as Array<Record<string, unknown>>, totalPages: result.totalPages ?? 1 }
  } catch (error) {
    payload.logger.error({ err: error, msg: `[builder] Collection list "${query.collection}" failed to load.` })
    return { docs: [], totalPages: 0 }
  }
}

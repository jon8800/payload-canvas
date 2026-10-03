// Replaces upload/relationship IDs in block props with documents.

import type { Payload } from 'payload'
import type { Block, BlockDefinition, Layout } from '@payload-toolkit/builder/core'
import type { FetchDocs } from './types'

type Id = string | number
type FieldLike = {
  type?: string
  name?: string
  relationTo?: string | string[]
  hasMany?: boolean
  fields?: FieldLike[]
  tabs?: Array<{ name?: string; fields?: FieldLike[] }>
}
type Resolve = (collection: string, id: Id) => unknown
type PropsRecord = Record<string, unknown>

const isId = (value: unknown): value is Id => typeof value === 'string' || typeof value === 'number'
const isRecord = (value: unknown): value is PropsRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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

/** Maps the reference fields in one props object. Fields without a name share the parent object. */
function mapProps(props: PropsRecord, fields: FieldLike[], resolve: Resolve): PropsRecord {
  let result = props
  const set = (key: string, value: unknown) => {
    if (value === result[key]) return
    if (result === props) result = { ...props }
    result[key] = value
  }
  for (const field of fields) {
    const name = field.name
    if (field.type === 'upload' || field.type === 'relationship') {
      if (name && name in props) set(name, mapReference(props[name], field, resolve))
    } else if (field.type === 'group' && name) {
      const nested = props[name]
      if (isRecord(nested)) set(name, mapProps(nested, field.fields ?? [], resolve))
    } else if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) {
        if (!tab.name) {
          result = mapProps(result, tab.fields ?? [], resolve)
          continue
        }
        const nested = props[tab.name]
        if (isRecord(nested)) set(tab.name, mapProps(nested, tab.fields ?? [], resolve))
      }
    } else if (!name && field.fields) {
      // Unnamed layout containers such as `row` and `collapsible`.
      result = mapProps(result, field.fields, resolve)
    }
  }
  return result
}

function mapBlocks(
  blocks: Block[],
  definitions: Map<string, BlockDefinition>,
  resolve: Resolve,
): Block[] {
  return blocks.map((block) => {
    const fields = definitions.get(block.type)?.fields as FieldLike[] | undefined
    const next: Block = { ...block }
    if (block.props && fields) next.props = mapProps(block.props, fields, resolve)
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

/** Server helper: resolveLayoutData with Payload's Local API (batched `find` per collection). */
export async function loadLayoutData(
  layout: Layout,
  blocks: BlockDefinition[],
  payload: Payload,
  options?: { draft?: boolean },
): Promise<Layout> {
  const draft = options?.draft ?? false
  return resolveLayoutData(layout, blocks, async (collection, ids) => {
    const result = await payload.find({
      // The collection slug is dynamic, so it cannot match the generated slug union.
      collection: collection as never,
      where: { id: { in: ids } },
      depth: 0,
      draft,
      limit: ids.length,
      pagination: false,
    })
    return new Map(
      (result.docs as Array<Record<string, unknown>>).map((doc) => [doc.id as Id, doc]),
    )
  })
}

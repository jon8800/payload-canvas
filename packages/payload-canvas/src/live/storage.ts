// How a builder collection stores its layout: the codec between the stored field value and the
// layout the live session, the canvas and the tools work on.
//
// - `json` (the builder's own JSON layout field): the stored value is the layout.
// - `payload-blocks` (the collection's own Payload `blocks` field): the stored value is Payload's
//   block rows, read and written with the lossless codec of core/payloadBlocks.ts. The field stays
//   the one source of truth; the layout is a view of it while a page is open.

import { APIError, docAccessOperation, type PayloadRequest } from 'payload'

import { decodePayloadBlocks, encodePayloadBlocks, payloadBlocksProblems, payloadRowIds, withUniqueRowIds, type PayloadBlocksStorage } from '../core/payloadBlocks'
import { normalizeLayout } from '../core/tree'
import { applyOperation } from '../core/operations'
import type { Layout, Operation } from '../core/types'

export type LayoutCodec = {
  kind: 'json' | 'payload-blocks'
  /** The stored field value as a layout. Throws a 422 when the value cannot be shown without loss. */
  decode(value: unknown): Layout
  /**
   * The layout as the stored field value. `previous`: the value stored now (a Payload blocks field
   * writes `null` for values the layout removed, see `encodePayloadBlocks`).
   */
  encode(layout: Layout, previous?: unknown): unknown
  /** What in a layout the field cannot store. Empty: it can be stored as it is. */
  problems(layout: Layout): string[]
  /**
   * The resolved operations of a commit as the field stores them (a Payload blocks field gives
   * copied rows new ids; `owned`: the row ids the document's stored value has held). Returns `ops`
   * itself when nothing changes.
   */
  prepare?(layout: Layout, ops: Operation[], owned?: ReadonlySet<string>): Operation[]
  /** The row ids of a stored value (a Payload blocks field). */
  rowIds?(value: unknown): Set<string>
}

export const JSON_CODEC: LayoutCodec = {
  kind: 'json',
  decode: (value) => normalizeLayout(value),
  encode: (layout) => layout,
  problems: () => [],
}

/** The codec of a Payload blocks field. */
export function payloadBlocksCodec(storage: PayloadBlocksStorage): LayoutCodec {
  return {
    kind: 'payload-blocks',
    decode(value) {
      const result = decodePayloadBlocks(value, storage)
      if (!result.ok) throw new APIError(`The builder cannot open these blocks without changing them: ${result.error}`, 422, undefined, true)
      return result.layout
    },
    encode: (layout, previous) => encodePayloadBlocks(layout, storage, previous),
    problems: (layout) => payloadBlocksProblems(layout, storage),
    prepare: (layout, ops, owned) => withUniqueRowIds(layout, ops, storage, owned),
    rowIds: (value) => payloadRowIds(value, storage),
  }
}

const codecs = new WeakMap<object, LayoutCodec>()

/** The codec of a builder collection's server config. JSON when it stores no Payload blocks. */
export function codecOf(collection: { payloadBlocks?: PayloadBlocksStorage } | undefined): LayoutCodec {
  const storage = collection?.payloadBlocks
  if (!storage) return JSON_CODEC
  let codec = codecs.get(storage)
  if (!codec) {
    codec = payloadBlocksCodec(storage)
    codecs.set(storage, codec)
  }
  return codec
}

type LooseField = {
  type: string
  name?: string
  hidden?: boolean
  access?: { read?: (args: Record<string, unknown>) => unknown }
  fields?: LooseField[]
  tabs?: (Omit<LooseField, 'type'> & { fields: LooseField[] })[]
  blocks?: (string | { slug: string; fields: LooseField[] })[]
  blockReferences?: (string | { slug: string; fields: LooseField[] })[]
}

/** The top-level field `name` of a field list (also inside rows, collapsibles and unnamed tabs). */
function topField(fields: readonly LooseField[], name: string): LooseField | undefined {
  for (const f of fields) {
    if (f.name === name) return f
    if ((f.type === 'row' || f.type === 'collapsible' || (f.type === 'group' && !f.name)) && f.fields) {
      const found = topField(f.fields, name)
      if (found) return found
    }
    if (f.type === 'tabs') {
      for (const tab of f.tabs ?? []) {
        if (tab.name) continue
        const found = topField(tab.fields, name)
        if (found) return found
      }
    }
  }
  return undefined
}

/**
 * True when Payload's read access lets the request's user read every value in `value` (a blocks
 * field's rows, as the live session or the database holds them). Walks the field config the way
 * Payload's read hooks do: each field's `access.read` runs with the row as `siblingData`, through
 * groups, arrays, tabs, rows, collapsibles and nested blocks. A hidden field with a value, or a
 * block type without a config, counts as unreadable. Values that are absent never count.
 */
export async function canReadBlocksValue(
  req: PayloadRequest,
  args: { collection: string; field: string; id: string | number; value: unknown; doc: Record<string, unknown> },
): Promise<boolean> {
  const config = (req.payload.collections as Record<string, { config: { fields: unknown[] } } | undefined>)[args.collection]?.config
  const root = config ? topField(config.fields as LooseField[], args.field) : undefined
  if (!root) return false
  const references = new Map<string, { slug: string; fields: LooseField[] }>()
  for (const block of (req.payload.config as { blocks?: { slug: string; fields: LooseField[] }[] }).blocks ?? []) references.set(block.slug, block)
  const doc = { ...args.doc, [args.field]: args.value }
  const readable = async (field: Pick<LooseField, 'hidden' | 'access'>, value: unknown, sibling: Record<string, unknown>, blockData?: Record<string, unknown>) => {
    if (value === undefined) return true
    if (field.hidden) return false
    if (field.access?.read) {
      const ok = await field.access.read({ collection: config, req, id: args.id, data: doc, doc, siblingData: sibling, blockData })
      if (!ok) return false
    }
    return true
  }
  const walk = async (fields: readonly LooseField[], data: unknown, blockData?: Record<string, unknown>): Promise<boolean> => {
    if (!isRecord(data)) return true
    for (const f of fields) {
      if ((f.type === 'row' || f.type === 'collapsible' || (f.type === 'group' && !f.name)) && f.fields) {
        if (!(await walk(f.fields, data, blockData))) return false
        continue
      }
      if (f.type === 'tabs') {
        for (const tab of f.tabs ?? []) {
          if (tab.name && !(await readable(tab, data[tab.name], data, blockData))) return false
          if (!(await walk(tab.fields, tab.name ? data[tab.name] : data, blockData))) return false
        }
        continue
      }
      if (!f.name) continue
      const value = data[f.name]
      if (!(await readable(f, value, data, blockData))) return false
      if (!(await walkValue(f, value, blockData))) return false
    }
    return true
  }
  const walkValue = async (f: LooseField, value: unknown, blockData?: Record<string, unknown>): Promise<boolean> => {
    if (value === undefined || value === null) return true
    if (f.type === 'group' && f.fields) return walk(f.fields, value, blockData)
    if (f.type === 'array' && f.fields) {
      for (const row of Array.isArray(value) ? value : []) if (!(await walk(f.fields, row, blockData))) return false
      return true
    }
    if (f.type === 'blocks') {
      const blocks = new Map<string, { slug: string; fields: LooseField[] }>()
      for (const ref of [...(f.blocks ?? []), ...(f.blockReferences ?? [])]) {
        const block = typeof ref === 'string' ? references.get(ref) : ref
        if (block) blocks.set(block.slug, block)
      }
      for (const row of Array.isArray(value) ? value : []) {
        if (!isRecord(row)) continue
        const block = blocks.get(String(row.blockType))
        if (!block) return false
        if (!(await walk(block.fields, row, row))) return false
      }
    }
    return true
  }
  if (!(await readable(root, args.value, doc))) return false
  return walkValue(root, args.value)
}

/** Why the builder refuses a user who may not read every value of a Payload blocks field. */
export const UNREADABLE_BLOCKS_MESSAGE =
  "You may not read every field of these blocks, so the builder cannot show them. Edit the page in Payload's editor."

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
/** A permission that allows: `true`, or `{ permission: true }`. */
const allowed = (value: unknown) => value === true || (isRecord(value) && value.permission === true)

/** Why the builder refuses a user who may not change a Payload blocks field. */
export const BLOCKS_NOT_EDITABLE_MESSAGE = 'You may not change the blocks of this page.'

type BlocksTarget = { collection: string; id: string | number; field: string; drafts: boolean; codec?: LayoutCodec }

/**
 * True when Payload's field access lets the request's user update the builder field. Payload drops
 * a field the user may not update from a save without an error, so the builder checks it before a
 * change, never after a save says "saved".
 */
export async function canUpdateBlocksField(req: PayloadRequest, target: BlocksTarget): Promise<boolean> {
  const collection = (req.payload.collections as Record<string, Parameters<typeof docAccessOperation>[0]['collection'] | undefined>)[target.collection]
  if (!collection) return false
  try {
    // Sanitized permissions: `true` for "everything", and a refused key is left out.
    const permissions = (await docAccessOperation({ collection, id: target.id, req })) as unknown
    if (permissions === true) return true
    if (!isRecord(permissions) || !allowed(permissions.update)) return false
    const fields = permissions.fields
    if (fields === true || fields === undefined) return true
    const field = isRecord(fields) ? fields[target.field] : undefined
    return field === true || (isRecord(field) && allowed(field.update))
  } catch {
    return false
  }
}

/**
 * The check before a request uses the live session of a Payload blocks field, or sends a layout
 * from it. Null: allowed. Always null for the builder's JSON layout.
 * - `write`: the user may update the field (Payload drops a field the user may not update from a
 *   save without an error, so this is checked before a change).
 * - Read: the user may read every value of the stored blocks and of each layout in `layouts` (the
 *   open session's layout, the layout a response sends). Payload's own `access.read` decides, on
 *   the values themselves, so a value that exists only in the live session counts too.
 * - `stored: false` skips the database read (an event stream checks each event's live layout).
 * Runs on every request: nothing is cached.
 */
export async function blocksAccessProblem(
  req: PayloadRequest,
  target: BlocksTarget,
  options: { write: boolean; layouts?: readonly (Layout | null | undefined)[]; doc?: Record<string, unknown>; stored?: boolean },
): Promise<string | null> {
  const codec = target.codec
  if (codec?.kind !== 'payload-blocks') return null
  if (options.write && !(await canUpdateBlocksField(req, target))) return BLOCKS_NOT_EDITABLE_MESSAGE
  let doc = options.doc ?? {}
  const values: unknown[] = []
  if (options.stored !== false) {
    const stored = (await req.payload.findByID({
      collection: target.collection as never,
      id: target.id,
      depth: 0,
      draft: target.drafts,
      overrideAccess: true,
      req,
    })) as Record<string, unknown>
    doc = stored
    values.push(stored[target.field])
  }
  for (const layout of options.layouts ?? []) if (layout) values.push(codec.encode(layout))
  for (const value of values) {
    if (!(await canReadBlocksValue(req, { collection: target.collection, field: target.field, id: target.id, value, doc }))) {
      return UNREADABLE_BLOCKS_MESSAGE
    }
  }
  return null
}

/**
 * Every state a batch of operations passes through, after each operation, starting from `before`.
 * A value one operation writes and a later one removes is in one of them, in its real place
 * (its block, its parent, its siblings). Null when an operation does not apply.
 */
export function statesThrough(before: Layout, ops: readonly Operation[]): Layout[] | null {
  const states: Layout[] = []
  let layout = before
  for (const op of ops) {
    const result = applyOperation(layout, op)
    if (!result.ok) return null
    layout = result.layout
    states.push(layout)
  }
  return states
}

type CommitAccess = (args: { before: Layout; after: Layout; ops: readonly Operation[]; doc: Record<string, unknown> }) => Promise<string | null>

/**
 * A Payload blocks field: the commit's access check also refuses a batch that would show the user
 * a value they may not read, in any state the batch passes through. It runs before the commit
 * changes anything, so a refused batch is not applied. The JSON layout: `access` as it is.
 */
export function withBlocksReadCheck(req: PayloadRequest, target: BlocksTarget, access?: CommitAccess): CommitAccess | undefined {
  if (target.codec?.kind !== 'payload-blocks') return access
  return async (args) => {
    const denied = access ? await access(args) : null
    if (denied) return denied
    const states = statesThrough(args.before, args.ops)
    if (!states) return UNREADABLE_BLOCKS_MESSAGE
    return blocksAccessProblem(req, target, { write: false, stored: false, layouts: states, doc: args.doc })
  }
}

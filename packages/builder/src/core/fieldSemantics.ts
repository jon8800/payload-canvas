// Payload field logic for block props: `validate`, `hooks` and `access`.
//
// Payload runs this logic only for fields it knows. Block props live inside one JSON field, so
// the plugin runs it itself (fieldHooks.ts, fieldValidate.ts, fieldAccess.ts). This module keeps
// the functions and walks block props the way Payload walks fields.
//
// The functions are read once, when the plugin starts (`captureFieldSemantics`), before Payload
// sanitizes the config. Payload changes field objects in place while it sanitizes: a field without
// `validate` gets Payload's default validator, and a rich text field gets its editor's hooks. Block
// configs reused in a Payload `blocks` field (fromPayloadBlocks) are the same objects. Reading
// them later would run Payload's defaults twice and the editor's hooks without their context.
//
// Server and client safe: no Payload imports at run time. The functions themselves need `req`, so
// only the server calls them.

import { getBlockDefinition } from './blocks'
import { conditionMet, readCondition } from './conditions'
import { isPlainObject, walkBlocks } from './tree'
import type { Block, BlockDefinition, Layout } from './types'

// The functions come from user configs, with Payload's own argument types.
type AnyFunction = (...args: any[]) => unknown

export type PropHookName = 'beforeValidate' | 'beforeChange' | 'afterChange' | 'afterRead'
export type PropAccessName = 'read' | 'update' | 'create'

/** The logic of one field, as the app's config declared it. */
export type FieldSemantics = {
  validate?: AnyFunction
  hooks: Partial<Record<PropHookName, AnyFunction[]>>
  access: Partial<Record<PropAccessName, AnyFunction>>
}

export type SemanticsFeature = PropHookName | PropAccessName | 'validate'

const HOOKS: readonly PropHookName[] = ['beforeValidate', 'beforeChange', 'afterChange', 'afterRead']
const ACCESS: readonly PropAccessName[] = ['read', 'update', 'create']

/** The field logic of every block, read once when the plugin starts. */
export type FieldRegistry = {
  /** The logic of a field object (a block field config, at any depth), or undefined. */
  of(field: unknown): FieldSemantics | undefined
  /** Block types with at least one field (at any depth) that has this feature. */
  types(feature: SemanticsFeature): ReadonlySet<string>
}

/** A registry without any field logic. */
export const EMPTY_FIELD_REGISTRY: FieldRegistry = { of: () => undefined, types: () => new Set() }

const isFunction = (value: unknown): value is AnyFunction => typeof value === 'function'

function readSemantics(field: Record<string, unknown>): FieldSemantics | null {
  const semantics: FieldSemantics = { hooks: {}, access: {} }
  let found = false
  if (isFunction(field.validate)) {
    semantics.validate = field.validate
    found = true
  }
  const hooks = isPlainObject(field.hooks) ? field.hooks : {}
  for (const name of HOOKS) {
    const list = Array.isArray(hooks[name]) ? (hooks[name] as unknown[]).filter(isFunction) : []
    if (list.length === 0) continue
    // A copy: later changes to the config object do not reach the registry.
    semantics.hooks[name] = [...list]
    found = true
  }
  const access = isPlainObject(field.access) ? field.access : {}
  for (const name of ACCESS) {
    if (!isFunction(access[name])) continue
    semantics.access[name] = access[name]
    found = true
  }
  return found ? semantics : null
}

/** Nested field lists of a field config: groups, rows, collapsibles, tabs, arrays and inline blocks. */
function childFieldLists(field: Record<string, unknown>): unknown[][] {
  const lists: unknown[][] = []
  if (Array.isArray(field.fields)) lists.push(field.fields)
  if (Array.isArray(field.tabs)) {
    for (const tab of field.tabs) if (isPlainObject(tab) && Array.isArray(tab.fields)) lists.push(tab.fields)
  }
  if (Array.isArray(field.blocks)) {
    for (const block of field.blocks) if (isPlainObject(block) && Array.isArray(block.fields)) lists.push(block.fields)
  }
  return lists
}

/**
 * Reads `validate`, `hooks` and `access` of every block field (at any depth). Call it when the
 * plugin starts: Payload's config sanitizing later adds default validators and editor hooks to
 * the same objects.
 */
export function captureFieldSemantics(blocks: readonly BlockDefinition[]): FieldRegistry {
  const map = new WeakMap<object, FieldSemantics>()
  const byFeature = new Map<SemanticsFeature, Set<string>>()
  const mark = (feature: SemanticsFeature, type: string) => {
    let set = byFeature.get(feature)
    if (!set) byFeature.set(feature, (set = new Set()))
    set.add(type)
  }
  const visit = (list: readonly unknown[], type: string, seen: Set<object>) => {
    for (const raw of list) {
      if (!isPlainObject(raw) || seen.has(raw)) continue
      seen.add(raw)
      const semantics = readSemantics(raw)
      if (semantics) {
        map.set(raw, semantics)
        if (semantics.validate) mark('validate', type)
        for (const name of HOOKS) if (semantics.hooks[name]) mark(name, type)
        for (const name of ACCESS) if (semantics.access[name]) mark(name, type)
      }
      // Tabs carry their own logic only when named; they are visited as items of `tabs`.
      if (Array.isArray(raw.tabs)) visit(raw.tabs, type, seen)
      for (const child of childFieldLists(raw)) if (child !== raw.tabs) visit(child, type, seen)
    }
  }
  for (const block of blocks) visit(block.fields as unknown[], block.type, new Set())
  const empty: ReadonlySet<string> = new Set()
  return {
    of: (field) => (isPlainObject(field) ? map.get(field) : undefined),
    types: (feature) => byFeature.get(feature) ?? empty,
  }
}

// ---------------------------------------------------------------------------
// Walking block props
// ---------------------------------------------------------------------------

/** A named field config, read loosely. */
export type PropField = Record<string, unknown> & { name: string; type: string }

/** One prop field of one block, with what Payload passes to field logic. */
export type PropFieldVisit = {
  block: Block
  def: BlockDefinition
  field: PropField
  semantics: FieldSemantics | undefined
  name: string
  /** The object that holds the value: the block's props, a group value or an array row. Mutable. */
  siblingData: Record<string, unknown>
  /** The same object in the previous layout (same block id; rows by id, else by index). */
  previousSiblingDoc: Record<string, unknown> | undefined
  /** Payload's `blockData`: the nearest block, Payload-shaped (`{ id, blockType, ...fields }`). */
  blockData: Record<string, unknown>
  /** The fields that share `siblingData`. */
  siblingFields: readonly unknown[]
  /** Path of the value inside the layout field: `['blocks', 0, 'props', 'items', 1, 'label']`. */
  path: (string | number)[]
  /** The same path as `validateLayout` writes it: `blocks[0].props.items[1].label`. */
  errorPath: string
  /** Path below the block's props: `items.1.label`. The inspector uses it. */
  propPath: string
  /** Payload's `schemaPath`: block type, then field names without indexes. */
  schemaPath: string[]
  /** The field sits directly in the block's props (not in a group, row of an array, …). */
  top: boolean
  /** The block binds this top-level prop to document data. */
  bound: boolean
  /** The field's condition (`admin.condition` or `admin.custom.builderCondition`) hides it. */
  hidden: boolean
}

export type WalkOptions = {
  blocks: readonly BlockDefinition[]
  registry: FieldRegistry
  /** The layout before the change, for `previousValue` and `previousSiblingDoc`. */
  previous?: Layout | null
  /** Only these block types (from `registry.types`). Default: every block. */
  types?: ReadonlySet<string>
  /** Values a function condition reads: the document and the user. */
  condition?: { data?: Record<string, unknown>; user?: unknown; operation?: string }
  /**
   * Only these top-level props (a locale pass visits the props with own values in that locale).
   * Default: every prop.
   */
  only?: (block: Block, name: string) => boolean
  /**
   * Called for every named prop field, parents before children. A visit may change
   * `siblingData[name]`; the walk then continues into the new value. Return `false` to skip the
   * field's children.
   */
  visit: (visit: PropFieldVisit) => void | false | Promise<void | false>
}

type Located = { block: Block; errorPath: string; path: (string | number)[] }

/** Every block with its path, in document order. */
function locatedBlocks(layout: Layout): Located[] {
  const out: Located[] = []
  const visit = (list: Block[], errorPrefix: string, pathPrefix: (string | number)[]) => {
    list.forEach((block, index) => {
      const errorPath = `${errorPrefix}[${index}]`
      const path = [...pathPrefix, index]
      out.push({ block, errorPath, path })
      for (const [name, children] of Object.entries(block.slots ?? {})) {
        if (Array.isArray(children)) visit(children, `${errorPath}.slots.${name}`, [...path, 'slots', name])
      }
    })
  }
  visit(Array.isArray(layout.blocks) ? layout.blocks : [], 'blocks', ['blocks'])
  return out
}

function blocksById(layout: Layout | null | undefined): Map<string, Block> {
  const map = new Map<string, Block>()
  if (!layout || !Array.isArray(layout.blocks)) return map
  walkBlocks(layout, (block) => {
    map.set(block.id, block)
  })
  return map
}

/** The row of `previous` that matches `row`: the same `id`, else the same index. */
function matchingRow(previous: unknown, row: Record<string, unknown>, index: number): Record<string, unknown> | undefined {
  if (!Array.isArray(previous)) return undefined
  if (typeof row.id === 'string' && row.id) {
    const found = previous.find((p) => isPlainObject(p) && p.id === row.id)
    return isPlainObject(found) ? found : undefined
  }
  const at = previous[index]
  return isPlainObject(at) ? at : undefined
}

/** Named fields that share one object: rows, collapsibles, unnamed groups and unnamed tabs are flattened. */
function sharedFields(fields: readonly unknown[]): PropField[] {
  const out: PropField[] = []
  for (const raw of fields) {
    if (!isPlainObject(raw) || typeof raw.type !== 'string') continue
    if (raw.type === 'ui' || raw.type === 'join' || raw.virtual) continue
    if (raw.type === 'row' || raw.type === 'collapsible' || (raw.type === 'group' && !raw.name)) {
      out.push(...sharedFields(Array.isArray(raw.fields) ? raw.fields : []))
      continue
    }
    if (raw.type === 'tabs') {
      for (const tab of Array.isArray(raw.tabs) ? raw.tabs : []) {
        if (!isPlainObject(tab)) continue
        const tabFields = Array.isArray(tab.fields) ? tab.fields : []
        // A named tab holds its fields in an object, like a group. The tab object stays the key.
        if (typeof tab.name === 'string' && tab.name) out.push(tab as PropField)
        else out.push(...sharedFields(tabFields))
      }
      continue
    }
    if (typeof raw.name === 'string' && raw.name) out.push(raw as PropField)
  }
  return out
}

/** A named tab has no `type`; it holds data like a group. */
const typeOf = (field: PropField): string => (typeof field.type === 'string' ? field.type : 'group')

/** False when the field's condition hides it (Payload skips validation of hidden fields). */
function conditionPasses(
  field: PropField,
  siblingData: Record<string, unknown>,
  siblings: readonly PropField[],
  ctx: { blockData: Record<string, unknown>; path: (string | number)[]; condition?: WalkOptions['condition'] },
): boolean {
  const admin = isPlainObject(field.admin) ? field.admin : undefined
  const fn = admin?.condition
  if (typeof fn === 'function') {
    try {
      return Boolean(
        fn(ctx.condition?.data ?? {}, siblingData, {
          blockData: ctx.blockData,
          operation: ctx.condition?.operation ?? 'update',
          path: ctx.path,
          user: ctx.condition?.user ?? null,
        }),
      )
    } catch {
      return true
    }
  }
  const condition = readCondition(field)
  return !condition || conditionMet(condition, siblingData, siblings as unknown as { name?: string; defaultValue?: unknown }[])
}

/**
 * Visits every named prop field of every block (nested slots included), parents before children,
 * with the arguments Payload's field logic needs. Groups, named tabs, arrays and `blocks` fields
 * inside props are walked too. Async: the visit may await field logic.
 */
export async function walkPropFields(layout: Layout, options: WalkOptions): Promise<void> {
  const previousBlocks = blocksById(options.previous)
  for (const { block, errorPath, path } of locatedBlocks(layout)) {
    if (options.types && !options.types.has(block.type)) continue
    const def = getBlockDefinition(options.blocks, block.type)
    if (!def || def.fields.length === 0) continue
    const hadProps = isPlainObject(block.props)
    const props: Record<string, unknown> = hadProps ? (block.props as Record<string, unknown>) : {}
    const previous = previousBlocks.get(block.id)
    const blockData: Record<string, unknown> = { ...props, id: block.id, blockType: def.payload?.slug ?? block.type }
    const bound = new Set(Object.keys(block.bindings ?? {}).map((key) => key.split('.')[0]))
    await walkFields(def.fields as unknown[], props, isPlainObject(previous?.props) ? previous.props : undefined, {
      block,
      def,
      blockData,
      bound,
      errorPath: `${errorPath}.props`,
      path: [...path, 'props'],
      propPath: [],
      schemaPath: [block.type],
      top: true,
      hiddenParent: false,
      options,
    })
    // A hook may give a block without props its first value.
    if (!hadProps && Object.keys(props).length > 0) block.props = props
  }
}

type FieldsCtx = {
  block: Block
  def: BlockDefinition
  blockData: Record<string, unknown>
  bound: ReadonlySet<string>
  errorPath: string
  path: (string | number)[]
  propPath: (string | number)[]
  schemaPath: string[]
  top: boolean
  hiddenParent: boolean
  options: WalkOptions
}

async function walkFields(
  fields: readonly unknown[],
  data: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
  ctx: FieldsCtx,
): Promise<void> {
  const list = sharedFields(fields)
  for (const field of list) {
    const name = field.name
    if (ctx.top && ctx.options.only && !ctx.options.only(ctx.block, name)) continue
    const path = [...ctx.path, name]
    const visit: PropFieldVisit = {
      block: ctx.block,
      def: ctx.def,
      field,
      semantics: ctx.options.registry.of(field),
      name,
      siblingData: data,
      previousSiblingDoc: previous,
      blockData: ctx.blockData,
      siblingFields: list,
      path,
      errorPath: `${ctx.errorPath}.${name}`,
      propPath: [...ctx.propPath, name].join('.'),
      schemaPath: [...ctx.schemaPath, name],
      top: ctx.top,
      bound: ctx.top && ctx.bound.has(name),
      hidden: ctx.hiddenParent || !conditionPasses(field, data, list, { blockData: ctx.blockData, path, condition: ctx.options.condition }),
    }
    if ((await ctx.options.visit(visit)) === false) continue
    const value = data[name]
    const before = previous?.[name]
    const child = (extra: Partial<FieldsCtx>): FieldsCtx => ({
      ...ctx,
      errorPath: visit.errorPath,
      path,
      propPath: [...ctx.propPath, name],
      schemaPath: visit.schemaPath,
      top: false,
      hiddenParent: visit.hidden,
      ...extra,
    })
    switch (typeOf(field)) {
      case 'group':
        if (isPlainObject(value)) await walkFields(childFields(field), value, isPlainObject(before) ? before : undefined, child({}))
        break
      case 'array':
        if (!Array.isArray(value)) break
        for (let i = 0; i < value.length; i++) {
          const row = value[i]
          if (!isPlainObject(row)) continue
          await walkFields(
            childFields(field),
            row,
            matchingRow(before, row, i),
            child({ errorPath: `${visit.errorPath}[${i}]`, path: [...path, i], propPath: [...ctx.propPath, name, i] }),
          )
        }
        break
      case 'blocks': {
        if (!Array.isArray(value)) break
        const variants = (Array.isArray(field.blocks) ? field.blocks : []).filter(
          (b): b is Record<string, unknown> & { slug: string; fields: unknown[] } =>
            isPlainObject(b) && typeof b.slug === 'string' && Array.isArray(b.fields),
        )
        for (let i = 0; i < value.length; i++) {
          const row = value[i]
          if (!isPlainObject(row)) continue
          const variant = variants.find((b) => b.slug === row.blockType)
          if (!variant) continue
          await walkFields(
            variant.fields,
            row,
            matchingRow(before, row, i),
            child({
              blockData: row,
              errorPath: `${visit.errorPath}[${i}]`,
              path: [...path, i],
              propPath: [...ctx.propPath, name, i],
              schemaPath: [...visit.schemaPath, variant.slug],
            }),
          )
        }
        break
      }
      default:
        break
    }
  }
}

const childFields = (field: PropField): unknown[] => (Array.isArray(field.fields) ? field.fields : [])

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** Deep equality for JSON values. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const other = b as unknown[]
    return a.length === other.length && a.every((v, i) => sameJson(v, other[i]))
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  return ka.length === kb.length && ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** Block types that need a walk for any of these features. */
export function typesWith(registry: FieldRegistry, ...features: SemanticsFeature[]): Set<string> {
  const out = new Set<string>()
  for (const feature of features) for (const type of registry.types(feature)) out.add(type)
  return out
}

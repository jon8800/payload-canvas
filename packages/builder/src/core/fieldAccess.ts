// Field-level `access` of block props (`read`, `update`, `create`), the way Payload applies it to
// its own fields:
// - read: a prop the user may not read is left out of what the API returns.
// - update (create for a new document): a change to a prop the user may not change is refused
//   (live edits) or dropped (other saves, as Payload drops it).
// `overrideAccess` skips all of it, as in Payload.

import type { FieldRunContext } from './fieldHooks'
import { sameJson, typesWith, walkPropFields, type FieldRegistry, type PropAccessName, type PropFieldVisit } from './fieldSemantics'
import { eachLocalePass } from './locale'
import { isPlainObject, walkBlocks } from './tree'
import type { Block, BlockDefinition, Layout, LocaleSettings } from './types'

/** A prop change the user may not make. `locale`: the change is to that locale's own value. */
export type PropDenial = { blockId: string; path: string; propPath: string; field: string; label: string; locale?: string }

type AccessOptions = {
  blocks: readonly BlockDefinition[]
  registry: FieldRegistry
  ctx: FieldRunContext
  /**
   * With locales, the access of localized props also applies to each locale's own values (a
   * translation is a change of that prop). Leave it out for a layout that is one locale's view.
   */
  localization?: LocaleSettings | null
}

type Walk = { layout: Layout; previous: Layout | null | undefined; only?: (block: Block, name: string) => boolean; locale?: string }

/**
 * The walks one check needs: the layout itself, then (with `localization`) one per locale with
 * own values, on that locale's view. Changes a walk makes to a view go back into `layout`.
 */
async function eachWalk(layout: Layout, before: Layout | null | undefined, options: AccessOptions, fn: (walk: Walk) => Promise<void>): Promise<void> {
  await fn({ layout, previous: before })
  if (options.localization === undefined) return
  await eachLocalePass(layout, { blocks: options.blocks, localization: options.localization, before }, (pass) =>
    fn({ layout: pass.view, previous: pass.before, only: pass.only, locale: pass.locale }),
  )
}

/** True when any block field has field-level access of this kind. */
export function hasPropAccess(registry: FieldRegistry, kind: PropAccessName): boolean {
  return registry.types(kind).size > 0
}

function labelText(field: Record<string, unknown>, name: string): string {
  const label = field.label
  if (typeof label === 'string' && label) return label
  if (isPlainObject(label)) {
    const first = typeof label.en === 'string' ? label.en : Object.values(label).find((v) => typeof v === 'string')
    if (typeof first === 'string' && first) return first
  }
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)

/** Calls one access function with Payload's arguments. Errors count as "no". */
async function allowed(
  kind: PropAccessName,
  v: PropFieldVisit,
  ctx: FieldRunContext,
  docs: { data: Record<string, unknown>; doc: Record<string, unknown> | undefined },
): Promise<boolean> {
  const fn = v.semantics?.access[kind]
  if (!fn) return true
  try {
    return Boolean(
      await fn({ id: ctx.id, blockData: v.blockData, data: docs.data, doc: docs.doc, req: ctx.req, siblingData: v.siblingData }),
    )
  } catch {
    return false
  }
}

/** The JSON of every value an access-controlled prop has in `layout`, per field object. */
async function knownValues(layout: Layout | null | undefined, options: AccessOptions, kind: PropAccessName): Promise<WeakMap<object, Set<string>>> {
  const known = new WeakMap<object, Set<string>>()
  if (!layout) return known
  // Every locale's values count: pasting a block copies its translations too. A copy, so the walk never writes back.
  await eachWalk(options.localization === undefined ? layout : structuredClone(layout), null, options, (walk) =>
    walkPropFields(walk.layout, {
      blocks: options.blocks,
      registry: options.registry,
      types: typesWith(options.registry, kind),
      only: walk.only,
      visit: (v) => {
        if (!v.semantics?.access[kind]) return
        const value = v.siblingData[v.name]
        if (value === undefined) return
        let set = known.get(v.field)
        if (!set) known.set(v.field, (set = new Set()))
        set.add(JSON.stringify(value))
      },
    }),
  )
  return known
}

function blockIds(layout: Layout | null | undefined): Set<string> {
  const ids = new Set<string>()
  if (!layout || !Array.isArray(layout.blocks)) return ids
  walkBlocks(layout, (block) => {
    ids.add(block.id)
  })
  return ids
}

type ChangeArgs = AccessOptions & {
  /** The layout before the change (the session's, or the saved document's). */
  before: Layout | null | undefined
  /** The document without the layout, for the access functions' `data` and `doc`. */
  doc?: Record<string, unknown> | null
  /** What to do with a refused change: report it, or report it and put the old value back. */
  revert: boolean
}

/**
 * Finds prop changes from `before` to `after` the user may not make (`access.update`, or
 * `access.create` when `ctx.operation` is `create`). A new block may hold such a prop only empty,
 * at its default value, or with a value the page already has (a copy, a duplicate). With
 * `revert`, refused values go back to `before` in `after` (in place).
 */
async function checkChanges(after: Layout, args: ChangeArgs): Promise<PropDenial[]> {
  const kind: PropAccessName = args.ctx.operation === 'create' ? 'create' : 'update'
  if (!hasPropAccess(args.registry, kind)) return []
  const existing = blockIds(args.before)
  const known = await knownValues(args.before, args, kind)
  const field = args.ctx.layoutField
  const docs = {
    data: { ...args.doc, [field]: after },
    doc: args.before ? { ...args.doc, [field]: args.before } : (args.doc ?? undefined),
  }
  const denials: PropDenial[] = []
  // Without `revert`, a copy: the locale passes must not write back.
  const target = args.revert || args.localization === undefined ? after : structuredClone(after)
  await eachWalk(target, args.before, args, (walk) =>
    walkPropFields(walk.layout, {
      blocks: args.blocks,
      registry: args.registry,
      previous: walk.previous,
      types: typesWith(args.registry, kind),
      only: walk.only,
      visit: async (v) => {
        if (!v.semantics?.access[kind]) return
        const value = v.siblingData[v.name]
        const old = v.previousSiblingDoc?.[v.name]
        let changed: boolean
        if (v.previousSiblingDoc !== undefined || (v.top && existing.has(v.block.id))) {
          // The same block (and row) existed: any difference is a change.
          changed = !sameJson(value, old)
        } else {
          // A new block or row: a copy of a value on the page, or the default, is not a change.
          const defaultValue = typeof v.field.defaultValue === 'function' ? undefined : v.field.defaultValue
          changed = !isEmpty(value) && !sameJson(value, defaultValue) && !known.get(v.field)?.has(JSON.stringify(value))
        }
        if (!changed || (await allowed(kind, v, args.ctx, docs))) return
        denials.push({
          blockId: v.block.id,
          path: v.errorPath,
          propPath: v.propPath,
          field: v.name,
          label: labelText(v.field, v.name),
          ...(walk.locale ? { locale: walk.locale } : {}),
        })
        if (!args.revert) return false
        if (old === undefined) delete v.siblingData[v.name]
        else v.siblingData[v.name] = structuredClone(old)
        return false
      },
    }),
  )
  return denials
}

/** Prop changes the user may not make. Nothing changes. For live edits, which are refused as a whole. */
export function deniedPropChanges(after: Layout, args: Omit<ChangeArgs, 'revert'>): Promise<PropDenial[]> {
  return checkChanges(after, { ...args, revert: false })
}

/**
 * For saves outside the live session (REST, Local API, the Edit view): changes the user may not
 * make go back to the saved value, the way Payload drops a field the user may not update. Props
 * the user may not read are missing from what that user loaded; they get their saved value back
 * instead of being deleted. Changes `after` in place and returns what it put back.
 */
export async function enforcePropAccess(after: Layout, args: Omit<ChangeArgs, 'revert'>): Promise<PropDenial[]> {
  const denials = await checkChanges(after, { ...args, revert: true })
  if (!hasPropAccess(args.registry, 'read') || !args.before) return denials
  const field = args.ctx.layoutField
  const docs = { data: { ...args.doc, [field]: after }, doc: { ...args.doc, [field]: args.before } }
  await eachWalk(after, args.before, args, (walk) =>
    walkPropFields(walk.layout, {
      blocks: args.blocks,
      registry: args.registry,
      previous: walk.previous,
      types: typesWith(args.registry, 'read'),
      only: walk.only,
      visit: async (v) => {
        if (!v.semantics?.access.read) return
        const old = v.previousSiblingDoc?.[v.name]
        if (v.siblingData[v.name] !== undefined || old === undefined) return
        if (await allowed('read', v, args.ctx, docs)) return
        v.siblingData[v.name] = structuredClone(old)
        return false
      },
    }),
  )
  return denials
}

/**
 * Removes the props the user may not read (`access.read`), in place. For the API output.
 * Returns true when it removed something.
 */
export async function filterUnreadableProps(
  layout: Layout,
  args: AccessOptions & { doc?: Record<string, unknown> | null },
): Promise<boolean> {
  if (!hasPropAccess(args.registry, 'read')) return false
  const docs = { data: { ...args.doc }, doc: args.doc ?? undefined }
  let removed = false
  await eachWalk(layout, null, args, (walk) =>
    walkPropFields(walk.layout, {
      blocks: args.blocks,
      registry: args.registry,
      types: typesWith(args.registry, 'read'),
      only: walk.only,
      visit: async (v) => {
        if (!v.semantics?.access.read || v.siblingData[v.name] === undefined) return
        if (await allowed('read', v, args.ctx, docs)) return
        delete v.siblingData[v.name]
        removed = true
        return false
      },
    }),
  )
  return removed
}

/** How every refused-change message starts. The editor shows such a message as it is. */
export const ACCESS_DENIED_PREFIX = 'You cannot change '

/** One sentence for refused live edits: "You cannot change Internal note (Hero). Nothing was applied." */
export function denialMessage(denials: readonly PropDenial[], blockName: (blockId: string) => string): string {
  const parts = [...new Set(denials.map((d) => `${d.label} (${blockName(d.blockId)})`))]
  const list = parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
  return `${ACCESS_DENIED_PREFIX}${list}. Nothing was applied.`
}

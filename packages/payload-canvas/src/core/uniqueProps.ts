// Text props that must differ between the blocks of one scope (`BlockDefinition.uniqueProps`), such
// as the `name` of a form field: two fields with one name would overwrite each other's answers. A
// block with `uniqueScope` (a Form block) is a scope of its own: its fields differ from each other,
// not from the fields of another form. The rest of the layout is one scope.

import { getBlockDefinition } from './blocks'
import { indexLayout } from './tree'
import type { Block, BlockDefinition, Layout } from './types'

const isScope = (definitions: readonly BlockDefinition[], type: string) => getBlockDefinition(definitions, type)?.uniqueScope === true

/**
 * The values in use, per prop name, of every unique prop in `blocks` (at every depth), without
 * the blocks inside a nested scope (a Form block's fields belong to that form).
 */
export function uniquePropValues(blocks: readonly Block[], definitions: readonly BlockDefinition[], taken = new Map<string, Set<string>>()) {
  for (const block of blocks) {
    for (const prop of getBlockDefinition(definitions, block.type)?.uniqueProps ?? []) {
      const value = block.props?.[prop]
      if (typeof value !== 'string' || !value) continue
      if (!taken.has(prop)) taken.set(prop, new Set())
      taken.get(prop)!.add(value)
    }
    if (isScope(definitions, block.type)) continue
    for (const list of Object.values(block.slots ?? {})) uniquePropValues(list, definitions, taken)
  }
  return taken
}

/**
 * The id of the scope a block placed in `parentId` belongs to: the nearest block with `uniqueScope`
 * from `parentId` up (itself included), else null (the layout's own scope).
 */
export function uniqueScopeOf(layout: Layout, parentId: string | null, definitions: readonly BlockDefinition[]): string | null {
  const index = indexLayout(layout)
  for (let id = parentId; id !== null; ) {
    const entry = index.get(id)
    if (!entry) return null
    if (isScope(definitions, entry.block.type)) return id
    id = entry.parentId
  }
  return null
}

/**
 * The values in use in the scope of a position: a block placed in `parentId` must not reuse them.
 * Inside a Form block: that form's fields only.
 */
export function uniquePropValuesAt(layout: Layout, parentId: string | null, definitions: readonly BlockDefinition[]) {
  const scope = uniqueScopeOf(layout, parentId, definitions)
  if (scope === null) return uniquePropValues(layout.blocks, definitions)
  const owner = indexLayout(layout).get(scope)?.block
  const taken = new Map<string, Set<string>>()
  for (const list of Object.values(owner?.slots ?? {})) uniquePropValues(list, definitions, taken)
  return taken
}

/** `value`, or the first of `value2`, `value3`, … that is not in `taken`. */
export function freeValue(value: string, taken: ReadonlySet<string>): string {
  if (!taken.has(value)) return value
  const base = value.replace(/\d+$/, '')
  for (let n = 2; ; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`
}

/**
 * The block with a free value for each of its unique props (inside its slots too) that `taken`
 * already holds. Adds the values it keeps to `taken`. Returns the same block when nothing clashes.
 * The children of a block with `uniqueScope` only need to differ from each other.
 */
export function withUniqueProps(block: Block, definitions: readonly BlockDefinition[], taken: Map<string, Set<string>>): Block {
  let result = block
  for (const prop of getBlockDefinition(definitions, block.type)?.uniqueProps ?? []) {
    const value = result.props?.[prop]
    if (typeof value !== 'string' || !value) continue
    if (!taken.has(prop)) taken.set(prop, new Set())
    const used = taken.get(prop)!
    const free = freeValue(value, used)
    used.add(free)
    if (free !== value) result = { ...result, props: { ...result.props, [prop]: free } }
  }
  if (result.slots) {
    const inner = isScope(definitions, block.type) ? new Map<string, Set<string>>() : taken
    let changed = false
    const slots = Object.fromEntries(
      Object.entries(result.slots).map(([name, list]) => {
        const next = list.map((child) => withUniqueProps(child, definitions, inner))
        if (next.some((child, i) => child !== list[i])) changed = true
        return [name, next]
      }),
    )
    if (changed) result = { ...result, slots }
  }
  return result
}

/** One block whose unique prop repeats the value of an earlier block in its scope. */
export type UniquePropClash = { blockId: string; prop: string; value: string }

/** The blocks that repeat a unique prop's value in their scope (the second and later ones), in tree order. */
export function uniquePropClashes(layout: Layout, definitions: readonly BlockDefinition[]): UniquePropClash[] {
  const out: UniquePropClash[] = []
  const visit = (list: readonly Block[], taken: Map<string, Set<string>>) => {
    for (const block of list) {
      for (const prop of getBlockDefinition(definitions, block.type)?.uniqueProps ?? []) {
        const value = block.props?.[prop]
        if (typeof value !== 'string' || !value) continue
        if (!taken.has(prop)) taken.set(prop, new Set())
        if (taken.get(prop)!.has(value)) out.push({ blockId: block.id, prop, value })
        else taken.get(prop)!.add(value)
      }
      const inner = isScope(definitions, block.type) ? new Map<string, Set<string>>() : taken
      for (const children of Object.values(block.slots ?? {})) visit(children, inner)
    }
  }
  visit(layout.blocks, new Map())
  return out
}

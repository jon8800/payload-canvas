// Text props that must differ between the blocks of a layout (`BlockDefinition.uniqueProps`), such
// as the `name` of a form field: two fields with one name would overwrite each other's answers.

import { getBlockDefinition } from './blocks'
import type { Block, BlockDefinition } from './types'

/** The values in use, per prop name, of every unique prop in `blocks` (at every depth). */
export function uniquePropValues(blocks: readonly Block[], definitions: readonly BlockDefinition[], taken = new Map<string, Set<string>>()) {
  for (const block of blocks) {
    for (const prop of getBlockDefinition(definitions, block.type)?.uniqueProps ?? []) {
      const value = block.props?.[prop]
      if (typeof value !== 'string' || !value) continue
      if (!taken.has(prop)) taken.set(prop, new Set())
      taken.get(prop)!.add(value)
    }
    for (const list of Object.values(block.slots ?? {})) uniquePropValues(list, definitions, taken)
  }
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
    let changed = false
    const slots = Object.fromEntries(
      Object.entries(result.slots).map(([name, list]) => {
        const next = list.map((child) => withUniqueProps(child, definitions, taken))
        if (next.some((child, i) => child !== list[i])) changed = true
        return [name, next]
      }),
    )
    if (changed) result = { ...result, slots }
  }
  return result
}

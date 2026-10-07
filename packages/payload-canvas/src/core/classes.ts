import { walkBlocks } from './tree'
import type { BlockDefinition, Layout } from './types'

function addClasses(target: Set<string>, value: string): void {
  for (const name of value.split(/\s+/)) {
    if (name) target.add(name)
  }
}

/**
 * Every distinct class the layout needs, sorted: each block's `className` (hidden blocks too),
 * plus `BlockDefinition.classes` of every block type in the layout when `blocks` is given.
 */
export function collectClasses(layout: Layout, blocks?: readonly BlockDefinition[]): string[] {
  const classes = new Set<string>()
  const types = new Set<string>()
  walkBlocks(layout, (block) => {
    types.add(block.type)
    if (typeof block.className === 'string') addClasses(classes, block.className)
  })
  for (const definition of blocks ?? []) {
    if (!types.has(definition.type) || !Array.isArray(definition.classes)) continue
    for (const value of definition.classes) {
      if (typeof value === 'string') addClasses(classes, value)
    }
  }
  return [...classes].toSorted()
}

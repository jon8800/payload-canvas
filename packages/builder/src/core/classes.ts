import { walkBlocks } from './tree'
import type { Layout } from './types'

/** Every distinct class used in the layout (including hidden blocks), sorted. */
export function collectClasses(layout: Layout): string[] {
  const classes = new Set<string>()
  walkBlocks(layout, (block) => {
    if (typeof block.className !== 'string') return
    for (const name of block.className.split(/\s+/)) {
      if (name) classes.add(name)
    }
  })
  return [...classes].toSorted()
}

import type { Block, Layout } from './types'

/** Where a block sits. `parentId: null` means the root list. */
export type BlockLocation = { parentId: string | null; slot: string; index: number; depth: number }

export function findBlock(layout: Layout, id: string): Block | null {
  throw new Error('not implemented')
}

export function findLocation(layout: Layout, id: string): BlockLocation | null {
  throw new Error('not implemented')
}

/** Depth-first walk. Return `false` from `fn` to skip a block's children. */
export function walkBlocks(
  layout: Layout,
  fn: (block: Block, location: BlockLocation) => void | false,
): void {
  throw new Error('not implemented')
}

export function isSelfOrDescendant(layout: Layout, ancestorId: string, id: string | null): boolean {
  throw new Error('not implemented')
}

/** Turns any stored value (null, old shapes, garbage) into a valid Layout. Never throws. */
export function normalizeLayout(value: unknown): Layout {
  throw new Error('not implemented')
}

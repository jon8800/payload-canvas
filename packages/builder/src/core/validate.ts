import type { BlockDefinition, Layout } from './types'

export type LayoutError = { blockId?: string; path: string; message: string }

/** Checks structure, unique ids, known block types, slot rules and prop types. */
export function validateLayout(layout: unknown, blocks: BlockDefinition[]): LayoutError[] {
  throw new Error('not implemented')
}

import type { BlockDefinition } from './types'

export function defineBlock<T extends BlockDefinition>(def: T): T {
  return def
}

export function getBlockDefinition(blocks: BlockDefinition[], type: string): BlockDefinition | undefined {
  return blocks.find((b) => b.type === type)
}

/** Slot names of a block type, in declared order. */
export function slotNames(def: BlockDefinition | undefined): string[] {
  return def?.slots ? Object.keys(def.slots) : []
}

import type { BlockDefinition, SlotDefinition } from './types'

/** True when the slot accepts the block type. `allow` undefined or containing "*" accepts any type. */
export function slotAccepts(slot: SlotDefinition, type: string): boolean {
  return !slot.allow || slot.allow.includes('*') || slot.allow.includes(type)
}

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

/**
 * Name of the hidden, virtual richText field the plugin adds next to a layout field. The block
 * inspector points Payload's Lexical editor (`RenderLexical`) at it, so rich text props use the
 * app's own editor config. It stores nothing.
 */
export function richTextFieldName(layoutField: string): string {
  return `${layoutField}RichText`
}

import type { BlockDefinition } from './types'

/** JSON Schema (draft 2020-12) for one block, generated from its Payload field configs. */
export function blockJsonSchema(def: BlockDefinition, all: BlockDefinition[]): Record<string, unknown> {
  throw new Error('not implemented')
}

/** JSON Schema for a whole Layout with the given blocks. */
export function layoutJsonSchema(blocks: BlockDefinition[]): Record<string, unknown> {
  throw new Error('not implemented')
}

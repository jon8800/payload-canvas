import type { BlockDefinition } from '../core/types'

export type DefaultBlocksOptions = {
  /** Upload collection for the image block. Default "media". */
  mediaCollection?: string
}

/** The built-in blocks: stack, grid, heading, text, image. */
export function defaultBlocks(options?: DefaultBlocksOptions): BlockDefinition[] {
  throw new Error('not implemented')
}

// What the editor's layout field can store. A Payload blocks field holds its blocks' fields only;
// the editor refuses an own edit it could not save, as the server does (core/payloadBlocks.ts).
// Pure, safe in the admin and in tests.

import { payloadBlocksProblems } from '../../core/payloadBlocks'
import type { BuilderClientConfig, Layout } from '../../core/types'

/**
 * For a Payload blocks field (`config.storage`): what a layout holds that the field cannot store,
 * as one message, else null. The server refuses the same (core/payloadBlocks.ts). Null for the
 * builder's JSON layout, which stores everything.
 */
export function storageProblemOf(config: BuilderClientConfig): ((layout: Layout) => string | null) | null {
  if (config.storage !== 'payload-blocks') return null
  const storage = { blocks: config.blocks, rootTypes: config.payloadRootTypes ?? config.blocks.map((b) => b.type) }
  return (layout) => payloadBlocksProblems(layout, storage)[0] ?? null
}

// Client-safe entry: `@payload-toolkit/builder/blocks`. Block definitions are plain data, so the
// site, the canvas iframe and payload.config.ts can all import the same blocks list.
// No `node:` imports and no Payload runtime imports here (type imports only). A test checks it.

export { defaultBlocks, type DefaultBlocksOptions } from './defaults'
export { isLinkField, linkField, type BuilderCondition, type LinkFieldOptions } from './link'
export { defineBlock } from '../core/blocks'
export type {
  Block,
  BlockDefinition,
  BlockProps,
  Layout,
  SectionDefinition,
  SlotDefinition,
} from '../core/types'

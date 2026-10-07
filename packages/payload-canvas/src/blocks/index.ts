// Client-safe entry: `payload-canvas/blocks`. Block definitions are plain data, so the
// site, the canvas iframe and payload.config.ts can all import the same blocks list.
// No `node:` imports and no Payload runtime imports here (type imports only). A test checks it.

export { defaultBlocks, FIELD_CLASS_MAP, MENU_CLASS_MAP, type DefaultBlocksOptions } from './defaults'
export { isLinkField, linkField, type BuilderCondition, type LinkFieldOptions } from './link'
export { fromPayloadBlocks, type FromPayloadBlocksOptions, type PayloadBlockOverride } from './payload'
export { defineBlock } from '../core/blocks'
export { BUILDER_CSS_CLASS, withBuilderCssClass } from '../css/marker'
export type {
  Block,
  BlockDefinition,
  BlockProps,
  Layout,
  SectionDefinition,
  SlotDefinition,
} from '../core/types'

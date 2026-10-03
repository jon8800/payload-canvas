// Public core API: pure functions, safe on the server, in the admin and in the canvas iframe.
// Owner: core agent. Signatures here are the contract other parts build against.

export * from './types'
export { createId } from './ids'
export { findBlock, findLocation, walkBlocks, isSelfOrDescendant, normalizeLayout, type BlockLocation } from './tree'
export { applyOperation, applyOperations } from './operations'
export { deepestBlockAt, canvasDropTarget, outlineDropTarget } from './dropTarget'
export { collectClasses } from './classes'
export { blockJsonSchema, layoutJsonSchema } from './schema'
export { validateLayout, type LayoutError, type LayoutErrorCode } from './validate'
export { defineBlock, getBlockDefinition, slotNames } from './blocks'
export * from './styles'
export * from './bindings'

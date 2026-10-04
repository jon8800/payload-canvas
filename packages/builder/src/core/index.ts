// Public core API: pure functions, safe on the server, in the admin and in the canvas iframe.
// Owner: core agent. Signatures here are the contract other parts build against.

export * from './types'
export { createId } from './ids'
export { findBlock, findLocation, walkBlocks, isSelfOrDescendant, normalizeLayout, type BlockLocation } from './tree'
export { applyOperation, applyOperations, type ApplyOptions } from './operations'
export { deepestBlockAt, canvasDropTarget, outlineDropTarget } from './dropTarget'
export { collectClasses } from './classes'
export { blockJsonSchema, layoutJsonSchema } from './schema'
export { validateLayout, isBlockingError, isLayoutWarning, PUBLISH_ONLY_CODES, type LayoutError, type LayoutErrorCode } from './validate'
export * from './styles'
export * from './bindings'
export { blockName, defineBlock, getBlockDefinition, placementError, slotAccepts, slotAcceptsAt, slotNames } from './blocks'
export { FORMATS, formatProblem, isPlayableVideoUrl, parseVideoUrl, videoUrlProblem, type FormatCheck, type VideoEmbed, type VideoOptions } from './formats'
export { describeLayoutErrors, summarizeProblems, type LayoutIssue } from './issues'

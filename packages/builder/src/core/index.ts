// Public core API: pure functions, safe on the server, in the admin and in the canvas iframe.
// Owner: core agent. Signatures here are the contract other parts build against.

export * from './types'
export { createId } from './ids'
export { findBlock, findLocation, walkBlocks, isSelfOrDescendant, normalizeLayout, type BlockLocation } from './tree'
export { applyOperation, applyOperations, type ApplyOptions } from './operations'
export { deepestBlockAt, canvasDropTarget, outlineDropTarget } from './dropTarget'
export { collectClasses } from './classes'
export { blockJsonSchema, layoutJsonSchema } from './schema'
export { validateLayout, isBlockingError, isLayoutWarning, PUBLISH_ONLY_CODES, type LayoutError, type LayoutErrorCode, type ValidateOptions } from './validate'
export {
  createLocaleView,
  fallbackChain,
  hasLocaleValues,
  hasLocalizedProps,
  hasOwnValue,
  knownLocale,
  localeLabel,
  localeSettingsOf,
  localesIn,
  localizedKeys,
  localizedValue,
  localizeOperations,
  mergeLocaleView,
  ownValue,
  resolveLayoutLocale,
  stampLocale,
  untranslatedKeys,
  type FallbackLocale,
} from './locale'
export * from './styles'
export * from './bindings'
export { TEXT_LIST_BLOCK, TEXT_LIST_ITEM_BLOCK, TEXT_LIST_SLOT, joinListItem, splitListItem, type ListItemEdit } from './textList'
export { blockName, defineBlock, fitsParent, getBlockDefinition, placementError, slotAccepts, slotAcceptsAt, slotNames, starterSlots } from './blocks'
export { FORMATS, formatProblem, isPlayableVideoUrl, parseVideoUrl, videoUrlProblem, type FormatCheck, type VideoEmbed, type VideoOptions } from './formats'
export { describeLayoutErrors, summarizeProblems, type LayoutIssue } from './issues'
export { conditionFromFunction, conditionMet, readCondition, type BuilderCondition } from './conditions'
export {
  convertPayloadBlocksLayout,
  definitionForBlockType,
  isPayloadBlocksValue,
  payloadSlugOf,
  toPayloadBlock,
  withFieldDefaults,
  type ConvertPayloadOptions,
  type PayloadBlockData,
  type PayloadConversion,
  type PayloadConversionReport,
} from './convertPayload'
export { collectReferences, readReferences, referenceKey, referenceTargets, sameReferences, type Reference, type ReferenceTargets } from './references'

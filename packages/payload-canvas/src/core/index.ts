// Public core API: pure functions, safe on the server, in the admin and in the canvas iframe.
// Owner: core agent. Signatures here are the contract other parts build against.

export * from './types'
export { checkAttrs, htmlAttributes, htmlIdClash, htmlIdProblem, htmlIdsOf, patchAttrs, withoutTakenHtmlIds } from './attrs'
export { createId } from './ids'
export { freeValue, uniquePropClashes, uniquePropValues, uniquePropValuesAt, uniqueScopeOf, withUniqueProps, type UniquePropClash } from './uniqueProps'
export { newBlockOf } from './starter'
export { findBlock, findLocation, walkBlocks, isSelfOrDescendant, normalizeLayout, type BlockLocation } from './tree'
export { applyOperation, applyOperations, type ApplyOptions } from './operations'
export { layerAt, reachableAt } from './layers'
export { acceptingSlots, type AcceptingSlot, deepestBlockAt, canvasDropTarget, outlineDropTarget } from './dropTarget'
export { blockParts, type BlockPart, collectClasses, defaultPartClassNames, partClassNameOf } from './classes'
export { headingId, richTextHeadings, type RichTextHeading } from './headings'
export { blockJsonSchema, layoutJsonSchema } from './schema'
export { validateLayout, isBlockingError, isLayoutWarning, PUBLISH_ONLY_CODES, type LayoutError, type LayoutErrorCode, type ValidateOptions } from './validate'
export {
  blockInLocale,
  createLocaleView,
  fallbackChain,
  hasLocaleValues,
  hasLocalizedProps,
  hasOwnValue,
  knownLocale,
  localeLabel,
  localeSettingsOf,
  localeWithValue,
  localesIn,
  localizedKeys,
  localizedValue,
  localizeOperations,
  mergeLocaleView,
  missingDefaultKeys,
  ownValue,
  resolveLayoutLocale,
  stampLocale,
  untranslatedKeys,
  type FallbackLocale,
} from './locale'
export * from './styles'
export * from './motion'
export * from './bindings'
export * from './visibility'
export * from './components'
export { TEXT_LIST_BLOCK, TEXT_LIST_ITEM_BLOCK, TEXT_LIST_SLOT, joinListItem, splitListItem, type ListItemEdit } from './textList'
export { ancestorsError, blockName, defineBlock, defineSection, type SectionBlockInput, type SectionInput, fitsParent, getBlockDefinition, placementError, upgradeLayout, checkSectionVariants, sectionsWithDefaultClassNames, sectionsWithVariants, slotAccepts, slotAcceptsAt, slotNames, starterSlots, withDefaultClasses, withDefaultClassNames, withInlineBlocks } from './blocks'
export {
  carryContent,
  DEFAULT_VARIANT_LABEL,
  findSection,
  findSectionVersion,
  hasVariants,
  listedVariants,
  sectionVersion,
  sectionVersions,
  switchSectionVariant,
  versionIndex,
  withoutSectionOrigin,
  withSectionOrigin,
  type SectionVersion,
  type VariantSwitch,
} from './sections'
export { checkSectionOrigin } from './sectionOrigin'
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
  withLayoutDefaults,
  hasStaticDefault,
  type ConvertPayloadOptions,
  type PayloadBlockData,
  type PayloadConversion,
  type PayloadConversionReport,
} from './convertPayload'
export {
  decodePayloadBlocks,
  encodePayloadBlocks,
  payloadBlocksProblems,
  payloadBlocksStorage,
  type PayloadBlocksDecode,
  type PayloadBlocksStorage,
} from './payloadBlocks'
export { dataFields, fieldAtPropPath, type DataField } from './fields'
export { rowLabel } from './rowLabel'
export {
  pathWithoutIndexes,
  regionAccessAt,
  regionDefinition,
  regionFieldOf,
  regionSelect,
  regionsTouched,
  regionType,
  regionValues,
  resolveRegions,
  setDocPath,
  valueAtDocPath,
  type RegionOption,
} from './regions'
export { collectReferences, fieldReferences, readReferences, referenceKey, referenceTargets, sameReferences, type Reference, type ReferenceTargets } from './references'

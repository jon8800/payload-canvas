// Server entry: the Payload plugin and block helpers. Owner: plugin agent.
export {
  websiteBuilder,
  cssFieldName,
  BUILDER_VIEW_KEY,
  BUILDER_VIEW_PATH,
  type WebsiteBuilderOptions,
  type BuilderCollectionOptions,
  type GeneratedCss,
  type TemplatesOptions,
  type FontFamilies,
  SITE_CSS_KEY,
  siteCssConfigOf,
  type SiteCssConfig,
} from './plugin'
export { bindingSources, templatesConfigOf, TEMPLATES_CONFIG_KEY } from './plugin/templates'
export {
  backfillReferences,
  DEFAULT_REFERENCES_FIELD,
  findReferrers,
  layoutReferences,
  FORCE_DELETE_CONTEXT,
  referencesConfigOf,
  REFERENCES_CONFIG_KEY,
  type BackfillResult,
  type ReferencesOptions,
  type ReferencesServerConfig,
  type Referrer,
} from './plugin/references'
export { builderViewPath } from './plugin/links'
export { formSubmissionConditions, applyFormConditions, type FormSubmissionConditionsOptions, type SubmissionRow } from './forms/submission'
export { FORM_FIELDS_FIELD, FORM_SETTINGS_REGION, type FormsOptions } from './plugin/forms'
export {
  DEFAULT_TEMPLATES_SLUG,
  DOCUMENT_TEMPLATE_FIELD,
  TEMPLATE_CONDITIONS_FIELD,
  TEMPLATE_DEFAULT_FIELD,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATE_PREVIEW_FIELD,
  TEMPLATE_PRIORITY_FIELD,
  TEMPLATE_TARGET_FIELD,
} from './core/bindings'
export { defaultBlocks, fromPayloadBlocks, type DefaultBlocksOptions, type FromPayloadBlocksOptions, type PayloadBlockOverride } from './blocks'
export { convertPayloadBlocksLayout, type PayloadConversion, type PayloadConversionReport } from './core/convertPayload'
export {
  decodePayloadBlocks,
  encodePayloadBlocks,
  payloadBlocksProblems,
  payloadBlocksStorage,
  type PayloadBlocksDecode,
  type PayloadBlocksStorage,
} from './core/payloadBlocks'
export {
  formatMigrationReport,
  migrateBlocksField,
  type MigrateBlocksOptions,
  type MigrateBlocksReport,
  type MigrateCounts,
  type MigrateIssue,
} from './migrate'
export type { AiAdapter, AiChatRequest, AiClientConfig, AiMessage, AiOptions, AiStreamEvent } from './ai/types'
export { defineBlock, defineSection, type SectionBlockInput, type SectionInput, sectionsWithVariants, withDefaultClassNames, withInlineBlocks } from './core/blocks'
export { findSectionVersion, sectionVersion, sectionVersions, switchSectionVariant, type SectionVersion, type VariantSwitch } from './core/sections'
export { EMPTY_LAYOUT } from './core/types'
export type {
  BindingField,
  Block,
  BlockDefinition,
  BuilderClientConfig,
  DragMode,
  EditorOptions,
  Layout,
  PartDefinition,
  SectionDefinition,
  SectionOrigin,
  SectionVariant,
  TemplateContext,
  TemplatesClientConfig,
} from './core/types'
export type { ThemeOptions } from './theme/config'
export { DEFAULT_THEME_SLUG } from './theme/config'
// Editable classes: the collection's options and the server actions (scripts, custom endpoints).
export {
  classUsage,
  DEFAULT_CLASSES_SLUG,
  deleteClass,
  importSiteClasses,
  loadClassesSheet,
  publishClass,
  removeUnusedClasses,
  renameClass,
  storeClassesSheet,
  unusedClasses,
  upsertClass,
  type BuilderClass,
  type ClassesOptions,
  type ClassUsage,
} from './classes'
// Comments on the canvas: the collection's options and the comment shape.
export { COMMENT_PARAM, DEFAULT_COMMENTS_SLUG, type BuilderComment, type CommentsOptions } from './comments'

'use client'
// Admin client entry (import map paths used by the plugin):
//   'payload-canvas/client#LayoutField' — the layout JSON field: a summary and "Open builder"
//   'payload-canvas/client#BuilderTab'  — the document's "Builder" tab, a link to the full-screen view
//   'payload-canvas/client#DocumentEditView' — the edit view with `editor.openInBuilder`: opens the builder
//   'payload-canvas/client#PublishButton' — Payload's Publish button, hidden in the builder's settings drawer
//   'payload-canvas/client#TemplateConditionsField' — a template's conditions as condition rows
//   'payload-canvas/client#AiKeyField' — an API key in the AI settings global ("Set, ends in …4f2a", Replace, Clear)
export { AiKeyField } from './AiKeyField'
export { BuilderTab } from './BuilderTab'
export { DocumentEditView } from './DocumentEditView'
export { PublishButton } from './editor/topbar/settingsDrawer'
export { LayoutField } from './LayoutField'
export { TemplateConditionsField } from './TemplateConditionsField'
export { TemplateDefaultCell } from './TemplateDefaultCell'

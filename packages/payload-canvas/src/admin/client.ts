'use client'
// Admin client entry (import map paths used by the plugin):
//   'payload-canvas/client#LayoutField' — the layout JSON field: a summary and "Open builder"
//   'payload-canvas/client#BuilderTab'  — the document's "Builder" tab, a link to the full-screen view
//   'payload-canvas/client#PublishButton' — Payload's Publish button, hidden in the builder's settings drawer
export { BuilderTab } from './BuilderTab'
export { PublishButton } from './editor/topbar/settingsDrawer'
export { LayoutField } from './LayoutField'
export { TemplateDefaultCell } from './TemplateDefaultCell'

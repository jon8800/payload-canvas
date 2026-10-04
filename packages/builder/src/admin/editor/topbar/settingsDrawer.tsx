'use client'

// The builder's "Page settings" drawer shows Payload's own edit form. Its Publish button would
// duplicate the top bar's Publish, so the plugin sets this component as the builder collections'
// `admin.components.edit.PublishButton`:
// - inside the settings drawer it renders nothing. The drawer still saves: by Payload's autosave,
//   or by Payload's "Save draft" button (collections with drafts and no autosave). Collections
//   without drafts show Payload's "Save" button, which this slot does not touch.
// - everywhere else (the edit view, other drawers) it renders Payload's own Publish button.
// The top bar's PageSettings puts its drawer's slug in the context below. A drawer opened from
// inside the settings drawer has another slug, so it keeps its Publish button.

import { PublishButton as PayloadPublishButton, useDocumentDrawerContext } from '@payloadcms/ui'
import type { PublishButtonClientProps } from 'payload'
import { createContext, use } from 'react'

/** Slug of the builder's settings drawer. Null outside the builder view. */
export const SettingsDrawerSlug = createContext<string | null>(null)

export function PublishButton(props: PublishButtonClientProps & { label?: string }) {
  const settingsSlug = use(SettingsDrawerSlug)
  const { drawerSlug } = useDocumentDrawerContext()
  if (settingsSlug !== null && drawerSlug === settingsSlug) return null
  return <PayloadPublishButton {...props} />
}

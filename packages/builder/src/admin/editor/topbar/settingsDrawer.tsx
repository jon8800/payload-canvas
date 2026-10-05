'use client'

// The builder's "Page settings" drawer shows Payload's own edit form. Its Publish button would
// duplicate the top bar's Publish, so the plugin sets this component as the builder collections'
// `admin.components.edit.PublishButton`:
// - inside the settings drawer it renders no button. The drawer still saves: by Payload's
//   autosave, or by Payload's "Save draft" button (collections with drafts and no autosave).
//   Collections without drafts show Payload's "Save" button, which this slot does not touch.
//   In its place it shows the "Not saved" banner after a rejected stale save (see below).
// - everywhere else (the edit view, other drawers) it renders Payload's own Publish button.
// The top bar's PageSettings puts its drawer's slug in the context below. A drawer opened from
// inside the settings drawer has another slug, so it keeps its Publish button.
//
// A stale save (someone else changed a field after this form loaded; live/fieldsGuard.ts) comes
// back as a 409 with an error on each such field. Payload's form keeps what the user typed and
// shows the field errors. The banner says who changed what and offers to load their version.

import { Button, PublishButton as PayloadPublishButton, useAllFormFields, useDocumentDrawerContext, useDocumentInfo } from '@payloadcms/ui'
import type { PublishButtonClientProps } from 'payload'
import { createContext, use, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { staleFieldAuthor, topFieldLabel } from '../../../live/staleMessages'
import './settingsDrawer.scss'

/** Slug of the builder's settings drawer. Null outside the builder view. */
export const SettingsDrawerSlug = createContext<string | null>(null)

/** Loads the settings drawer's form again from the server (their changes; the user's input goes). */
export const SettingsDrawerReload = createContext<(() => void) | null>(null)

export function PublishButton(props: PublishButtonClientProps & { label?: string }) {
  const settingsSlug = use(SettingsDrawerSlug)
  const { drawerSlug } = useDocumentDrawerContext()
  // In the settings drawer: no button, only the banner after a rejected save.
  if (settingsSlug !== null && drawerSlug === settingsSlug) return <StaleSaveBanner />
  return <PayloadPublishButton {...props} />
}

function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** "Not saved. Ana changed Title after you opened this form." with "Reload with their changes". */
function StaleSaveBanner() {
  const reload = use(SettingsDrawerReload)
  const [fields] = useAllFormFields()
  const { docConfig } = useDocumentInfo()
  const authors = new Set<string>()
  const names = new Set<string>()
  for (const [path, state] of Object.entries(fields ?? {})) {
    const who = staleFieldAuthor(state?.errorMessage)
    if (!who) continue
    authors.add(who)
    names.add(path.split('.')[0] ?? path)
  }
  const anchor = useRef<HTMLSpanElement>(null)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const stale = names.size > 0
  // The slot sits in Payload's narrow controls row. The banner goes above the form's fields.
  useLayoutEffect(() => {
    const main = stale ? anchor.current?.closest('form')?.querySelector('.document-fields__main') : null
    if (!main) return
    const box = document.createElement('div')
    box.className = 'builder-stale-save__slot'
    main.prepend(box)
    setTarget(box)
    return () => {
      box.remove()
      setTarget(null)
    }
  }, [stale])

  if (!stale) return null
  const what = listText([...names].map((name) => topFieldLabel(docConfig?.fields, name)))
  const banner = (
    <div className="builder-stale-save" role="alert">
      <p className="builder-stale-save__text">
        <strong>Not saved.</strong> {listText([...authors])} changed {what} after you opened this form. Your text is still in the form: copy it
        if you need it.
      </p>
      {reload && (
        <Button buttonStyle="secondary" size="small" margin={false} className="builder-stale-save__reload" onClick={reload}>
          Reload with their changes
        </Button>
      )}
    </div>
  )
  return (
    <>
      <span ref={anchor} hidden />
      {target ? createPortal(banner, target) : banner}
    </>
  )
}

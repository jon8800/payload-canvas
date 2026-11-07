'use client'

import { DefaultEditView, useConfig, useDocumentDrawerContext, useDocumentInfo } from '@payloadcms/ui'
import { useRouter, useSearchParams } from 'next/navigation'
import type { DocumentViewClientProps } from 'payload'
import { useEffect } from 'react'

import { builderViewPath, FORM_PARAM, opensInBuilder } from '../plugin/links'
import { formChosen, rememberForm } from './formChoice'
import './layoutField.scss'

/**
 * The default edit view of a builder collection with `editor.openInBuilder` on
 * (`views.edit.default`). A saved document opens the full-screen builder instead of Payload's
 * form. The form stays for new documents, in drawers, for users who cannot save, for documents
 * in the trash, and with `?form=1` (the builder's "All fields").
 */
export function DocumentEditView(props: DocumentViewClientProps) {
  const { id, collectionSlug, hasSavePermission, isTrashed } = useDocumentInfo()
  const { drawerSlug } = useDocumentDrawerContext()
  const asked = useSearchParams().get(FORM_PARAM) !== null
  const router = useRouter()
  const {
    config: { routes },
  } = useConfig()
  const hasId = id !== undefined && id !== null && id !== ''
  const remembered = hasId && Boolean(collectionSlug) && formChosen(collectionSlug!, id)
  const toBuilder =
    Boolean(collectionSlug) &&
    opensInBuilder({
      option: true,
      id,
      canSave: hasSavePermission === true,
      trashed: isTrashed === true,
      inDrawer: Boolean(drawerSlug),
      formParam: asked || remembered ? '1' : null,
    })
  const target = toBuilder && hasId && collectionSlug ? builderViewPath(routes.admin, collectionSlug, id) : null

  useEffect(() => {
    if (asked && hasId && collectionSlug && !drawerSlug) rememberForm(collectionSlug, id)
  }, [asked, hasId, collectionSlug, id, drawerSlug])

  useEffect(() => {
    if (target) router.replace(target)
  }, [target, router])

  if (target) {
    return (
      <output className="builder-open-note">Opening the builder…</output>
    )
  }
  return <DefaultEditView {...props} />
}

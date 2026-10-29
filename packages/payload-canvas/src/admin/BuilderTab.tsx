'use client'

import { Button, useConfig, useDocumentInfo } from '@payloadcms/ui'

import { builderViewPath } from '../plugin/links'
import { forgetForm } from './formChoice'

/**
 * The document's "Builder" tab. The builder opens full screen, so the tab is a link to it,
 * styled like Payload's own document tabs.
 */
export function BuilderTab() {
  const { id, collectionSlug } = useDocumentInfo()
  const {
    config: { routes },
  } = useConfig()
  if (id === undefined || id === null || !collectionSlug) return null
  return (
    <Button
      buttonStyle="tab"
      className="doc-tab"
      el="link"
      margin={false}
      size="medium"
      to={builderViewPath(routes.admin, collectionSlug, id)}
      // With `editor.openInBuilder`, opening the document later goes to the builder again.
      onClick={() => forgetForm(collectionSlug, id)}
    >
      <span className="doc-tab__label">Builder</span>
    </Button>
  )
}

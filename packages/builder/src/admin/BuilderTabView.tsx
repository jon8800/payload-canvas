'use client'

import { DefaultEditView } from '@payloadcms/ui'
import type { DocumentViewClientProps } from 'payload'

import { BuilderTabContext } from './context'
import './editor/editor.scss'

/**
 * The builder document tab.
 *
 * Payload renders custom document views without a document Form. So this view renders Payload's
 * public `DefaultEditView`, which brings the Form, save, drafts, autosave and locking. The editor
 * itself is the layout field's Field component; the context tells it to render the full editor.
 * Scoped CSS hides the other fields and the sidebar.
 */
export function BuilderTabView(props: DocumentViewClientProps) {
  return (
    <BuilderTabContext value>
      <div className="builder-tab-view">
        <DefaultEditView {...props} />
      </div>
    </BuilderTabContext>
  )
}

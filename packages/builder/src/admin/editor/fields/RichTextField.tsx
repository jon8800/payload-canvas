'use client'

import { DocumentInfoProvider, useAuth } from '@payloadcms/ui'
import { RenderLexical } from '@payloadcms/richtext-lexical/client'
import type { CollectionSlug, TypedUser } from 'payload'
import type { KeyboardEvent } from 'react'

import { richTextFieldName } from '../../../core/blocks'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'

type Props = {
  readonly label: string
  readonly path: string
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}

/** Ctrl+K (Cmd+K) adds a link to the selected text: it presses the toolbar's link button. */
function onKeyDownCapture(e: KeyboardEvent<HTMLDivElement>) {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'k') return
  const button = e.currentTarget.querySelector<HTMLButtonElement>('[data-button-key="link"]')
  if (!button) return
  e.preventDefault()
  e.stopPropagation()
  button.click()
}

/**
 * Payload's own Lexical editor, outside Payload's form. It takes its editor config (features)
 * from the hidden virtual richText field the plugin adds to the collection.
 *
 * Lexical keeps its own state and reports changes after a short idle delay. A value that
 * deep-equals the last one it reported does not reset it, so typing survives autosave.
 * A different value (undo, AI edit) re-mounts the editor with that value.
 *
 * Lexical's drawers (Edit link, block fields) read the document's info and preferences. The
 * builder has no edit view around it, so a small DocumentInfoProvider supplies them.
 */
export function RichTextField({ label, path, value, onChange }: Props) {
  const { config, doc } = useRuntime()
  const { id, collection, publishedAt } = useValue(doc.meta)
  const { user } = useAuth()
  const name = richTextFieldName(config.field)
  return (
    <DocumentInfoProvider
      id={id}
      collectionSlug={collection as CollectionSlug}
      currentEditor={user as TypedUser}
      hasPublishedDoc={publishedAt !== null}
      isLocked={false}
      lastUpdateTime={0}
      mostRecentVersionIsAutosaved={false}
      unpublishedVersionCount={0}
      versionCount={0}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only adds the Ctrl+K shortcut to the editor inside */}
      <div className="builder-field-richtext" onKeyDownCapture={onKeyDownCapture}>
        <RenderLexical
          label={label}
          name={name}
          path={path}
          schemaPath={`collection.${config.collection}.${name}`}
          setValue={(next) => onChange(next ?? null)}
          value={(value ?? undefined) as never}
        />
      </div>
    </DocumentInfoProvider>
  )
}

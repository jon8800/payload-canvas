'use client'

import { Button, FieldDescription, FieldLabel, useDocumentInfo, useField, useFormFields, useFormModified } from '@payloadcms/ui'
import type { StaticDescription, TextFieldClientComponent } from 'payload'
import { useState } from 'react'

import { KEY_STATUS_FIELD, type AiKeyFieldCustom, type AiKeyStatus } from '../ai/settings/shared'
import './aiKeyField.scss'

function statusText(status: AiKeyStatus | undefined): string {
  if (status?.state === 'set') return status.last4 ? `Set, ends in …${status.last4}` : 'Set'
  if (status?.state === 'unreadable') return 'Saved, but it cannot be read: the Payload secret changed. Paste the key again.'
  return 'Not set'
}

/** What happens without a key here. */
function fallbackText(custom: AiKeyFieldCustom | undefined): string | null {
  if (!custom?.keyEnv) return null
  if (custom.missingKey) return `The server has no ${custom.keyEnv} either, so this feature does not work yet.`
  return `The server uses ${custom.keyEnv} from its environment.`
}

/**
 * An API key in the AI settings global. The stored key never reaches the browser: the field shows
 * only "Set, ends in …4f2a" (from the read-only `keyStatus`), and offers Replace and Clear.
 * The value it sends: a new key (string), `null` to clear, or nothing to keep the stored key.
 */
export const AiKeyField: TextFieldClientComponent = function AiKeyField({ path, field, readOnly }) {
  const { value, setValue, disabled } = useField<string | null>({ path })
  // The saved document's status (updated after each save), else the form's copy.
  const saved = (useDocumentInfo().data?.[KEY_STATUS_FIELD] as Record<string, AiKeyStatus> | undefined)?.[path]
  const inForm = useFormFields(([fields]) => (fields[KEY_STATUS_FIELD]?.value as Record<string, AiKeyStatus> | undefined)?.[path])
  const status = saved ?? inForm
  const modified = useFormModified()
  const [editing, setEditing] = useState(false)
  const [wasModified, setWasModified] = useState(modified)
  const custom = (field.admin?.custom as { aiKey?: AiKeyFieldCustom } | undefined)?.aiKey
  const locked = Boolean(readOnly || disabled)
  const description = field.admin?.description as StaticDescription | undefined
  const stored = status?.state === 'set' || status?.state === 'unreadable'
  const clearing = value === null && stored

  // After a save the form is no longer modified: close the input (the new status shows instead).
  if (modified !== wasModified) {
    setWasModified(modified)
    if (!modified) setEditing(false)
  }

  const fallback = !stored || clearing ? fallbackText(custom) : null

  return (
    <div className="field-type ai-key-field">
      <FieldLabel label={field.label} path={path} />
      <p className={`ai-key-field__status${status?.state === 'unreadable' ? ' ai-key-field__status--error' : ''}`}>
        {clearing ? 'The key is removed when you save.' : statusText(status)}
      </p>
      {fallback && <p className="ai-key-field__note">{fallback}</p>}
      {editing ? (
        <div className="ai-key-field__row">
          <input
            className="ai-key-field__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the API key"
            aria-label={typeof field.label === 'string' ? field.label : path}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => setValue(event.target.value)}
            disabled={locked}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the user just asked for this input
            autoFocus
          />
          <Button
            buttonStyle="secondary"
            size="small"
            margin={false}
            onClick={() => {
              setValue(undefined)
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        !locked && (
          <div className="ai-key-field__row">
            {clearing ? (
              <Button buttonStyle="secondary" size="small" margin={false} onClick={() => setValue(undefined)}>
                Undo
              </Button>
            ) : (
              <>
                <Button buttonStyle="secondary" size="small" margin={false} onClick={() => setEditing(true)}>
                  {stored ? 'Replace key' : 'Add key'}
                </Button>
                {stored && (
                  <Button buttonStyle="secondary" size="small" margin={false} onClick={() => setValue(null)}>
                    Clear key
                  </Button>
                )}
              </>
            )}
            {custom?.keyUrl && (
              <a className="ai-key-field__link" href={custom.keyUrl} target="_blank" rel="noopener noreferrer">
                Get an API key
              </a>
            )}
          </div>
        )
      )}
      {typeof value === 'string' && value.trim() && <p className="ai-key-field__note">Save the settings to store the new key.</p>}
      {description ? <FieldDescription description={description} path={path} /> : null}
    </div>
  )
}

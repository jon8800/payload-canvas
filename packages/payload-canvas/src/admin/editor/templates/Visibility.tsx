'use client'

// The block's visibility conditions in the inspector: condition rows over the fields of the
// block's document (template, list item, row), in "or" groups of "and" rows.

import { FieldLabel } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

import type { Block } from '../../../core/types'
import { storesBuilderData } from '../actions'
import { ConditionRows, type ConditionRow, type ConditionSources } from '../fields/ConditionRows'
import { useRuntime } from '../runtime'
import { useBindingScope } from './Bindable'
import { rowsVisibility, visibilityFields, visibilityRows } from './visibilityRows'

/**
 * Visibility conditions of a block inside a template, a collection list item or a repeat. Shown
 * only where a document exists to test (or when the block already has conditions). A row's value
 * is a fixed value or another field of the same document.
 */
export function VisibilityField({ block }: { readonly block: Block }) {
  const runtime = useRuntime()
  const scope = useBindingScope(block)
  const fields = useMemo(() => visibilityFields(scope?.fields ?? [], scope?.kind === 'list' || scope?.kind === 'row'), [scope?.fields, scope?.kind])
  const sources = useMemo<ConditionSources>(() => ({ field: fields }), [fields])
  const stored = block.visibility
  const storedKey = JSON.stringify(stored ?? null)
  const [draft, setDraft] = useState<{ groups: ConditionRow[][]; source: string }>(() => ({ groups: visibilityRows(stored), source: storedKey }))
  // The conditions changed from outside (undo, AI edit): show them. Our own edits come back equal to `source`,
  // so rows still being typed (no field yet, an empty list) stay.
  if (storedKey !== draft.source) setDraft({ groups: visibilityRows(stored), source: storedKey })

  if (!storesBuilderData(runtime)) return null
  if (!scope && !stored) return null

  const save = (groups: ConditionRow[][]) => {
    const next = rowsVisibility(groups)
    const key = JSON.stringify(next)
    setDraft({ groups, source: key })
    // A row still being typed changes nothing stored: no undo step.
    if (key !== storedKey) runtime.store.apply({ type: 'update', id: block.id, visibility: next })
  }

  return (
    <div className="builder-where builder-visibility">
      <FieldLabel as="span" label="Visibility" />
      <p className="builder-field-group__description">
        {scope
          ? 'Show this block only when the conditions match the document. With "or" groups, one matching group is enough. The editor shows a hidden block dimmed.'
          : 'This block is not inside a template or a collection list, so there is no document to test. The conditions are not checked.'}
      </p>
      <ConditionRows groups={draft.groups} onChange={save} fields={fields} sources={sources} defaultOperator="is_set" />
    </div>
  )
}

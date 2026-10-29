'use client'

// The block's visibility conditions in the inspector: condition rows over the fields of the
// block's document (template, list item, row), in "or" groups of "and" rows.

import { FieldLabel } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

import { INDEX_PATH } from '../../../core/bindings'
import type { Block } from '../../../core/types'
import { storesBuilderData } from '../actions'
import { useCollectionFields } from '../fields/collectionFields'
import { ConditionRows, type ConditionRow, type ConditionSources } from '../fields/ConditionRows'
import { whereFieldOption } from '../fields/WhereField'
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
  // Without binding sources for the collection (templates off for it), its fields from the Payload
  // config. Not for repeat rows: their fields are the row's, not the collection's.
  const configFields = useCollectionFields(scope && scope.kind !== 'row' ? (scope.collection ?? undefined) : undefined)
  const fields = useMemo(() => {
    const inItem = scope?.kind === 'list' || scope?.kind === 'row'
    const found = visibilityFields(scope?.fields ?? [], inItem)
    if (found.some((f) => f.path !== INDEX_PATH) || configFields.length === 0) return found
    return [...found, ...configFields.map(whereFieldOption)]
  }, [scope?.fields, scope?.kind, configFields])
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
      <FieldLabel as="span" label="Show only when" />
      {!scope && <p className="builder-field-note">Works only in a template or a collection list.</p>}
      <ConditionRows groups={draft.groups} onChange={save} fields={fields} sources={sources} defaultOperator="is_set" />
    </div>
  )
}

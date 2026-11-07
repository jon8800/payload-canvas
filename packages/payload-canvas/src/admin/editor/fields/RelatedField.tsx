'use client'

import { FieldLabel } from '@payloadcms/ui'
import { useMemo } from 'react'

import { useRuntime } from '../runtime'
import { Select, type SelectEntry } from '../ui/Select'
import { useValue } from '../valueStore'
import { useCollectionFields } from './collectionFields'
import { parseRelatedKey, relatedChoice, relatedKey, relatedLabel, relatedOptions, type RelatedMode } from './listOptions'

type Props = {
  readonly label: string
  /** The stored field name (`filterField`) and how it relates (`filterBy`). */
  readonly field: unknown
  readonly mode: unknown
  /** Sets both props at once. `undefined` removes a prop. */
  readonly onChange: (field: string | undefined, mode: RelatedMode | undefined) => void
  /** The slug of the listed collection. */
  readonly collection?: string
}

/** "current" is the default mode, so it is not stored. */
const storedMode = (mode: RelatedMode) => (mode === 'current' ? undefined : mode)

const MODE_OPTIONS = [
  { value: 'current', label: 'Its field links to this page' },
  { value: 'linked', label: 'This page links to it' },
  { value: 'shared', label: 'Same value as this page' },
]

/**
 * A collection list's "Related to this page" (`admin.custom.builderRelated`): one select of the
 * fields that relate the listed documents to the template's document, in words ("Categories links
 * to this page"). It stores the same `filterField` + `filterBy` props as before. Outside a template
 * there is no page document, so it shows only when a filter is already set.
 */
export function RelatedField({ label, field, mode, onChange, collection }: Props) {
  const runtime = useRuntime()
  const template = useValue(runtime.template)
  const target = template.isTemplate ? (template.target ?? undefined) : undefined
  const listedFields = useCollectionFields(collection)
  const pageFields = useCollectionFields(target)
  const options = useMemo(
    () => (collection && target ? relatedOptions({ slug: collection, fields: listedFields }, { slug: target, fields: pageFields }) : []),
    [collection, target, listedFields, pageFields],
  )
  const current = relatedChoice(field, mode)

  if (!target && !current) return null

  const set = (next: { mode: RelatedMode; field: string } | null) =>
    next ? onChange(next.field, storedMode(next.mode)) : onChange(undefined, undefined)

  // The fields are unknown (no collection yet, or not in the config): the mode and the field name as text.
  if (target && (listedFields.length === 0 || pageFields.length === 0)) {
    const how = MODE_OPTIONS.some((o) => o.value === mode) ? (mode as RelatedMode) : 'current'
    return (
      <div className="field-type builder-related">
        <FieldLabel as="span" label={label} />
        <div className="builder-sort__row">
          <Select
            aria-label={`${label}: how`}
            value={how}
            options={MODE_OPTIONS}
            onValueChange={(next) => onChange(current?.field, storedMode((next ?? 'current') as RelatedMode))}
          />
          <input
            type="text"
            className="builder-where__input"
            aria-label={`${label}: field name`}
            placeholder="Field name"
            value={current?.field ?? ''}
            onChange={(e) => onChange(e.target.value.trim() || undefined, storedMode(how))}
          />
        </div>
      </div>
    )
  }

  const entries: SelectEntry[] = options.map((o) => ({ value: relatedKey(o), label: o.label }))
  if (current && !options.some((o) => relatedKey(o) === relatedKey(current))) {
    entries.unshift({ value: relatedKey(current), label: relatedLabel(current.mode, current.field) })
  }

  return (
    <div className="field-type builder-related">
      <FieldLabel as="span" label={label} />
      <Select
        aria-label={label}
        emptyLabel="Not filtered"
        value={current ? relatedKey(current) : null}
        options={entries}
        onValueChange={(key) => set(parseRelatedKey(key))}
      />
      {!target && <p className="builder-field-note">Works only in a template.</p>}
    </div>
  )
}

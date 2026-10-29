'use client'

import { FieldLabel } from '@payloadcms/ui'
import { useMemo } from 'react'

import { Select, type SelectEntry } from '../ui/Select'
import { useCollectionFields } from './collectionFields'
import { directionLabels, parseSort, RANDOM_SORT, sortFieldOptions, sortValue } from './listOptions'

type Props = {
  readonly label: string
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  /** The slug of the listed collection, when known: its fields fill the field select. */
  readonly collection?: string
}

/**
 * A list's sort (`admin.custom.builderSort`): a field of the collection and a direction, or a
 * random order. Stores the same text as before: "-publishedAt", "title" or "$random".
 */
export function SortField({ label, value, onChange, collection }: Props) {
  const fields = useCollectionFields(collection)
  const options = useMemo(() => sortFieldOptions(fields), [fields])
  const choice = parseSort(value)
  const picked = choice && choice !== 'random' ? choice : null
  const known = picked ? options.find((o) => o.value === picked.field) : undefined
  const [ascending, descending] = directionLabels(known?.type)

  const entries: SelectEntry[] = options.map((o) => ({ value: o.value, label: o.label }))
  // A stored field the collection does not list (typed by hand or by AI) stays choosable.
  if (picked && !known) entries.unshift({ value: picked.field, label: picked.field })
  entries.push('separator', { value: RANDOM_SORT, label: 'Random order' })

  const pick = (next: string | null) => {
    if (!next) return onChange(null)
    if (next === RANDOM_SORT) return onChange(RANDOM_SORT)
    // Dates start with the newest, everything else from A or the lowest.
    const type = options.find((o) => o.value === next)?.type
    onChange(sortValue({ field: next, descending: picked ? picked.descending : type === 'date' }))
  }

  return (
    <div className="field-type builder-sort">
      <FieldLabel as="span" label={label} />
      <div className="builder-sort__row">
        <Select
          aria-label={`${label}: field`}
          placeholder="Default order"
          value={choice === 'random' ? RANDOM_SORT : (picked?.field ?? null)}
          options={entries}
          onValueChange={pick}
        />
        {picked && (
          <Select
            aria-label={`${label}: direction`}
            value={picked.descending ? 'desc' : 'asc'}
            options={[
              { value: 'asc', label: ascending },
              { value: 'desc', label: descending },
            ]}
            onValueChange={(next) => onChange(sortValue({ field: picked.field, descending: next === 'desc' }))}
          />
        )}
      </div>
    </div>
  )
}

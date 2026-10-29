// The collection list's sort and "Related to this page" controls <-> their stored props. Pure, so
// it is tested without React. The stored formats stay as they were: `sort` is a field name with an
// optional "-" for descending, or "$random"; `filterField` + `filterBy` name the relating field.

import { textOf, type DataField } from '../../../core/fields'

export const RANDOM_SORT = '$random'

/** A stored sort, read: a field and a direction, or random. Null for no sort. */
export type SortChoice = { field: string; descending: boolean } | 'random' | null

export function parseSort(value: unknown): SortChoice {
  if (typeof value !== 'string' || !value.trim()) return null
  const text = value.trim()
  if (text === RANDOM_SORT) return 'random'
  return text.startsWith('-') ? { field: text.slice(1), descending: true } : { field: text, descending: false }
}

export function sortValue(choice: SortChoice): string | null {
  if (choice === null) return null
  if (choice === 'random') return RANDOM_SORT
  return `${choice.descending ? '-' : ''}${choice.field}`
}

export type SortFieldOption = { value: string; label: string; type: string }

/** Field types a query can sort on. A field with many values cannot sort. */
const SORTABLE = new Set(['text', 'textarea', 'email', 'number', 'date', 'select', 'radio', 'checkbox'])

/** Payload adds these to every collection with timestamps; the client config may leave them out. */
const TIMESTAMPS: SortFieldOption[] = [
  { value: 'createdAt', label: 'Created', type: 'date' },
  { value: 'updatedAt', label: 'Updated', type: 'date' },
]

/** The fields of a collection that a list can sort by, then the timestamps when they are missing. */
export function sortFieldOptions(fields: readonly DataField[]): SortFieldOption[] {
  const out = fields
    .filter((f) => SORTABLE.has(f.type) && !f.hasMany)
    .map((f) => ({ value: f.name, label: textOf(f.label) ?? f.name, type: f.type }))
  for (const stamp of TIMESTAMPS) if (!out.some((o) => o.value === stamp.value)) out.push(stamp)
  return out
}

/** The two directions of a field, in words that fit its type: [ascending, descending]. */
export function directionLabels(type: string | undefined): [string, string] {
  switch (type) {
    case 'date':
      return ['Oldest first', 'Newest first']
    case 'number':
      return ['Lowest first', 'Highest first']
    case 'text':
    case 'textarea':
    case 'email':
    case 'select':
    case 'radio':
      return ['A to Z', 'Z to A']
    case 'checkbox':
      return ['Unchecked first', 'Checked first']
    default:
      return ['Ascending', 'Descending']
  }
}

// ---------------------------------------------------------------------------------------------
// "Related to this page": `filterField` + `filterBy`
// ---------------------------------------------------------------------------------------------

export type RelatedMode = 'current' | 'shared' | 'linked'

export type RelatedChoice = { mode: RelatedMode; field: string }

export type RelatedOption = RelatedChoice & { label: string }

const MODES: readonly RelatedMode[] = ['current', 'linked', 'shared']

export const relatedKey = (choice: RelatedChoice) => `${choice.mode}:${choice.field}`

export function parseRelatedKey(key: string | null): RelatedChoice | null {
  if (!key) return null
  const at = key.indexOf(':')
  const mode = key.slice(0, at) as RelatedMode
  return at > 0 && MODES.includes(mode) ? { mode, field: key.slice(at + 1) } : null
}

/** The stored props as a choice, or null when there is no filter field. */
export function relatedChoice(filterField: unknown, filterBy: unknown): RelatedChoice | null {
  const field = typeof filterField === 'string' ? filterField.trim() : ''
  if (!field) return null
  const mode = MODES.includes(filterBy as RelatedMode) ? (filterBy as RelatedMode) : 'current'
  return { mode, field }
}

/** The option label of a choice, in words: the relating field and how it relates. */
export function relatedLabel(mode: RelatedMode, fieldLabel: string): string {
  if (mode === 'current') return `${fieldLabel} links to this page`
  if (mode === 'linked') return `In this page’s ${fieldLabel}`
  return `Same ${fieldLabel} as this page`
}

const RELATIONS = new Set(['relationship', 'upload'])
const SHAREABLE = new Set(['relationship', 'upload', 'select', 'radio', 'text', 'number', 'email'])
/** Fields every document has, which never relate two documents. */
const OWN = new Set(['id', 'createdAt', 'updatedAt', '_status', 'slug'])

const relatesTo = (field: DataField, slug: string) =>
  RELATIONS.has(field.type) && (Array.isArray(field.relationTo) ? field.relationTo.includes(slug) : field.relationTo === slug)

const labelOf = (field: DataField) => textOf(field.label) ?? field.name

/**
 * The ways a list of `listed` documents can relate to the page's document (a `page` document):
 * a field of each listed document that links to the page ("current"), a field of the page that
 * links to the listed documents ("linked"), and a field both have with a value in common ("shared").
 */
export function relatedOptions(listed: { slug: string; fields: readonly DataField[] }, page: { slug: string; fields: readonly DataField[] }): RelatedOption[] {
  const out: RelatedOption[] = []
  for (const field of listed.fields) {
    if (relatesTo(field, page.slug)) out.push({ mode: 'current', field: field.name, label: relatedLabel('current', labelOf(field)) })
  }
  for (const field of page.fields) {
    if (relatesTo(field, listed.slug)) out.push({ mode: 'linked', field: field.name, label: relatedLabel('linked', labelOf(field)) })
  }
  for (const field of listed.fields) {
    if (OWN.has(field.name) || !SHAREABLE.has(field.type)) continue
    const other = page.fields.find((f) => f.name === field.name && f.type === field.type)
    if (other) out.push({ mode: 'shared', field: field.name, label: relatedLabel('shared', labelOf(field)) })
  }
  return out
}

// The title of one array row, read from its own values: "Contact (contact)" instead of "Item 01".
// Pure, so the builder's inspector and the Payload admin (through a RowLabel component) name rows
// the same way.

import { richTextToPlain } from './bindings'
import { dataFields, optionList, type DataField } from './fields'
import { isPlainObject } from './tree'

/** Field names that usually hold a row's title, best first. */
const TITLE_NAMES = [
  'label',
  'title',
  'name',
  'heading',
  'question',
  'text',
  'value',
  'url',
  'href',
  'slug',
  'email',
  'caption',
  'alt',
]
const RANK = new Map(TITLE_NAMES.map((name, rank) => [name.toLowerCase(), rank]))

/** Field types whose value reads as text. */
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'select', 'radio', 'number', 'code', 'richText'])

/** Longest label, in characters. Longer values end with "…". */
const MAX_LENGTH = 60

type Candidate = { name: string; rank: number; depth: number; order: number; text: string; siblings: Candidate[] }

/** One line of text, at most `MAX_LENGTH` characters. */
function oneLine(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > MAX_LENGTH ? `${line.slice(0, MAX_LENGTH - 1).trimEnd()}…` : line
}

/** A field value as label text: option labels for selects, plain text for rich text. */
function valueText(field: DataField, value: unknown): string {
  if (field.type === 'richText') return oneLine(richTextToPlain(value))
  if (field.type === 'select' || field.type === 'radio') {
    const options = optionList(field)
    const labelOf = (item: unknown) => options.find((option) => option.value === item)?.label ?? (typeof item === 'string' ? item : '')
    return oneLine((Array.isArray(value) ? value : [value]).map(labelOf).filter(Boolean).join(', '))
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return oneLine(value)
  if (Array.isArray(value)) return oneLine(value.filter((item) => typeof item === 'string' || typeof item === 'number').join(', '))
  return ''
}

/** The text values of a row and its groups, in field order. Groups count one level deeper. */
function candidates(fields: readonly unknown[] | undefined, data: Record<string, unknown>, depth: number, out: Candidate[]): Candidate[] {
  const level: Candidate[] = []
  for (const field of dataFields(fields)) {
    const value = data[field.name]
    if (field.type === 'group' && isPlainObject(value)) {
      candidates(field.fields, value, depth + 1, out)
      continue
    }
    if (!TEXT_TYPES.has(field.type)) continue
    const text = valueText(field, value)
    if (!text) continue
    const candidate = { name: field.name, rank: RANK.get(field.name.toLowerCase()) ?? TITLE_NAMES.length, depth, order: out.length, text, siblings: level }
    level.push(candidate)
    out.push(candidate)
  }
  return out
}

/**
 * The label of an array row: the value of its most telling text field (a field named label,
 * title, name, heading, question, text, value, url, …; else the first text field), also inside
 * groups. A label with a different `value` beside it shows both: "Contact (contact)", and a
 * `value` with a `field` or `key` beside it shows "email: ada@example.com". Without
 * any text, the singular name and the 1-based row number: "Item 1".
 */
export function rowLabel(row: unknown, fields: readonly unknown[] | undefined, index: number, singular = 'Item'): string {
  const fallback = `${singular || 'Item'} ${index + 1}`
  if (!isPlainObject(row)) return fallback
  const found = candidates(fields, row, 0, [])
  if (found.length === 0) return fallback
  const best = found.toSorted((a, b) => a.rank - b.rank || a.depth - b.depth || a.order - b.order)[0]
  const sibling = (name: string) => best.siblings.find((candidate) => candidate.name.toLowerCase() === name)
  const name = best.name.toLowerCase()
  if (name === 'value') {
    // Key-value rows (a form submission's answers): "email: ada@example.com".
    const key = sibling('field') ?? sibling('key')
    return key ? `${key.text}: ${best.text}` : best.text
  }
  if (name !== 'label') return best.text
  const value = sibling('value')
  if (!value || value.text.toLowerCase() === best.text.toLowerCase()) return best.text
  return `${best.text} (${value.text})`
}

// Pure text helpers for the list cells (FieldCell.tsx). No React, so they are easy to test.

/** One line of text, at most `max` characters, with "…" when cut. */
export function excerpt(text: string, max = 80): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** A config label as text: a string, or one string per language. Anything else (a function, JSX) is ''. */
export function labelText(label: unknown, language = 'en'): string {
  if (typeof label === 'string') return label
  if (!label || typeof label !== 'object' || Array.isArray(label) || '$$typeof' in label) return ''
  const byLanguage = label as Record<string, unknown>
  const text = byLanguage[language] ?? byLanguage.en ?? Object.values(byLanguage).find((value) => typeof value === 'string')
  return typeof text === 'string' ? text : ''
}

/** "3 links", "1 link": a count with the singular or plural name. Names keep acronyms ("2 FAQs"). */
export function countText(count: number, singular: string, plural: string): string {
  const name = count === 1 ? singular : plural
  // "Links" reads as "links" after a number; "FAQs" and "URLs" stay as they are.
  const lower = /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name
  return `${count} ${lower}`
}

const MAX_JSON_PARTS = 3

/** A JSON value in a few words: `12 blocks · version: 1`, `3 items`, or the value itself. Lists come first. */
export function jsonSummary(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return excerpt(value, 60)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return countText(value.length, 'item', 'items')
  if (typeof value !== 'object') return ''
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return 'Empty'
  // A list reads best as "12 blocks": its key is usually a plural noun.
  const lists = entries.filter(([, item]) => Array.isArray(item))
  const ordered = [...lists, ...entries.filter(([, item]) => !Array.isArray(item))]
  const parts = ordered.slice(0, MAX_JSON_PARTS).map(([key, item]) => {
    if (Array.isArray(item)) return `${item.length} ${key}`
    if (item !== null && typeof item === 'object') return key
    return `${key}: ${excerpt(String(item), 24)}`
  })
  const more = entries.length - MAX_JSON_PARTS
  return more > 0 ? `${parts.join(' · ')} · ${more} more` : parts.join(' · ')
}

export type DateAppearance = 'dayAndTime' | 'dayOnly' | 'monthOnly' | 'timeOnly'

const DATE_STYLES: Record<DateAppearance, Intl.DateTimeFormatOptions> = {
  dayAndTime: { dateStyle: 'medium', timeStyle: 'short' },
  dayOnly: { dateStyle: 'medium' },
  monthOnly: { month: 'long', year: 'numeric' },
  timeOnly: { timeStyle: 'short' },
}

/** "Nov 9, 2026, 5:53 PM" (or the date, month or time alone), in the browser's time zone. */
export function formatCellDate(value: unknown, appearance: DateAppearance = 'dayAndTime', locale = 'en', timeZone?: string): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { ...DATE_STYLES[appearance], timeZone }).format(date)
  } catch {
    // An unknown locale or time zone: English in the local zone.
    return new Intl.DateTimeFormat('en', DATE_STYLES[appearance]).format(date)
  }
}

/** The text of Lexical rich text, one line, without images or other non-text nodes. */
export function richTextExcerpt(value: unknown, max = 120): string {
  const root = value && typeof value === 'object' ? (value as { root?: unknown }).root : undefined
  if (!root || typeof root !== 'object') return ''
  const parts: string[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const { text, children } = node as { text?: unknown; children?: unknown }
    if (typeof text === 'string') parts.push(text)
    if (Array.isArray(children)) {
      for (const child of children) visit(child)
      // A paragraph, heading or list item ends with a space, so words do not run together.
      parts.push(' ')
    }
  }
  visit(root)
  return excerpt(parts.join(''), max)
}

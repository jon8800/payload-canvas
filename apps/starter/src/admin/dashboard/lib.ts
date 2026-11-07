import type { Where } from 'payload'

/** Collections the content widgets read. Slugs that are not in the config are skipped. */
export const CONTENT_COLLECTIONS = ['pages', 'posts'] as const

/** The upload collection that "Site checks" checks for alt text. */
export const MEDIA_COLLECTION = 'media'

/** The form submissions collection from the form builder plugin. */
export const FORM_SUBMISSIONS = 'form-submissions'

/** The slug of the page that "Edit home page" opens. */
export { HOME_SLUG } from '@/lib/links'

/**
 * Turns a `where` object into the query string Payload's list view reads,
 * for example `where[or][0][meta.title][exists]=false`.
 */
export function whereToQuery(where: Where): string {
  const parts: string[] = []
  const walk = (value: unknown, path: string) => {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}[${key}]`)
      return
    }
    parts.push(`${encodeURIComponent(path)}=${encodeURIComponent(String(value ?? ''))}`)
  }
  walk(where, 'where')
  return parts.join('&')
}

/** A `where` that matches documents with an empty field: missing, null or ''. */
export function emptyField(path: string): Where {
  return { or: [{ [path]: { exists: false } }, { [path]: { equals: '' } }] }
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "5 minutes ago", "in 2 days", "just now". */
export function relativeTime(date: string | Date, now: Date = new Date(), locale = 'en'): string {
  const seconds = Math.round((new Date(date).getTime() - now.getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit)
  }
  return 'just now'
}

/** The title of a document, with a fallback for documents without one. */
export function docTitle(doc: Record<string, unknown>, useAsTitle: string | undefined): string {
  const value = useAsTitle ? doc[useAsTitle] : undefined
  if (typeof value === 'string' && value.trim()) return value.trim()
  return `Untitled (${String(doc.id)})`
}

/** The admin URL of a document. */
export function docURL(adminRoute: string, collection: string, id: string | number): string {
  return `${adminRoute === '/' ? '' : adminRoute}/collections/${collection}/${encodeURIComponent(String(id))}`
}

/** The admin URL of a list view, optionally filtered. */
export function listURL(adminRoute: string, collection: string, where?: Where): string {
  const base = `${adminRoute === '/' ? '' : adminRoute}/collections/${collection}`
  return where ? `${base}?${whereToQuery(where)}` : base
}

/** A short preview of a form submission: the email (if any) and the first other value. */
export function submissionSummary(data: Array<{ field?: string | null; value?: string | null }> | null | undefined): {
  from: string | null
  text: string | null
} {
  const rows = (data ?? []).filter((row) => typeof row.value === 'string' && row.value.trim())
  const email = rows.find((row) => /email/i.test(row.field ?? '') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.value ?? ''))
  const name = rows.find((row) => row !== email && /name/i.test(row.field ?? ''))
  const rest = rows.filter((row) => row !== email && row !== name)
  const message = rest.find((row) => /message|comment|question/i.test(row.field ?? '')) ?? rest[0]
  return {
    from: (name?.value ?? email?.value ?? null)?.trim() ?? null,
    text: (message?.value ?? null)?.trim() ?? null,
  }
}

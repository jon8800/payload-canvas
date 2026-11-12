import type { Where } from 'payload'
import { submissionSummary, type SubmissionDataRow, type SubmissionFormField } from 'payload-canvas/forms'

import { FROM_PARAM } from '@/lib/redirects'

/** Collections the content widgets read. Slugs that are not in the config are skipped. */
export const CONTENT_COLLECTIONS = ['pages', 'posts'] as const

/** The upload collection that "Site checks" checks for alt text. */
export const MEDIA_COLLECTION = 'media'

/** The redirects plugin's collection: "Create redirect" opens its create view. */
export const REDIRECTS_COLLECTION = 'redirects'

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

/** A form submission as the Form messages widget reads it (`form` at depth 1). */
export type SubmissionRowDoc = {
  id: string | number
  createdAt: string
  readAt?: string | null
  form?: { title?: string | null; fields?: SubmissionFormField[] | null } | string | number | null
  submissionData?: SubmissionDataRow[] | null
}

/** The widget's rows: the message (or who sent it), the sender, the form and the time, and "New" until someone opened it. */
export function submissionRows(docs: readonly SubmissionRowDoc[], adminRoute: string, language: string, now: Date = new Date()) {
  return docs.map((doc) => {
    const form = typeof doc.form === 'object' && doc.form ? doc.form : null
    const { name, email, text } = submissionSummary(doc.submissionData, form?.fields)
    const from = name ?? email
    return {
      key: String(doc.id),
      href: docURL(adminRoute, FORM_SUBMISSIONS, doc.id),
      title: shortText(text ?? from) || 'Empty message',
      meta: [text ? from : null, form?.title || 'Form', relativeTime(doc.createdAt, now, language)].filter(Boolean).join(' · '),
      ...(doc.readAt ? {} : { badge: { label: 'New', tone: 'new' as const } }),
    }
  })
}

/** The admin URL that creates a redirect from `path`. */
export function redirectCreateURL(adminRoute: string, path: string): string {
  return `${adminRoute === '/' ? '' : adminRoute}/collections/${REDIRECTS_COLLECTION}/create?${FROM_PARAM}=${encodeURIComponent(path)}`
}

/** One line of text, at most `max` characters, with an ellipsis when cut. */
export function shortText(text: string | null | undefined, max = 90): string {
  const line = (text ?? '').replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}


/** Why a link target is broken: it was deleted, or it is not published. Null when it is fine. */
export function linkProblem(target: { found: boolean; drafts: boolean; status?: unknown }): 'deleted' | 'unpublished' | null {
  if (!target.found) return 'deleted'
  if (target.drafts && target.status !== 'published') return 'unpublished'
  return null
}

/** The URL of a media document's small preview: the thumbnail variant, the admin thumbnail, or the image. */
export function thumbnailOf(doc: { url?: unknown; thumbnailURL?: unknown; mimeType?: unknown; variants?: unknown }): string | null {
  const sizes = doc.variants as Record<string, { url?: unknown } | undefined> | undefined
  for (const candidate of [sizes?.thumbnail?.url, doc.thumbnailURL]) {
    if (typeof candidate === 'string' && candidate) return candidate
  }
  const image = typeof doc.mimeType === 'string' && doc.mimeType.startsWith('image/')
  return image && typeof doc.url === 'string' && doc.url ? doc.url : null
}

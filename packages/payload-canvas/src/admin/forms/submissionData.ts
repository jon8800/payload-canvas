// Server helpers of the submissions admin: the form's fields (cached per request), dates and files.

import { cache } from 'react'
import type { Payload, SanitizedCollectionConfig } from 'payload'

import type { SubmissionFormField } from '../../forms/summary'

export type FormDoc = { id?: string | number; title?: string | null; fields?: SubmissionFormField[] | null }

/** The id of a relationship value (an id or a populated document). */
export function idOf(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

/** The forms collection the submissions' `form` relationship points at. */
export function formsSlugOf(collection: SanitizedCollectionConfig | undefined): string {
  const field = collection?.flattenedFields.find((f) => f.name === 'form')
  return field && 'relationTo' in field && typeof field.relationTo === 'string' ? field.relationTo : 'forms'
}

/** A form by id, once per request (a list shows many submissions of the same form). Null when it is gone. */
export const loadForm = cache(async (payload: Payload, slug: string, id: string | number): Promise<FormDoc | null> => {
  try {
    return (await payload.findByID({ collection: slug as never, id, depth: 0, overrideAccess: true })) as unknown as FormDoc
  } catch {
    return null
  }
})

/** The form of a submission: the populated document, else loaded by id. */
export async function formOf(payload: Payload, slug: string, value: unknown): Promise<FormDoc | null> {
  if (value && typeof value === 'object' && Array.isArray((value as FormDoc).fields)) return value as FormDoc
  const id = idOf(value)
  return id === null ? null : loadForm(payload, slug, id)
}

/** "9 Nov 2026, 14:05" in the admin's language. */
export function formatDateTime(value: unknown, language: string | undefined): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(language || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return date.toISOString()
  }
}

export type MediaLike = {
  id?: string | number
  filename?: string | null
  url?: string | null
  mimeType?: string | null
  thumbnailURL?: string | null
  filesize?: number | null
  variants?: Record<string, { url?: string | null } | undefined> | null
}

/** A small picture of an upload: its thumbnail size, the upload's thumbnail, or the image itself. */
export function thumbnailOf(doc: MediaLike): string | null {
  for (const candidate of [doc.variants?.thumbnail?.url, doc.thumbnailURL]) {
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return doc.mimeType?.startsWith('image/') && doc.url ? doc.url : null
}

/** "12 KB", "1.4 MB". */
export function fileSize(bytes: unknown): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

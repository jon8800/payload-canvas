// Files of the `file` form field (`fileFormField`): checks and storage. The site's form sends
// the submission as multipart form data (`_payload` with the JSON, one part per file, named after
// its field; a field with several files sends several parts with one name). `formFileUploads` is a
// `beforeChange` hook of the submissions collection: it checks the number of files (one, or the
// field's `maxFiles` when it allows several), their type and size, stores each file in an upload
// collection (media), links them on a relationship field of the submission (`attachments`) and
// puts the file names and addresses in the answers, so emails show them. Hidden file fields are
// skipped, as their other answers are.

import { ValidationError, type CollectionBeforeChangeHook } from 'payload'

import { FILE_FIELD_MAX_MB } from './fieldConfigs'
import { filesProblem, type FileCountRules } from './files'
import { applyFormConditions, type SubmissionRow } from './submission'

/** A file of the request, as Payload parses multipart data (`req.files`). */
type RequestFile = { name: string; data: Buffer; mimetype: string; size: number }

export type FormFileUploadsOptions = {
  /** Slug of the forms collection. Default "forms". */
  forms?: string
  /** The upload collection the files go to. Default "media". */
  collection?: string
  /** The submission's relationship (or upload) field with `hasMany` that links the files. Default "attachments". */
  field?: string
  /** Upper limit for every file field, in MB. Default 10. */
  maxSizeMb?: number
  /** Data of the new upload document. Default: `{ alt: <file name> }`. */
  data?: (file: { name: string; mimetype: string; size: number }) => Record<string, unknown>
}

type FileField = { blockType?: string; name?: string | null; label?: string | null } & FileCountRules

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

/**
 * The submissions hook for file fields:
 * `formSubmissionOverrides: { hooks: { beforeChange: [formFileUploads()] } }`. Runs on create.
 */
export function formFileUploads(options: FormFileUploadsOptions = {}): CollectionBeforeChangeHook {
  const formsSlug = options.forms ?? 'forms'
  const target = options.collection ?? 'media'
  const linkField = options.field ?? 'attachments'
  const limitMb = options.maxSizeMb ?? FILE_FIELD_MAX_MB
  return async ({ collection, data: incoming, operation, req }) => {
    if (operation !== 'create' || !incoming) return incoming
    // Only this hook links files: a visitor never links existing uploads to a submission.
    const { [linkField]: _sent, ...data } = incoming
    const id = idOf(data.form)
    if (id === null) return data
    const form = (await req.payload.findByID({ collection: formsSlug as never, id, depth: 0, req, overrideAccess: true }).catch(() => null)) as {
      fields?: FileField[]
    } | null
    const fileFields = (form?.fields ?? []).filter((f): f is FileField & { name: string } => f.blockType === 'file' && Boolean(f.name))
    if (!form || fileFields.length === 0) return data
    const rows = [...((data.submissionData as SubmissionRow[] | undefined) ?? [])]
    const { hidden } = applyFormConditions(form.fields, rows)
    const files = (req.files ?? {}) as Record<string, RequestFile | RequestFile[] | undefined>
    const errors: { path: string; message: string }[] = []
    const accepted: Array<{ field: FileField & { name: string }; files: RequestFile[] }> = []
    for (const field of fileFields) {
      if (hidden.has(field.name)) continue
      const raw = files[field.name]
      const list = raw ? (Array.isArray(raw) ? raw : [raw]) : []
      const problem = filesProblem(list, field, limitMb)
      if (problem) errors.push({ path: 'submissionData', message: `${field.label || field.name}: ${problem}` })
      else if (list.length > 0) accepted.push({ field, files: list })
    }
    if (errors.length > 0) throw new ValidationError({ collection: collection.slug, req, errors })
    if (accepted.length === 0) return data

    const base = req.payload.config.serverURL || req.headers.get('origin') || ''
    const ids: Array<string | number> = []
    for (const { field, files: list } of accepted) {
      const values: string[] = []
      for (const file of list) {
        const meta = { name: file.name, mimetype: file.mimetype, size: file.size }
        const doc = (await req.payload.create({
          collection: target as never,
          data: (options.data?.(meta) ?? { alt: file.name }) as never,
          file: { name: file.name, data: file.data, mimetype: file.mimetype, size: file.size },
          req,
          overrideAccess: true,
        })) as { id: string | number; url?: string | null; filename?: string | null }
        ids.push(doc.id)
        const url = doc.url ? (/^https?:/i.test(doc.url) || !base ? doc.url : new URL(doc.url, base).href) : ''
        values.push(url ? `${doc.filename ?? file.name} (${url})` : (doc.filename ?? file.name))
      }
      const value = values.join(', ')
      const at = rows.findIndex((row) => row.field === field.name)
      if (at === -1) rows.push({ field: field.name, value })
      else rows[at] = { ...rows[at], value }
    }
    return { ...data, submissionData: rows, [linkField]: ids }
  }
}

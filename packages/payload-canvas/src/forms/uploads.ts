// Files of the `file` form field (`fileFormField`): checks and storage. The site's form sends
// the submission as multipart form data (`_payload` with the JSON, one part per file field, by
// field name). `formFileUploads` is a `beforeChange` hook of the submissions collection: it checks
// type and size, stores each file in an upload collection (media), links it on a relationship
// field of the submission (`attachments`) and puts the file name and address in the answers, so
// emails show them. Hidden file fields are skipped, as their other answers are.

import { ValidationError, type CollectionBeforeChangeHook } from 'payload'

import { FILE_FIELD_MAX_MB } from './fieldConfigs'
import { fileProblem, type FileRules } from './files'
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

type FileField = { blockType?: string; name?: string | null; label?: string | null; required?: boolean | null } & FileRules

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
    const accepted: Array<{ field: FileField & { name: string }; file: RequestFile }> = []
    for (const field of fileFields) {
      if (hidden.has(field.name)) continue
      const raw = files[field.name]
      const list = raw ? (Array.isArray(raw) ? raw : [raw]) : []
      const label = field.label || field.name
      if (list.length === 0) {
        if (field.required) errors.push({ path: 'submissionData', message: `${label}: choose a file.` })
        continue
      }
      if (list.length > 1) {
        errors.push({ path: 'submissionData', message: `${label}: send one file only.` })
        continue
      }
      const problem = fileProblem(list[0], field, limitMb)
      if (problem) errors.push({ path: 'submissionData', message: `${label}: ${problem}` })
      else accepted.push({ field, file: list[0] })
    }
    if (errors.length > 0) throw new ValidationError({ collection: collection.slug, req, errors })
    if (accepted.length === 0) return data

    const base = req.payload.config.serverURL || req.headers.get('origin') || ''
    const ids: Array<string | number> = []
    for (const { field, file } of accepted) {
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
      const value = url ? `${doc.filename ?? file.name} (${url})` : (doc.filename ?? file.name)
      const at = rows.findIndex((row) => row.field === field.name)
      if (at === -1) rows.push({ field: field.name, value })
      else rows[at] = { ...rows[at], value }
    }
    return { ...data, submissionData: rows, [linkField]: ids }
  }
}

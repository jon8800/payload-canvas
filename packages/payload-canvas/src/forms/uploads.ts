// Files of the `file` form field (`fileFormField`): checks and storage. The site's form sends
// the submission as multipart form data (`_payload` with the JSON, one part per file, named after
// its field; a field with several files sends several parts with one name). `formFileUploads` is a
// `beforeChange` hook of the submissions collection: it checks the number of files (one, or the
// field's `maxFiles` when it allows several), their type and size, stores each file in a private
// upload collection (not a public one like Media: visitors send CVs and other private files), links
// them on a relationship field of the submission (`attachments`) and puts the file names and
// addresses in the answers, so emails show them. A file field without an accepted file has no
// answer: text a visitor sent for it is dropped. Hidden file fields are skipped, as their other
// answers are. When the submission fails after files were stored, `formFileUploadsCleanup` (an
// `afterError` hook) or `removeStoredFormFiles` removes them again.

import { ValidationError, type AfterErrorHook, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

import { FILE_FIELD_MAX_MB } from './fieldConfigs'
import { filesProblem, type FileCountRules } from './files'
import { applyFormConditions, type SubmissionRow } from './submission'

/** A file of the request, as Payload parses multipart data (`req.files`). */
type RequestFile = { name: string; data: Buffer; mimetype: string; size: number }

export type FormFileUploadsOptions = {
  /** Slug of the forms collection. Default "forms". */
  forms?: string
  /**
   * The upload collection the files go to. Required, and keep it private: read access for signed-in
   * users only, files outside `public/` (a public collection such as Media would publish every file).
   */
  collection: string
  /** The submission's relationship (or upload) field with `hasMany` that links the files. Default "attachments". */
  field?: string
  /** Upper limit for every file field, in MB. Default 10. */
  maxSizeMb?: number
  /** Data of the new upload document. Default: `{ alt: <file name> }`. */
  data?: (file: { name: string; mimetype: string; size: number }) => Record<string, unknown>
}

type FileField = { blockType?: string; name?: string | null; label?: string | null } & FileCountRules

/** `context` key where `formFileUploads` lists the upload documents it created in this request. */
export const FORM_FILES_CONTEXT = 'builderFormFiles'

type StoredFile = { collection: string; id: string | number; filenames: string[] }

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

/** The file names of an upload document: the file and its image sizes. */
function filenamesOf(doc: { filename?: unknown; sizes?: unknown }): string[] {
  const sizes = doc.sizes && typeof doc.sizes === 'object' ? Object.values(doc.sizes as Record<string, { filename?: unknown } | null>) : []
  return [doc.filename, ...sizes.map((size) => size?.filename)].filter((name): name is string => typeof name === 'string' && name !== '')
}

/**
 * The submissions hook for file fields:
 * `formSubmissionOverrides: { hooks: { beforeChange: [formFileUploads({ collection: 'form-files' })] } }`. Runs on create.
 */
export function formFileUploads(options: FormFileUploadsOptions): CollectionBeforeChangeHook {
  const formsSlug = options.forms ?? 'forms'
  const target = options.collection
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
    const { hidden } = applyFormConditions(form.fields, data.submissionData as SubmissionRow[] | undefined)
    // Only stored files answer a file field: a visitor's own text for one ("invoice.pdf (https://…)") never shows in emails.
    const fileNames = new Set(fileFields.map((f) => f.name))
    const rows = ((data.submissionData as SubmissionRow[] | undefined) ?? []).filter((row) => typeof row?.field !== 'string' || !fileNames.has(row.field))
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
    if (accepted.length === 0) return { ...data, submissionData: rows }

    const base = req.payload.config.serverURL || req.headers.get('origin') || ''
    const ids: Array<string | number> = []
    const stored: StoredFile[] = []
    if (req.context) req.context[FORM_FILES_CONTEXT] = stored
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
        })) as { id: string | number; url?: string | null; filename?: string | null; sizes?: unknown }
        ids.push(doc.id)
        stored.push({ collection: target, id: doc.id, filenames: filenamesOf(doc) })
        const url = doc.url ? (/^https?:/i.test(doc.url) || !base ? doc.url : new URL(doc.url, base).href) : ''
        values.push(url ? `${doc.filename ?? file.name} (${url})` : (doc.filename ?? file.name))
      }
      rows.push({ field: field.name, value: values.join(', ') })
    }
    return { ...data, submissionData: rows, [linkField]: ids }
  }
}

/**
 * Removes the files `formFileUploads` stored in this request: the upload documents (when they are
 * still in the database) and their files on disk (a failed save rolls the documents back, not the
 * files). Disk storage only (`upload.staticDir`); with a cloud storage adapter the files stay.
 * Never throws.
 */
export async function removeStoredFormFiles(req: Pick<PayloadRequest, 'context' | 'payload'>): Promise<void> {
  const stored = req.context?.[FORM_FILES_CONTEXT] as StoredFile[] | undefined
  if (!Array.isArray(stored) || stored.length === 0) return
  req.context[FORM_FILES_CONTEXT] = []
  const [{ unlink }, path] = await Promise.all([import('node:fs/promises'), import('node:path')])
  for (const file of stored) {
    // Its own transaction: the request's one has failed.
    await req.payload.delete({ collection: file.collection as never, id: file.id, overrideAccess: true }).catch(() => undefined)
    const config = (req.payload.collections as Record<string, { config: { upload?: { staticDir?: string } | boolean } } | undefined>)[file.collection]?.config.upload
    const dir = config && typeof config === 'object' ? config.staticDir : undefined
    if (!dir) continue
    for (const name of file.filenames) await unlink(path.resolve(dir, path.basename(name))).catch(() => undefined)
  }
}

/**
 * The submissions `afterError` hook that removes the files of a submission that failed after they
 * were stored (a refused answer, a database error, a failed email):
 * `formSubmissionOverrides: { hooks: { afterError: [formFileUploadsCleanup()] } }`. Payload runs it
 * for REST and GraphQL requests; server code that creates submissions calls `removeStoredFormFiles`.
 */
export function formFileUploadsCleanup(): AfterErrorHook {
  return async ({ req }) => {
    await removeStoredFormFiles(req)
  }
}

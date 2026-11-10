// Forms without JavaScript: the site's `<form>` posts natively (`method="post"`, multipart) to a
// route of the app, which turns the form data into the same submission the site's script sends
// (`noScriptSubmission`), creates it with the Local API as the visitor, and redirects (303) back
// to the page with the result in the query (`formResultSearch`). The page reads it
// (`readFormResult`) and shows the confirmation or the problems. Pure and client-safe.

import { HONEYPOT_NAME } from './spamSettings'
import type { SubmissionRow } from './submission'

/** The hidden input with the form's id. */
export const NO_SCRIPT_FORM_INPUT = '_form'
/** The hidden input with the page path to come back to. */
export const NO_SCRIPT_RETURN_INPUT = '_return'

/** Query keys of the result: `form-result` ("sent" or "error"), the form id, the message and the problems. */
export const FORM_RESULT_PARAM = 'form-result'
const FORM_PARAM = 'form-id'
const MESSAGE_PARAM = 'form-message'
const PROBLEM_PARAM = 'form-problem'

/** The result of a no-JavaScript post, as the page shows it. */
export type FormResult = { form: string; status: 'sent' | 'error'; message?: string; problems?: string[] }

/** A file of the post, as Payload's `req.files` holds it. */
export type PostedFile = { name: string; data: Buffer; mimetype: string; size: number }

type FieldLike = { blockType?: string | null; name?: string | null }

/** The element id of a form's result on the page, for the redirect's `#…`. */
export const formResultAnchor = (form: string | number) => `form-${String(form)}`

/** The query (with `?`) and the anchor of a result. Texts are cut, so the address stays short. */
export function formResultSearch(result: FormResult): string {
  const params = new URLSearchParams({ [FORM_RESULT_PARAM]: result.status, [FORM_PARAM]: result.form })
  if (result.message) params.set(MESSAGE_PARAM, result.message.slice(0, 300))
  for (const problem of (result.problems ?? []).slice(0, 10)) params.append(PROBLEM_PARAM, problem.slice(0, 200))
  return `?${params.toString()}#${formResultAnchor(result.form)}`
}

/**
 * A page address without a no-JavaScript result in it (its query keys and its `#form-…` anchor), so
 * a submission sent from a result view records the page itself. Works on paths and full addresses.
 */
export function withoutFormResult(address: string): string {
  if (!address.includes(FORM_RESULT_PARAM)) return address
  const [rest = '', hash = ''] = address.split('#')
  const [path = '', query = ''] = rest.split('?')
  const params = new URLSearchParams(query)
  for (const key of [FORM_RESULT_PARAM, FORM_PARAM, MESSAGE_PARAM, PROBLEM_PARAM]) params.delete(key)
  const search = params.toString()
  return `${path}${search ? `?${search}` : ''}${hash && !hash.startsWith('form-') ? `#${hash}` : ''}`
}

/** The result in a page's query, or null. Takes `URLSearchParams` or Next's `searchParams` object. */
export function readFormResult(query: URLSearchParams | Record<string, string | string[] | undefined>): FormResult | null {
  const all = (key: string): string[] => {
    if (query instanceof URLSearchParams) return query.getAll(key)
    const value = query[key]
    return Array.isArray(value) ? value : value === undefined ? [] : [value]
  }
  const status = all(FORM_RESULT_PARAM)[0]
  const form = all(FORM_PARAM)[0]
  if ((status !== 'sent' && status !== 'error') || !form) return null
  const message = all(MESSAGE_PARAM)[0]
  const problems = all(PROBLEM_PARAM).filter(Boolean)
  return { form, status, ...(message ? { message } : {}), ...(problems.length > 0 ? { problems } : {}) }
}

/**
 * A path on this site to come back to: starts with one "/", no scheme or host, no backslashes.
 * Anything else (an outside address someone put in the post) becomes "/".
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return '/'
  return value.split('#')[0]!.split('?')[0] || '/'
}

/** A posted file part: a `File` with a name (an empty file input posts one without). */
const isPostedFile = (value: FormDataEntryValue): value is File => typeof value !== 'string' && value.name !== '' && value.size > 0

/**
 * The submission a native post of the form holds, as the site's script sends it: one answer per
 * named field (several values joined with ", "; a ticked box is "true"), the files of each file
 * field (its answer is left to the upload hook), and the honeypot's value.
 */
export async function noScriptSubmission(
  fields: readonly FieldLike[],
  data: Pick<FormData, 'getAll'>,
): Promise<{ submissionData: SubmissionRow[]; files: Record<string, PostedFile[]>; honeypot: string }> {
  const submissionData: SubmissionRow[] = []
  const files: Record<string, PostedFile[]> = {}
  for (const field of fields) {
    const name = field.name
    if (!name || field.blockType === 'message') continue
    const values = data.getAll(name)
    if (field.blockType === 'file') {
      const posted = values.filter(isPostedFile)
      if (posted.length > 0) {
        files[name] = await Promise.all(
          posted.map(async (file) => ({ name: file.name, data: Buffer.from(await file.arrayBuffer()), mimetype: file.type || 'application/octet-stream', size: file.size })),
        )
      }
      continue
    }
    const texts = values.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
    if (texts.length === 0) continue
    const tick = field.blockType === 'checkbox' || field.blockType === 'consent'
    submissionData.push({ field: name, value: tick ? 'true' : texts.join(', ') })
  }
  const honeypot = data.getAll(HONEYPOT_NAME).find((v): v is string => typeof v === 'string') ?? ''
  return { submissionData, files, honeypot }
}

/**
 * The problems and message of a refused submission (Payload's ValidationError rows, else the
 * error's message), for the result. Unknown errors get a general message, never their text.
 */
export function refusalOf(error: unknown): { message: string; problems: string[] } {
  const problems = ((error as { data?: { errors?: Array<{ message?: unknown }> } } | null)?.data?.errors ?? []).flatMap((e) => (typeof e.message === 'string' && e.message ? [e.message] : []))
  const isPublic = (error as { isPublic?: unknown } | null)?.isPublic === true || problems.length > 0
  const message = isPublic && error instanceof Error && error.message ? error.message : 'Your message was not sent. Please try again later.'
  return { message: problems.length > 0 ? 'Your message was not sent. Check the problems below.' : message, problems: [...new Set(problems)] }
}

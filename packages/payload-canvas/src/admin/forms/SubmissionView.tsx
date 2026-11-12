// The detail view of a form submission (a `ui` field, see forms/submissionsAdmin.ts): the form,
// who sent it and when, the answers as a table with the form's labels, the files, and
// "Reply by email". Opening it sets `readAt` once, so the list's "New" badge goes away.

import { Button } from '@payloadcms/ui'
import type { Payload, SanitizedCollectionConfig, User, UIFieldServerProps } from 'payload'

import { replyMailto, safePageUrl, submissionAnswers, submissionSummary, type SubmissionAnswer, type SubmissionDataRow } from '../../forms/summary'
import { SUBMISSION_PAGE_FIELD, SUBMISSION_READ_FIELD, type SubmissionsAdminCustom } from '../../forms/submissionsAdmin'
import { fileSize, formatDateTime, formOf, formsSlugOf, thumbnailOf, type MediaLike } from './submissionData'
import './submissions.css'

type SubmissionDoc = Record<string, unknown> & {
  id: string | number
  form?: unknown
  submissionData?: SubmissionDataRow[] | null
  submissionUploads?: Array<{ field?: string | null; value?: unknown }> | null
  createdAt?: string
}

/** A collection's config by slug. Loose: an app's generated types allow only its own slugs. */
const collectionConfigOf = (payload: Payload, slug: string) =>
  (payload.collections as unknown as Record<string, { config: SanitizedCollectionConfig } | undefined>)[slug]?.config

/** Context flag of the read-date update, for hooks that should ignore it. */
export const SUBMISSION_READ_CONTEXT = 'formSubmissionRead'

/**
 * Sets the read date the first time a signed-in admin user opens the submission. The plugin's
 * submissions refuse updates, so this writes only that field, with access off.
 */
async function markRead(payload: Payload, collection: string, doc: SubmissionDoc, user: User | null | undefined): Promise<string | null> {
  if (doc[SUBMISSION_READ_FIELD] || !user || user.collection !== payload.config.admin.user) return null
  const config = collectionConfigOf(payload, collection)
  if (!config?.flattenedFields.some((field) => field.name === SUBMISSION_READ_FIELD)) return null
  const now = new Date().toISOString()
  try {
    await payload.update({
      collection: collection as never,
      id: doc.id,
      data: { [SUBMISSION_READ_FIELD]: now } as never,
      depth: 0,
      overrideAccess: true,
      context: { [SUBMISSION_READ_CONTEXT]: true },
    })
    return now
  } catch (error) {
    payload.logger.error({ err: error, msg: `[payload-canvas] Could not mark form submission ${String(doc.id)} as read` })
    return null
  }
}

const asMedia = (value: unknown): MediaLike | null => (value && typeof value === 'object' ? (value as MediaLike) : null)

/** The files of the submission: the attachments field and the plugin's own uploads, with the question they answer. */
function filesOf(doc: SubmissionDoc, attachments: string | null, answers: SubmissionAnswer[]): Array<{ key: string; label: string | null; media: MediaLike | null; id: unknown }> {
  const out: Array<{ key: string; label: string | null; media: MediaLike | null; id: unknown }> = []
  const labelOf = (name: string | null | undefined) => answers.find((a) => a.name === name)?.label ?? name ?? null
  const attached = attachments ? doc[attachments] : null
  for (const [index, value] of (Array.isArray(attached) ? attached : []).entries()) {
    out.push({ key: `a${index}`, label: null, media: asMedia(value), id: asMedia(value)?.id ?? value })
  }
  for (const [row, upload] of (doc.submissionUploads ?? []).entries()) {
    const values = Array.isArray(upload?.value) ? upload.value : [upload?.value]
    for (const [index, value] of values.entries()) {
      if (value === null || value === undefined) continue
      out.push({ key: `u${row}-${index}`, label: labelOf(upload?.field), media: asMedia(value), id: asMedia(value)?.id ?? value })
    }
  }
  return out
}

function AnswerValue({ answer }: { answer: SubmissionAnswer }) {
  if (answer.value.trim() === '') return <span className="form-submission__empty">No answer</span>
  const mailto = replyMailto(answer.value)
  if (mailto) return <a href={mailto}>{answer.value.trim()}</a>
  return <span className="form-submission__text">{answer.display}</span>
}

/** A page address for people: the path of a URL on this site, else the whole address. */
function pageLabel(url: string): string {
  try {
    const parsed = new URL(url, 'http://local')
    return parsed.host === 'local' ? `${parsed.pathname}${parsed.search}` : `${parsed.host}${parsed.pathname}`
  } catch {
    return url
  }
}

export async function SubmissionView({ id, payload, collectionSlug, field, i18n, req, user }: UIFieldServerProps) {
  if (id === undefined || id === null || !collectionSlug) return null
  const custom = (field.admin?.custom ?? {}) as Partial<SubmissionsAdminCustom>
  const viewer = (user ?? req?.user ?? null) as User | null
  const doc = (await payload
    .findByID({ collection: collectionSlug as never, id, depth: 1, overrideAccess: false, user: viewer })
    .catch(() => null)) as SubmissionDoc | null
  if (!doc) return null

  const config = collectionConfigOf(payload, collectionSlug)
  const form = await formOf(payload, formsSlugOf(config), doc.form)
  const answers = submissionAnswers(form?.fields, doc.submissionData)
  const summary = submissionSummary(doc.submissionData, form?.fields)
  const formTitle = form?.title?.trim() || 'Form'
  const mailto = replyMailto(summary.email, { subject: `Re: ${formTitle}` })
  const page = safePageUrl(doc[SUBMISSION_PAGE_FIELD])
  const sent = formatDateTime(doc.createdAt, i18n?.language)
  const files = filesOf(doc, custom.attachments ?? null, answers)
  const readAt = await markRead(payload, collectionSlug, doc, viewer)
  const opened = formatDateTime(doc[SUBMISSION_READ_FIELD] ?? readAt, i18n?.language)

  return (
    <div className="form-submission">
      <header className="form-submission__head">
        <div className="form-submission__heading">
          <p className="form-submission__form">{formTitle}</p>
          <h2 className="form-submission__title">{summary.line ?? 'Message'}</h2>
          <p className="form-submission__meta">
            {sent ? <>Sent {sent}</> : null}
            {page ? (
              <>
                {sent ? ' from ' : 'Sent from '}
                <a href={page} target="_blank" rel="noreferrer">
                  {pageLabel(page)}
                </a>
              </>
            ) : null}
            {opened && !readAt ? <> · Opened {opened}</> : null}
          </p>
        </div>
        {mailto ? (
          <Button el="anchor" url={mailto} buttonStyle="primary" size="medium" margin={false}>
            Reply by email
          </Button>
        ) : null}
      </header>

      {answers.length > 0 ? (
        <table className="form-submission__answers">
          <tbody>
            {answers.map((answer) => (
              <tr key={answer.name}>
                <th scope="row">{answer.label}</th>
                <td>
                  <AnswerValue answer={answer} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="form-submission__empty">This message has no answers.</p>
      )}

      {files.length > 0 ? (
        <section className="form-submission__files-section">
          <h3 className="form-submission__subtitle">Files</h3>
          <ul className="form-submission__files">
            {files.map(({ key, label, media, id: fileId }) => {
              const thumb = media ? thumbnailOf(media) : null
              const name = media?.filename ?? `File ${String(fileId)}`
              const size = fileSize(media?.filesize)
              const body = (
                <>
                  <span className="form-submission__thumb">{thumb ? <img src={thumb} alt="" /> : <span aria-hidden="true">{name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'}</span>}</span>
                  <span className="form-submission__file-text">
                    <span className="form-submission__file-name">{name}</span>
                    {label || size ? <span className="form-submission__file-meta">{[label, size].filter(Boolean).join(' · ')}</span> : null}
                  </span>
                </>
              )
              return (
                <li key={key}>
                  {media?.url ? (
                    <a className="form-submission__file" href={media.url} target="_blank" rel="noreferrer">
                      {body}
                    </a>
                  ) : (
                    <span className="form-submission__file">{body}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

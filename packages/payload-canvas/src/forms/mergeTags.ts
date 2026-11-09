// Merge tags in form emails, as in Contact Form 7: `{{name}}` is the answer of the field named
// "name", `{{*}}` is every answer as a table. The To, CC, BCC, Reply-To, From and Subject lines
// and the body use them. Pure and client-safe: the email hook (`formEmails`), the tests and the
// builder's "Insert field" menu use it.

import { TICK_FIELD_TYPES } from './answers'

/** One answer of a submission, for an email. `value` is display text ("Yes" for a ticked box). */
export type FormAnswer = { name: string; label: string; value: string }

/** The tag for every answer, as a table in an HTML body and as "Label: value" lines in text. */
export const ALL_ANSWERS_TAG = '{{*}}'

/** The tag for one field: `{{email}}`. */
export const mergeTag = (name: string) => `{{${name}}}`

const TAG = /\{\{\s*([^{}]+?)\s*\}\}/g

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])

/** Every answer as an HTML table: the field label, then the answer (line breaks kept). */
export function answersTable(answers: readonly FormAnswer[]): string {
  const rows = answers.map(
    (a) =>
      `<tr><th align="left" valign="top" style="padding:4px 12px 4px 0">${escapeHtml(a.label)}</th><td style="padding:4px 0">${escapeHtml(a.value).replace(/\r?\n/g, '<br>')}</td></tr>`,
  )
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.join('')}</table>`
}

/** Every answer as "Label: value" lines. */
export const answersText = (answers: readonly FormAnswer[]) => answers.map((a) => `${a.label}: ${a.value}`).join('\n')

export type MergeOptions = {
  /** The text is HTML: answers are escaped and `{{*}}` is a table. Else plain text. */
  html: boolean
  /** More tags that are not fields, for example `formSubmissionID`. */
  extra?: Readonly<Record<string, string>>
}

/**
 * The template with its tags replaced. `{{*}}` (also `{{*:table}}`, the form-builder plugin's
 * name) gives every answer. A field the visitor left empty or that was hidden gives ''. A tag
 * that names no field of the form stays as it is, so the editor sees the typo in the email.
 */
export function mergeTags(template: string | null | undefined, answers: readonly FormAnswer[], options: MergeOptions, known: ReadonlySet<string> = new Set()): string {
  if (!template) return ''
  const byName = new Map(answers.map((a) => [a.name, a.value]))
  return template.replace(TAG, (whole, raw: string) => {
    const name = raw.trim()
    if (name === '*' || name === '*:table') return options.html ? answersTable(answers) : answersText(answers)
    const value = byName.get(name) ?? options.extra?.[name] ?? (known.has(name) ? '' : null)
    if (value === null) return whole
    return options.html ? escapeHtml(value).replace(/\r?\n/g, '<br>') : value
  })
}

/** A header line without line breaks, so an answer cannot add headers. */
export const headerText = (text: string) => text.replace(/[\r\n]+/g, ' ').trim()

const ADDRESS = /^[^\s@<>",;:]+@[^\s@<>",;:]+\.[^\s@<>",;:]+$/
const NAMED_ADDRESS = /^(?:"[^"<>\r\n]*"|[^"<>,;:\r\n]*)\s*<[^\s@<>",;:]+@[^\s@<>",;:]+\.[^\s@<>",;:]+>$/

/**
 * The valid addresses of an address line (To, CC, BCC, Reply-To), separated by commas: a bare
 * address or `"Name" <address>`. Anything else goes, so an answer such as
 * `a@example.com Bcc: b@example.com` can never add a recipient.
 */
export function addressLine(text: string): string {
  return headerText(text)
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => ADDRESS.test(part) || NAMED_ADDRESS.test(part))
    .join(', ')
}

type FieldLike = { blockType?: string; name?: string | null; label?: string | null }
type RowLike = { field?: string | null; value?: unknown }

/**
 * The answers of a submission in the form's field order, with the fields' labels. Ticked boxes
 * read "Yes", unticked ones "No". Answers for names the form does not have come last.
 */
export function formAnswers(fields: readonly FieldLike[] | null | undefined, rows: readonly RowLike[] | null | undefined, skip: ReadonlySet<string> = new Set()): FormAnswer[] {
  const values = new Map<string, string>()
  for (const row of rows ?? []) {
    if (typeof row?.field !== 'string' || skip.has(row.field)) continue
    values.set(row.field, row.value === null || row.value === undefined ? '' : String(row.value))
  }
  const out: FormAnswer[] = []
  for (const field of fields ?? []) {
    const name = field.name
    if (!name || !values.has(name)) continue
    let value = values.get(name) as string
    if (TICK_FIELD_TYPES.has(field.blockType ?? '')) value = ['true', 'on', '1', 'yes'].includes(value.trim().toLowerCase()) ? 'Yes' : 'No'
    out.push({ name, label: field.label || name, value })
    values.delete(name)
  }
  for (const [name, value] of values) out.push({ name, label: name, value })
  return out
}

/** One email of a form, as the `emails` array stores it (`formEmailFields`). */
export type FormEmailConfig = {
  emailTo?: string | null
  fromName?: string | null
  emailFrom?: string | null
  replyTo?: string | null
  cc?: string | null
  bcc?: string | null
  subject?: string | null
  /** `html`: the body is `html`. Else (`richText`, the default) the rich text `message`. */
  bodyType?: 'richText' | 'html' | null
  html?: string | null
  message?: unknown
}

export type FormEmailMessage = { to: string; from: string; replyTo?: string; cc?: string; bcc?: string; subject: string; html: string; text: string }

export type FormEmailContext = {
  answers: readonly FormAnswer[]
  /** The rich text body (`message`) as HTML, still with its tags. '' for an HTML body. */
  richTextHtml?: string
  /** The site's sender (the email adapter's) and the address without a To. */
  defaults: { fromName: string; fromAddress: string; to?: string }
  /** More tags, for example `{ formSubmissionID: '12' }`. */
  extra?: Readonly<Record<string, string>>
  /** Names of every field of the form: their tags give '' when the visitor gave no answer. */
  fieldNames?: ReadonlySet<string>
}

const ALL_IN_PARAGRAPH = /<p([^>]*)>((?:(?!<\/p>)[\s\S])*?)(\{\{\s*\*(?::table)?\s*\}\})((?:(?!<\/p>)[\s\S])*?)<\/p>/g

/**
 * Rich text HTML with every `{{*}}` moved out of its paragraph, so the answers table never sits in
 * a `<p>`: "<p>Hi {{*}} bye</p>" -> "<p>Hi</p>{{*}}<p>bye</p>". Empty paragraphs go.
 */
export function tablesOutsideParagraphs(html: string): string {
  let out = html
  // A paragraph with two tags needs two rounds.
  for (let round = 0; round < 10; round++) {
    const next = out.replace(ALL_IN_PARAGRAPH, (_, attrs: string, before: string, tag: string, after: string) => `<p${attrs}>${before.trimEnd()}</p>${tag}<p${attrs}>${after.trimStart()}</p>`)
    if (next === out) break
    out = next.replace(/<p[^>]*>\s*<\/p>/g, '')
  }
  return out
}

/** Plain text of an HTML body, for the text part of the email. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/gi, '\n')
    .replace(/<\/th>/gi, ': ')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** `"Name" <address>`, or the address alone. Quotes in the name are dropped. */
function mailbox(name: string, address: string): string {
  const clean = name.replace(/["<>]/g, '').trim()
  return clean ? `"${clean}" <${address}>` : address
}

/**
 * The message of one form email for a submission. Every line and the body take merge tags; the
 * address lines keep only valid addresses (`addressLine`). From:
 * the From name with the From email; without a From email the site's own address; without both
 * the site's sender. A From email written as `"Name" <address>` (the plugin's style) stays.
 */
export function formEmailMessage(email: FormEmailConfig, context: FormEmailContext): FormEmailMessage {
  const known = context.fieldNames ?? new Set(context.answers.map((a) => a.name))
  const line = (template: string | null | undefined) => headerText(mergeTags(template, context.answers, { html: false, extra: context.extra }, known))
  const fromName = line(email.fromName)
  const fromEmail = line(email.emailFrom)
  const from =
    fromEmail && /<.+>/.test(fromEmail)
      ? fromEmail
      : mailbox(fromName || (fromEmail ? '' : context.defaults.fromName), fromEmail || context.defaults.fromAddress)
  const source = email.bodyType === 'html' ? (email.html ?? '') : (context.richTextHtml ?? '')
  const html = mergeTags(source, context.answers, { html: true, extra: context.extra }, known)
  const replyTo = addressLine(line(email.replyTo))
  const cc = addressLine(line(email.cc))
  const bcc = addressLine(line(email.bcc))
  return {
    to: addressLine(line(email.emailTo)) || context.defaults.to || '',
    from,
    ...(replyTo ? { replyTo } : {}),
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    subject: line(email.subject),
    html,
    text: htmlToText(html),
  }
}

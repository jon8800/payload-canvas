// What a form submission says, for people: the answers in the form's order with the form's labels,
// a one-line summary (name and email when present) and a reply link. Pure and client-safe: the
// submissions admin (list cell, detail view) and the starter's dashboard widget use it.

/** One answer, as `@payloadcms/plugin-form-builder` stores it in `submissionData`. */
export type SubmissionDataRow = { field?: string | null; value?: unknown }

/** The parts of a form field block the summary reads. */
export type SubmissionFormField = {
  blockType?: string | null
  name?: string | null
  label?: string | null
  options?: ReadonlyArray<{ label?: string | null; value?: string | null }> | null
}

export type SubmissionAnswer = {
  /** The field name the answer was sent for. */
  name: string
  /** The form field's label, else the name. */
  label: string
  /** The answer as sent. */
  value: string
  /** The answer for people: "Yes" / "No" for a checkbox, the option label for a choice. */
  display: string
  /** The form field's block type (`email`, `checkbox`, …). Null when the form has no field of that name any more. */
  type: string | null
}

export type SubmissionSummary = {
  name: string | null
  email: string | null
  /** The message, else the first other answer. */
  text: string | null
  /** One line for lists: "Ada Lovelace · ada@example.com", else the name, the email or the text. */
  line: string | null
}

// No characters that would add mailto headers (?, &, =) or break the link.
const EMAIL_VALUE = /^[^\s@<>()"',;:?&=#%/\\]+@[^\s@<>()"',;:?&=#%/\\]+\.[^\s@<>()"',;:?&=#%/\\.]+$/
const EMAIL_NAME = /e-?mail/i
const NAME_NAME = /name/i
const FIRST_NAME = /^(first|given|fore)[\s_-]?name$/i
const LAST_NAME = /^(last|family|sur)[\s_-]?name$|^surname$/i
const MESSAGE_NAME = /message|comment|question|details|enquiry|inquiry|note/i
const TRUE_VALUES = new Set(['true', 'on', '1', 'yes'])

/** True for a plain email address. */
export function isEmailAddress(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_VALUE.test(value.trim())
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function displayOf(field: SubmissionFormField | undefined, value: string): string {
  if (field?.blockType === 'checkbox') return TRUE_VALUES.has(value.trim().toLowerCase()) ? 'Yes' : 'No'
  const option = field?.options?.find((o) => o?.value === value)
  return option?.label?.trim() || value
}

/**
 * The answers in the form's field order, with the form's labels. Answers for names the form no
 * longer has come last, labelled with their name. Fields without an answer (hidden by display
 * conditions, or added later) and messages are left out.
 */
export function submissionAnswers(
  fields: readonly SubmissionFormField[] | null | undefined,
  rows: readonly SubmissionDataRow[] | null | undefined,
): SubmissionAnswer[] {
  const byName = new Map<string, string>()
  for (const row of rows ?? []) {
    if (typeof row?.field !== 'string' || row.field === '' || byName.has(row.field)) continue
    byName.set(row.field, asText(row.value))
  }
  const out: SubmissionAnswer[] = []
  const used = new Set<string>()
  for (const field of fields ?? []) {
    const name = typeof field?.name === 'string' ? field.name : ''
    if (!name || used.has(name) || field.blockType === 'message' || !byName.has(name)) continue
    used.add(name)
    const value = byName.get(name) ?? ''
    out.push({ name, label: field.label?.trim() || name, value, display: displayOf(field, value), type: field.blockType ?? null })
  }
  for (const [name, value] of byName) {
    if (!used.has(name)) out.push({ name, label: name, value, display: value, type: null })
  }
  return out
}

const filled = (answer: SubmissionAnswer) => answer.value.trim() !== '' && answer.type !== 'checkbox'
const key = (answer: SubmissionAnswer) => `${answer.name} ${answer.label}`

/**
 * Name, email and message of a submission. Email: an email field, else a field called "email",
 * else the first answer that looks like an address. Name: a field called "name" (first and last
 * name are joined). Text: a message-like field, else the first other answer.
 */
export function submissionSummary(
  rows: readonly SubmissionDataRow[] | null | undefined,
  fields?: readonly SubmissionFormField[] | null,
): SubmissionSummary {
  const answers = submissionAnswers(fields, rows).filter(filled)
  const email =
    answers.find((a) => a.type === 'email' && isEmailAddress(a.value)) ??
    answers.find((a) => EMAIL_NAME.test(key(a)) && isEmailAddress(a.value)) ??
    answers.find((a) => isEmailAddress(a.value))
  const rest = answers.filter((a) => a !== email)
  const first = rest.find((a) => FIRST_NAME.test(a.name) || FIRST_NAME.test(a.label))
  const last = rest.find((a) => LAST_NAME.test(a.name) || LAST_NAME.test(a.label))
  const nameAnswers = first && last ? [first, last] : [rest.find((a) => NAME_NAME.test(key(a)))].filter((a): a is SubmissionAnswer => Boolean(a))
  const name = nameAnswers.map((a) => a.display.trim()).join(' ') || null
  const others = rest.filter((a) => !nameAnswers.includes(a))
  const message = others.find((a) => MESSAGE_NAME.test(key(a))) ?? others[0]
  const emailText = email?.value.trim() ?? null
  const text = message?.display.trim() || null
  return { name, email: emailText, text, line: [name, emailText].filter(Boolean).join(' · ') || text }
}

/** A `mailto:` link that replies to `email`, or null when it is not an address. */
export function replyMailto(email: string | null | undefined, options: { subject?: string | null } = {}): string | null {
  if (!isEmailAddress(email)) return null
  const subject = options.subject?.trim()
  return `mailto:${encodeURI(email.trim())}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
}

/** One line of text, at most `max` characters, with an ellipsis when cut. */
export function shortAnswer(text: string | null | undefined, max = 90): string {
  const line = (text ?? '').replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/**
 * A page address a submission names, safe to link: an http(s) URL or a site path. Null otherwise.
 * Visitors send it, so nothing else (javascript:, data:) ever becomes a link.
 */
export function safePageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (url.length === 0 || url.length > 2000) return null
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

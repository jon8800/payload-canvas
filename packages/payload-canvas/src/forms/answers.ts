// The checks of one form answer: required, and the format of email, number, phone, web address,
// date, choice and file fields. Pure and client-safe: the site's form shows these messages under
// the field, and the submissions hook (`formSubmissionConditions`) runs the same checks again.

import type { FormFieldLike, FormValue } from './conditions'
import { isEmptyFormValue } from './conditions'

/** A form field with what its checks read. */
export type FormAnswerField = FormFieldLike & {
  label?: string | null
  options?: ReadonlyArray<{ value?: string | null }> | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Digits, spaces, "+", "-", ".", "(" and ")". At least 6 and at most 15 digits (E.164). */
const PHONE = /^\+?[\d\s().-]+$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Field types whose answer is a tick (true or false). */
export const TICK_FIELD_TYPES: ReadonlySet<string> = new Set(['checkbox', 'consent'])

/** Field types that take no answer from the visitor. */
const NO_ANSWER = new Set(['message'])

/** True for "+1 (555) 123-4567" and other phone numbers with 6 to 15 digits. */
export function isPhoneNumber(text: string): boolean {
  if (!PHONE.test(text)) return false
  const digits = text.replace(/\D/g, '').length
  return digits >= 6 && digits <= 15
}

/** True for "https://example.com/page" and "example.com". Only http and https. */
export function isWebAddress(text: string): boolean {
  if (/\s/.test(text)) return false
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return (url.protocol === 'https:' || url.protocol === 'http:') && /^[^.]+(\.[^.]+)+$/.test(url.hostname)
  } catch {
    return false
  }
}

/** True for a real calendar date written as YYYY-MM-DD (the value of `<input type="date">`). */
export function isDateText(text: string): boolean {
  const match = DATE.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * The message for an answer, or '' when it is fine. `value` is what the visitor entered: text,
 * or a boolean for a checkbox or consent box. A file field's value is the file name.
 */
export function formAnswerProblem(field: FormAnswerField, value: FormValue): string {
  const type = field.blockType ?? 'text'
  if (NO_ANSWER.has(type)) return ''
  const label = String(field.label || field.name || 'this field').toLowerCase()
  if (TICK_FIELD_TYPES.has(type)) return field.required && value !== true ? 'Tick this box to continue.' : ''
  const text = value === null || value === undefined || typeof value === 'boolean' ? '' : String(value).trim()
  if (isEmptyFormValue(text)) {
    if (!field.required) return ''
    if (type === 'select' || type === 'radio' || type === 'country' || type === 'state') return `Choose a ${label}.`
    if (type === 'file') return `Choose a file for ${label}.`
    return `Enter your ${label}.`
  }
  switch (type) {
    case 'email':
      return EMAIL.test(text) ? '' : 'Enter an email address like name@example.com.'
    case 'number':
      return Number.isFinite(Number(text)) ? '' : `Enter a number for ${label}.`
    case 'phone':
      return isPhoneNumber(text) ? '' : 'Enter a phone number, for example +1 555 123 4567.'
    case 'url':
      return isWebAddress(text) ? '' : 'Enter a web address like https://example.com.'
    case 'date':
      return isDateText(text) ? '' : 'Enter a date.'
    case 'select':
    case 'radio': {
      const options = (field.options ?? []).map((o) => o?.value).filter((v): v is string => typeof v === 'string')
      return options.length === 0 || options.includes(text) ? '' : `Choose one of the options for ${label}.`
    }
    default:
      return ''
  }
}

// A form's settings for AI agents: the form-builder plugin's fields outside `fields` (title,
// submit button, confirmation, redirect, emails) and the site's own settings groups (spam
// protection). Agents read and write rich text as plain text. Pure: no Payload, no I/O.

import { isRichText, plainToRichText, richTextToPlain } from '../core/bindings'
import { isPlainObject } from '../core/tree'

/** The settings format for agents. */
export const FORM_SETTINGS_GUIDE = [
  'FORM SETTINGS (updateFormSettings, getForm `settings`). Send only the keys you change:',
  '- title (text, required): the form\'s name in the admin.',
  '- submitButtonLabel (text): the label of the send button.',
  '- confirmationType: "message" (show confirmationMessage after sending) or "redirect" (go to `redirect`).',
  '- confirmationMessage (plain text, one paragraph per line; stored as rich text).',
  '- redirect: { type: "reference", reference: { relationTo: "pages", value: <page id> } } or { type: "custom", url: "/thanks" }. Needed when confirmationType is "redirect".',
  '- emails: the emails sent for each submission. A list that REPLACES all emails: [{ emailTo, cc?, bcc?, replyTo?, emailFrom?, subject, message }]. message is plain text. {{field_name}} in a text puts that answer in (e.g. emailTo "{{email}}" sends to the visitor, replyTo "{{email}}" lets you reply to them); {{*}} lists every answer.',
  '- Other groups this site adds (e.g. spamProtection) take the shape getForm shows; a group merges its keys.',
].join('\n')

/** Keys whose values are rich text in Payload and plain text for agents. */
const RICH_TEXT_KEYS = new Set(['confirmationMessage', 'message'])

/** A form's settings with rich text as plain text and without Payload's row ids. */
export function formSettingsView(doc: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (!(key in doc)) continue
    const value = plainValue(key, doc[key])
    if (value !== undefined) out[key] = value
  }
  return out
}

function plainValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (RICH_TEXT_KEYS.has(key) && isRichText(value)) return richTextToPlain(value)
  if (Array.isArray(value)) {
    return value.map((row) => {
      if (!isPlainObject(row)) return row
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) {
        if (k === 'id') continue
        const plain = plainValue(k, v)
        if (plain !== undefined) out[k] = plain
      }
      return out
    })
  }
  if (isPlainObject(value) && !isRichText(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const plain = plainValue(k, v)
      if (plain !== undefined) out[k] = plain
    }
    return out
  }
  return value
}

/** The stored value of a setting an agent sent: plain text becomes rich text where Payload stores rich text. */
function storedValue(key: string, value: unknown): unknown {
  if (RICH_TEXT_KEYS.has(key) && typeof value === 'string') return plainToRichText(value)
  if (Array.isArray(value)) {
    return value.map((row) => (isPlainObject(row) ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, storedValue(k, v)])) : row))
  }
  return value
}

/**
 * The changes for the regions' fields endpoint (`writeRegionFields`): one per top-level setting.
 * A group (redirect, spamProtection) merges into its stored value; other values replace.
 * `allowed` are the settings the form has. Returns an error string for an unknown key.
 */
export function formSettingsChanges(
  input: Record<string, unknown>,
  allowed: readonly string[],
  stored: Record<string, unknown>,
): Array<{ path: string; value: unknown }> | string {
  const changes: Array<{ path: string; value: unknown }> = []
  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue
    if (!allowed.includes(key)) return `"${key}" is not a setting of this form. Settings: ${allowed.join(', ')}.`
    let value = storedValue(key, raw)
    const before = stored[key]
    if (isPlainObject(value) && isPlainObject(before) && !isRichText(value)) value = { ...before, ...value }
    changes.push({ path: key, value })
  }
  if (changes.length === 0) return 'Send at least one setting to change.'
  return changes
}

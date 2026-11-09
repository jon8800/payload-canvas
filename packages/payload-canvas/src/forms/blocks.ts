// Builder block definitions for the field blocks of a form-builder form (`forms.fields`).
// Client-safe: Payload block configs in, plain definitions out.

import type { Block as PayloadBlockConfig } from 'payload'

import { fromPayloadBlocks } from '../blocks/payload'
import type { BlockDefinition } from '../core/types'
import { FORM_CONDITIONS_FIELD } from './conditions'

/** Prefix of the builder types: the form-builder block `text` is the builder type `formText`. */
export const FORM_FIELD_PREFIX = 'form'

/** Name of the form settings region. The app's form frame marks the submit button with it. */
export const FORM_SETTINGS_REGION = 'settings'

/** Library category of the form field blocks. */
export const FORM_FIELD_CATEGORY = 'Fields'

/** The builder type of a form-builder field block: `text` -> `formText`. */
export function formFieldType(slug: string): string {
  return `${FORM_FIELD_PREFIX}${slug.charAt(0).toUpperCase()}${slug.slice(1)}`
}

/** The form-builder block slug of a builder type: `formText` -> `text`. Null for other types. */
export function formFieldSlug(type: string): string | null {
  if (!type.startsWith(FORM_FIELD_PREFIX) || type.length === FORM_FIELD_PREFIX.length) return null
  const rest = type.slice(FORM_FIELD_PREFIX.length)
  return rest.charAt(0) === rest.charAt(0).toUpperCase() ? `${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : null
}

/** Labels and library tooltips of the known field types. Other blocks keep their own. */
const KNOWN: Record<string, { label: string; icon: string; description: string }> = {
  text: { label: 'Text', icon: 'text', description: 'A one-line answer, such as a name.' },
  email: { label: 'Email', icon: 'mail', description: 'An email address. The form checks its format.' },
  textarea: { label: 'Long text', icon: 'richText', description: 'A longer answer over several lines, such as a message.' },
  number: { label: 'Number', icon: 'hash', description: 'A number.' },
  phone: { label: 'Phone', icon: 'phone', description: 'A phone number. The form checks that it has 6 to 15 digits.' },
  url: { label: 'Web address', icon: 'link', description: 'A web address, such as https://example.com. The form checks its format.' },
  select: { label: 'Dropdown', icon: 'select', description: 'One choice from a list of options.' },
  radio: { label: 'Radio buttons', icon: 'radio', description: 'One choice from a few options, all shown at once.' },
  checkbox: { label: 'Checkbox', icon: 'check', description: 'A box to tick, for example to join the newsletter.' },
  consent: { label: 'Consent', icon: 'check', description: 'A box to tick next to text with a link, for example "I accept the privacy policy".' },
  country: { label: 'Country', icon: 'select', description: 'A list of countries.' },
  state: { label: 'State', icon: 'select', description: 'A list of US states.' },
  date: { label: 'Date', icon: 'calendar', description: 'A date, picked from a calendar.' },
  file: { label: 'File upload', icon: 'upload', description: 'A file the visitor uploads, such as a CV. You set the file types and the size limit.' },
  hidden: { label: 'Hidden field', icon: 'eyeOff', description: 'A value sent with every answer that visitors do not see, such as the campaign name.' },
  message: { label: 'Message', icon: 'richText', description: 'Text between the fields, such as a note. Visitors do not fill it in.' },
  upload: { label: 'File upload', icon: 'upload', description: 'A file the visitor uploads.' },
  payment: { label: 'Payment', icon: 'block', description: 'A payment field.' },
}

/** Fields that go on the Validation tab of a form field. The rest stays on the Field tab. */
const VALIDATION_FIELDS = new Set(['required', 'accept', 'maxSize', 'uploadCollection', 'mimeTypes', 'maxFileSize', 'multiple'])

/**
 * One definition per block of the form's `fields` blocks field. Types get the `form` prefix
 * (`formText`), so they never clash with page blocks; the stored data keeps the plugin's
 * `blockType`. The plugin's `forms` option calls this with the forms collection's own blocks.
 */
export function formFieldBlocks(blocks: readonly PayloadBlockConfig[]): BlockDefinition[] {
  const overrides = Object.fromEntries(
    blocks.map((block) => {
      const known = KNOWN[block.slug]
      return [
        block.slug,
        {
          category: FORM_FIELD_CATEGORY,
          ...(known ? { label: known.label, icon: known.icon } : {}),
          ai: { description: `${known?.label ?? block.slug} field of a form (form-builder "${block.slug}" block).` },
        },
      ]
    }),
  )
  return fromPayloadBlocks(blocks, { prefix: FORM_FIELD_PREFIX, overrides, onWarning: false }).map((def) => {
    const slug = def.payload?.slug ?? ''
    const known = KNOWN[slug]
    // A new field starts with a name and a label, so the form saves at once (the plugin requires
    // a name). Only the builder's insert uses these defaults; the stored data is unchanged.
    const fields = inTabs(withStartValues(def.fields, { name: slug, label: known?.label ?? def.label }))
    // Two fields with one name would overwrite each other's answers: a new or copied field gets `text2`.
    return { ...def, fields, uniqueProps: ['name'], ...(known ? { description: known.description } : {}) }
  })
}

type LooseField = Record<string, unknown> & { name?: unknown; fields?: unknown; defaultValue?: unknown }

/** The fields with `defaultValue` set on the top-level `name` and `label` fields (also inside rows) that have none. */
function withStartValues<T>(fields: T[], values: Record<string, string>): T[] {
  return fields.map((raw) => {
    const field = raw as unknown as LooseField
    if (Array.isArray(field.fields) && !field.name) return { ...field, fields: withStartValues(field.fields, values) } as T
    const name = typeof field.name === 'string' ? field.name : ''
    if (name in values && field.defaultValue === undefined) return { ...field, defaultValue: values[name] } as T
    return raw
  })
}

/**
 * The fields split over the tabs Field, Validation and Conditions (unnamed tabs: the data stays
 * as it is). Fields leave their rows; an empty row goes. Without validation or condition fields
 * the list stays as it is.
 */
function inTabs<T>(fields: T[]): T[] {
  const validation: T[] = []
  const conditions: T[] = []
  const pull = (list: T[]): T[] =>
    list.flatMap((raw) => {
      const field = raw as unknown as LooseField
      if (Array.isArray(field.fields) && !field.name) {
        const kept = pull(field.fields as T[])
        return kept.length > 0 ? [{ ...field, fields: kept } as T] : []
      }
      if (field.name === FORM_CONDITIONS_FIELD) conditions.push(raw)
      else if (typeof field.name === 'string' && VALIDATION_FIELDS.has(field.name)) validation.push(raw)
      else return [raw]
      return []
    })
  const main = pull(fields)
  if (validation.length === 0 && conditions.length === 0) return fields
  const tabs = [
    { label: 'Field', fields: main },
    ...(validation.length > 0 ? [{ label: 'Validation', fields: validation }] : []),
    ...(conditions.length > 0 ? [{ label: 'Conditions', fields: conditions }] : []),
  ]
  return [{ type: 'tabs', tabs } as T]
}

// Builder block definitions for the field blocks of a form-builder form (`forms.fields`).
// Client-safe: Payload block configs in, plain definitions out.

import type { Block as PayloadBlockConfig } from 'payload'

import { fromPayloadBlocks } from '../blocks/payload'
import type { BlockDefinition } from '../core/types'

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

/** Labels and library tooltips of the plugin's own field types. Other blocks keep their own. */
const KNOWN: Record<string, { label: string; icon: string; description: string }> = {
  text: { label: 'Text', icon: 'text', description: 'A one-line answer, such as a name.' },
  email: { label: 'Email', icon: 'mail', description: 'An email address. The form checks its format.' },
  textarea: { label: 'Long text', icon: 'richText', description: 'A longer answer over several lines, such as a message.' },
  number: { label: 'Number', icon: 'hash', description: 'A number.' },
  select: { label: 'Dropdown', icon: 'select', description: 'One choice from a list of options.' },
  radio: { label: 'Radio buttons', icon: 'select', description: 'One choice from a few options, all shown at once.' },
  checkbox: { label: 'Checkbox', icon: 'check', description: 'A box to tick, for example to accept the terms.' },
  country: { label: 'Country', icon: 'select', description: 'A list of countries.' },
  state: { label: 'State', icon: 'select', description: 'A list of US states.' },
  date: { label: 'Date', icon: 'calendar', description: 'A date.' },
  message: { label: 'Message', icon: 'richText', description: 'Text between the fields, such as a note. Visitors do not fill it in.' },
  upload: { label: 'File upload', icon: 'image', description: 'A file the visitor uploads.' },
  payment: { label: 'Payment', icon: 'block', description: 'A payment field.' },
}

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
    const fields = withStartValues(def.fields, { name: slug, label: known?.label ?? def.label })
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

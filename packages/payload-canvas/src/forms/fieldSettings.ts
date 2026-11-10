// Gravity Forms style settings for the field blocks of `@payloadcms/plugin-form-builder`: label
// visibility, description, placeholder, default value, the width presets, the display of radio
// buttons, and several files for a file field, plus the hidden fields that store the field's
// classes (the builder's Styles panel). `withFormFieldSettings` adds the settings a block lacks;
// the builder sorts them into its Field / Appearance / Validation tabs. Client-safe and pure: the
// site's form renderer reads the same helpers.

import type { Field } from 'payload'

import { BLOCK_KEY_MARKER } from '../blocks/payload'
import { FORM_CONDITIONS_FIELD } from './conditions'

/** The row key of a field's own classes (the box around label and input). Older forms typed them as "CSS class". */
export const FORM_FIELD_CLASS_KEY = 'cssClass'

/** The row key of a field's part classes (label, input, help text, error, options). */
export const FORM_FIELD_PARTS_KEY = 'partClasses'

/** `admin.custom.builderWidthPicker`: the builder edits the number as width buttons (full, 3/4, …). */
export const WIDTH_PICKER_MARKER = 'builderWidthPicker'

/** The widths the builder offers, in percent of the row. `width` stays a number, as the plugin stores it. */
export const FORM_FIELD_WIDTHS = [
  { value: 100, label: 'Full', title: 'Full width' },
  { value: 75, label: '3/4', title: 'Three quarters' },
  { value: 67, label: '2/3', title: 'Two thirds' },
  { value: 50, label: '1/2', title: 'Half' },
  { value: 33, label: '1/3', title: 'One third' },
  { value: 25, label: '1/4', title: 'One quarter' },
] as const

export type FormFieldWidth = (typeof FORM_FIELD_WIDTHS)[number]['value']

/**
 * The width the site draws for a stored width: the smallest preset that holds it (40 -> 50).
 * No width, 0 or above 75 -> 100 (full).
 */
export function formFieldWidth(width: unknown): FormFieldWidth {
  const percent = typeof width === 'number' ? width : typeof width === 'string' && width.trim() ? Number(width) : Number.NaN
  if (!Number.isFinite(percent) || percent <= 0 || percent > 75) return 100
  if (percent <= 25) return 25
  if (percent <= 34) return 33
  if (percent <= 50) return 50
  if (percent <= 67) return 67
  return 75
}

/** How radio buttons show: one per line, on one line, as joined buttons, or as cards. */
export const RADIO_DISPLAYS = ['list', 'inline', 'buttons', 'cards'] as const

export type RadioDisplay = (typeof RADIO_DISPLAYS)[number]

/** The display of a radio field. Unknown or missing: "list". */
export function radioDisplay(value: unknown): RadioDisplay {
  return (RADIO_DISPLAYS as readonly unknown[]).includes(value) ? (value as RadioDisplay) : 'list'
}

/** Most files a file field takes when it allows several and sets no number. */
export const DEFAULT_MAX_FILES = 5

/** Upper limit of `maxFiles`. */
export const MAX_FILES_LIMIT = 20

/** How many files a file field takes: 1, or its `maxFiles` (default 5, at most 20) when it allows several. */
export function maxFileCount(field: { multiple?: boolean | null; maxFiles?: number | null }): number {
  if (!field.multiple) return 1
  const own = typeof field.maxFiles === 'number' && Number.isFinite(field.maxFiles) && field.maxFiles >= 1 ? Math.floor(field.maxFiles) : DEFAULT_MAX_FILES
  return Math.min(own, MAX_FILES_LIMIT)
}

/** True when the field's label shows. "hidden" keeps it for screen readers only. */
export const isLabelShown = (field: { labelVisibility?: string | null }) => field.labelVisibility !== 'hidden'

/** The settings and the field types each one is for. */
const SETTING_TYPES = {
  description: ['text', 'email', 'textarea', 'number', 'phone', 'url', 'select', 'radio', 'checkbox', 'consent', 'country', 'state', 'date', 'file'],
  labelVisibility: ['text', 'email', 'textarea', 'number', 'phone', 'url', 'select', 'radio', 'country', 'state', 'date', 'file'],
  placeholder: ['text', 'email', 'textarea', 'number', 'phone', 'url', 'select', 'country', 'state'],
  defaultValue: ['email', 'country', 'state'],
  display: ['radio'],
  multiple: ['file'],
  classes: ['text', 'email', 'textarea', 'number', 'phone', 'url', 'select', 'radio', 'checkbox', 'consent', 'country', 'state', 'date', 'file', 'message'],
} as const satisfies Record<string, readonly string[]>

/** A file field's "Allow several files" box and its "Most files" number. */
export function fileCountFields(): Field[] {
  return [
    { name: 'multiple', type: 'checkbox', label: 'Allow several files' },
    {
      name: 'maxFiles',
      type: 'number',
      label: 'Most files',
      min: 1,
      max: MAX_FILES_LIMIT,
      admin: {
        placeholder: String(DEFAULT_MAX_FILES),
        description: `Empty: ${DEFAULT_MAX_FILES}. At most ${MAX_FILES_LIMIT}.`,
        condition: (_: unknown, siblings: { multiple?: unknown }) => siblings?.multiple === true,
        custom: { builderCondition: { field: 'multiple', truthy: true } },
      },
    },
  ] as Field[]
}

const SETTINGS: Record<keyof typeof SETTING_TYPES, Field[]> = {
  description: [
    {
      name: 'description',
      type: 'textarea',
      label: 'Description',
      localized: true,
      admin: { description: 'Help text under the field, for example what to write or why you ask.' },
    },
  ],
  labelVisibility: [
    {
      name: 'labelVisibility',
      type: 'select',
      label: 'Label visibility',
      defaultValue: 'visible',
      options: [
        { label: 'Visible', value: 'visible' },
        { label: 'Hidden (screen readers still read it)', value: 'hidden' },
      ],
    },
  ],
  placeholder: [{ name: 'placeholder', type: 'text', label: 'Placeholder', localized: true, admin: { description: 'Grey text inside the empty field.' } }],
  defaultValue: [{ name: 'defaultValue', type: 'text', label: 'Default value', localized: true }],
  display: [
    {
      name: 'display',
      type: 'select',
      label: 'Display',
      defaultValue: 'list',
      options: [
        { label: 'List', value: 'list' },
        { label: 'Inline', value: 'inline' },
        { label: 'Buttons', value: 'buttons' },
        { label: 'Cards', value: 'cards' },
      ],
      admin: { description: 'List: one option per line. Inline: on one line. Buttons: joined buttons. Cards: a box per option.' },
    },
  ],
  multiple: fileCountFields(),
  // Edited in the builder's Styles panel (`payload.classKeys`), hidden in Payload's own form.
  classes: [
    { name: FORM_FIELD_CLASS_KEY, type: 'text', label: 'CSS class', admin: { hidden: true, custom: { [BLOCK_KEY_MARKER]: 'className' } } },
    { name: FORM_FIELD_PARTS_KEY, type: 'json', label: 'Part classes', admin: { hidden: true, custom: { [BLOCK_KEY_MARKER]: 'partClassName' } } },
  ],
} as Record<keyof typeof SETTING_TYPES, Field[]>

type BlockLike = { slug: string; fields: Field[] }

/** The names of the data fields of a list, also inside rows, collapsibles and unnamed tabs. */
function fieldNames(fields: readonly Field[]): Set<string> {
  const out = new Set<string>()
  for (const field of fields) {
    if ('name' in field && typeof field.name === 'string' && field.name) out.add(field.name)
    else if ('fields' in field && Array.isArray(field.fields)) for (const name of fieldNames(field.fields)) out.add(name)
    else if (field.type === 'tabs') for (const tab of field.tabs) if (!('name' in tab && tab.name)) for (const name of fieldNames(tab.fields)) out.add(name)
  }
  return out
}

/**
 * The block with the settings it lacks for its type: description, label visibility, placeholder,
 * default value, radio display, several files, and the hidden class fields (the field's classes
 * and part classes, edited in the builder's Styles panel; the old "CSS class" values stay). The description goes right after the
 * label; the other settings go before the display conditions. Known types only; a setting the block
 * has already stays as it is. For the form-builder plugin's `fields` option:
 * `withFormFieldSettings(fields.text)`. The plugin stores form fields as JSON, so no migration is needed.
 */
export function withFormFieldSettings<T extends BlockLike>(block: T): T {
  const have = fieldNames(block.fields)
  const missing = (key: keyof typeof SETTING_TYPES) =>
    (SETTING_TYPES[key] as readonly string[]).includes(block.slug) ? SETTINGS[key].filter((field) => 'name' in field && !have.has(field.name)) : []
  const description = missing('description')
  const rest = (Object.keys(SETTING_TYPES) as Array<keyof typeof SETTING_TYPES>).filter((key) => key !== 'description').flatMap(missing)
  if (description.length === 0 && rest.length === 0) return block
  const labelAt = block.fields.findIndex((field) => fieldNames([field]).has('label'))
  const fields = [...block.fields]
  if (labelAt !== -1) fields.splice(labelAt + 1, 0, ...description)
  const conditionsAt = fields.findIndex((field) => 'name' in field && field.name === FORM_CONDITIONS_FIELD)
  fields.splice(conditionsAt === -1 ? fields.length : conditionsAt, 0, ...(labelAt === -1 ? description : []), ...rest)
  return { ...block, fields }
}

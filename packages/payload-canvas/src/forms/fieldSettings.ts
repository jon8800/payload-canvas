// Gravity Forms style settings for the field blocks of `@payloadcms/plugin-form-builder`:
// description, placeholder, default value, label visibility, the display of radio buttons, and
// several files for a file field, plus the hidden fields that store the field's classes (the
// builder's Styles panel). Only settings that change the content, the markup or the behaviour:
// looks, the width too, are classes. `withFormFieldSettings` adds the settings a block lacks and
// hides the plugin's `width`; the builder sorts them into its Field / Validation tabs. Client-safe
// and pure: the site's form renderer reads the same helpers.

import type { Field } from 'payload'

import type { Block } from '../core/types'
import { BLOCK_KEY_MARKER } from '../blocks/payload'
import { FORM_CONDITIONS_FIELD } from './conditions'

/** The row key of a field's own classes (the box around label and input). Older forms typed them as "CSS class". */
export const FORM_FIELD_CLASS_KEY = 'cssClass'

/** The row key of a field's part classes (label, input, help text, error, options). */
export const FORM_FIELD_PARTS_KEY = 'partClasses'

/** The plugin's `width` setting: a percentage of the row. The builder sets a field's width with classes instead. */
export const FORM_FIELD_WIDTH_KEY = 'width'

/**
 * The classes of the old width presets (percent of the row -> the field's width from the `sm`
 * breakpoint, less its share of the 1rem gap between fields, so the fields of one row fit). Full
 * width has no class. The site drew these before the field's width moved to the Styles panel.
 */
export const FORM_FIELD_WIDTH_CLASSES = {
  75: 'sm:w-[calc(75%-0.25rem)]',
  67: 'sm:w-[calc(66.667%-0.333rem)]',
  50: 'sm:w-[calc(50%-0.5rem)]',
  33: 'sm:w-[calc(33.333%-0.667rem)]',
  25: 'sm:w-[calc(25%-0.75rem)]',
} as const

/**
 * The class of a stored width: the smallest preset that holds it (40 -> the 50% class). No width,
 * 0, above 75 or not a number: '' (full width).
 */
export function formFieldWidthClass(width: unknown): string {
  const percent = typeof width === 'number' ? width : typeof width === 'string' && width.trim() ? Number(width) : Number.NaN
  if (!Number.isFinite(percent) || percent <= 0 || percent > 75) return ''
  if (percent <= 25) return FORM_FIELD_WIDTH_CLASSES[25]
  if (percent <= 34) return FORM_FIELD_WIDTH_CLASSES[33]
  if (percent <= 50) return FORM_FIELD_WIDTH_CLASSES[50]
  if (percent <= 67) return FORM_FIELD_WIDTH_CLASSES[67]
  return FORM_FIELD_WIDTH_CLASSES[75]
}

/** A class that sizes the box in a row or grid: width, size, flex basis, flex, grow, column span. */
const SIZING_CLASS = /^!?-?(w-|size-|basis-|col-span-|flex-(\d|auto|initial|\[)|grow(-|$))/

/** True when the classes set the box's width (at any breakpoint or state). */
export function setsWidth(className: string | null | undefined): boolean {
  return (className ?? '').split(/\s+/).some((name) => SIZING_CLASS.test(name.slice(name.lastIndexOf(':') + 1)))
}

/**
 * The field's classes with the class of its stored `width` added, unless they set a width
 * themselves. The same classes when there is nothing to add. The site renders old fields with it,
 * and `withWidthClass` stores it.
 */
export function withStoredWidth(className: string | null | undefined, width: unknown): string {
  const own = className?.trim() ?? ''
  const widthClass = formFieldWidthClass(width)
  if (!widthClass || setsWidth(own)) return own
  return own ? `${own} ${widthClass}` : widthClass
}

/**
 * A form field block of the time before widths were classes: its stored `width` becomes classes
 * (see `withStoredWidth`) and `width` becomes `null`, so the next save clears the plugin's value
 * and only the classes decide the width. The same block when it has no width. The builder runs it
 * when it opens a layout (`BlockDefinition.upgrade`).
 */
export function withWidthClass(block: Block): Block {
  const width = block.props?.[FORM_FIELD_WIDTH_KEY]
  if (width === undefined || width === null) return block
  const next: Block = { ...block, props: { ...block.props, [FORM_FIELD_WIDTH_KEY]: null } }
  const className = withStoredWidth(block.className, width)
  if (className) next.className = className
  return next
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
  placeholder: ['text', 'email', 'textarea', 'number', 'phone', 'url', 'select', 'country', 'state'],
  defaultValue: ['email', 'country', 'state'],
  labelVisibility: ['text', 'email', 'textarea', 'number', 'phone', 'url', 'select', 'radio', 'country', 'state', 'date', 'file'],
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
        { label: 'Hidden, read by screen readers', value: 'hidden' },
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

type LooseField = Record<string, unknown> & { name?: unknown; type?: unknown; fields?: unknown; admin?: unknown }

/**
 * The fields with the plugin's `width` number (also inside rows) hidden: a field's width is its
 * classes now (Styles panel). The stored value stays readable (`withWidthClass`). The same list
 * when there is no visible width.
 */
export function withHiddenWidth<T>(fields: T[]): T[] {
  let changed = false
  const out = fields.map((raw) => {
    const field = raw as unknown as LooseField
    if (Array.isArray(field.fields) && !field.name) {
      const inner = withHiddenWidth(field.fields)
      if (inner === field.fields) return raw
      changed = true
      return { ...field, fields: inner } as T
    }
    const admin = (field.admin ?? {}) as { hidden?: boolean }
    if (field.name !== FORM_FIELD_WIDTH_KEY || field.type !== 'number' || admin.hidden) return raw
    changed = true
    return { ...field, admin: { ...admin, hidden: true } } as T
  })
  return changed ? out : fields
}

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
 * The block with the settings it lacks for its type: description, placeholder, default value,
 * label visibility, radio display, several files, and the hidden class fields (the field's classes
 * and part classes, edited in the builder's Styles panel; the old "CSS class" values stay). The
 * description goes right after the label; the other settings go before the display conditions.
 * The plugin's `width` is hidden (`withHiddenWidth`): the width is classes. Known types only; a
 * setting the block has already stays as it is. For the form-builder plugin's `fields` option:
 * `withFormFieldSettings(fields.text)`. The plugin stores form fields as JSON, so no migration is needed.
 */
export function withFormFieldSettings<T extends BlockLike>(block: T): T {
  const have = fieldNames(block.fields)
  const missing = (key: keyof typeof SETTING_TYPES) =>
    (SETTING_TYPES[key] as readonly string[]).includes(block.slug) ? SETTINGS[key].filter((field) => 'name' in field && !have.has(field.name)) : []
  const description = missing('description')
  const rest = (Object.keys(SETTING_TYPES) as Array<keyof typeof SETTING_TYPES>).filter((key) => key !== 'description').flatMap(missing)
  const hidden = withHiddenWidth(block.fields)
  if (description.length === 0 && rest.length === 0) return hidden === block.fields ? block : { ...block, fields: hidden }
  const labelAt = hidden.findIndex((field) => fieldNames([field]).has('label'))
  const fields = [...hidden]
  if (labelAt !== -1) fields.splice(labelAt + 1, 0, ...description)
  const conditionsAt = fields.findIndex((field) => 'name' in field && field.name === FORM_CONDITIONS_FIELD)
  fields.splice(conditionsAt === -1 ? fields.length : conditionsAt, 0, ...(labelAt === -1 ? description : []), ...rest)
  return { ...block, fields }
}

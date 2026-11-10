// Forms on pages: the Form block and the Submit button block. A Form block either holds its own
// fields ("Build here": the form field blocks, a Submit button and layout blocks in its slot) or
// shows a form of the form-builder plugin's forms collection ("Use a saved form").
//
// `formBlocks()` gives the definitions an app lists in its blocks. They are client-safe and light:
// the plugin (`websiteBuilder({ forms })`) completes the Form block with the forms collection's
// settings fields and adds the field blocks (`formText`, …) made from the collection's own field
// blocks, so there is one definition of each field and of each setting. Pure: no Payload runtime.

import type { Field } from 'payload'

import { getBlockDefinition } from '../core/blocks'
import type { Block, BlockDefinition, StarterBlock } from '../core/types'
import { FORM_FIELD_CATEGORY, formFieldParts, formFieldSlug, formFieldType } from './blocks'

export { FORM_FIELD_PARTS, formFieldParts, type FormFieldPartName } from './blocks'

/** The Form block's type. */
export const FORM_BLOCK = 'form'

/** The Submit button block's type. */
export const FORM_SUBMIT_BLOCK = 'formSubmit'

/** The Form block's slot for its content. */
export const FORM_SLOT = 'children'

/** `admin.custom.builderFormActions`: the inspector shows "Edit form" and "Move into this page" here. */
export const FORM_ACTIONS_MARKER = 'builderFormActions'

/** Layout blocks a Form block takes next to its fields, when the site has them. */
export const FORM_LAYOUT_TYPES = ['stack', 'grid', 'heading', 'text', 'richText', 'divider', 'image'] as const

/** "build": the Form block holds its fields. "saved": it shows a form of the forms collection. */
export type FormMode = 'build' | 'saved'

/** The form-wide parts: every field inside uses these classes unless it sets its own. */
export const FORM_PARTS = {
  label: 'Labels',
  input: 'Inputs',
  help: 'Help texts',
  error: 'Error messages',
  button: 'Submit button',
} as const

export type FormPartName = keyof typeof FORM_PARTS

/** Default classes of the form-wide parts. */
export type FormPartClasses = Partial<Record<FormPartName, string>>

/** The mode of a Form block: its `mode`, else "saved" when it names a form (layouts from before), else "build". */
export function formBlockMode(props: Record<string, unknown> | undefined): FormMode {
  if (props?.mode === 'build' || props?.mode === 'saved') return props.mode
  return props?.form !== undefined && props.form !== null && props.form !== '' ? 'saved' : 'build'
}

/** The id of the form a Form block names (stored as an id, or a loaded document). Null without one. */
export function formIdOf(value: unknown): string | number | null {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

/** True for the builder type of a form field block (`formText`), never the Form or Submit block. */
export const isFormFieldType = (type: string) => type !== FORM_SUBMIT_BLOCK && formFieldSlug(type) !== null

/**
 * The form field blocks in `blocks`, in tree order: inside layout blocks too, never inside another
 * Form block (its fields belong to that form).
 */
export function formFieldsIn(blocks: readonly Block[]): Block[] {
  const out: Block[] = []
  const visit = (list: readonly Block[]) => {
    for (const block of list) {
      if (isFormFieldType(block.type)) out.push(block)
      if (block.type === FORM_BLOCK) continue
      for (const children of Object.values(block.slots ?? {})) visit(children)
    }
  }
  visit(blocks)
  return out
}

/** The field blocks of a Form block, in tree order. */
export function formBlockFields(form: Block): Block[] {
  return formFieldsIn(form.slots?.[FORM_SLOT] ?? [])
}

/** The Submit button blocks of a Form block, in tree order. */
export function formSubmitBlocks(form: Block): Block[] {
  const out: Block[] = []
  const visit = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.type === FORM_SUBMIT_BLOCK) out.push(block)
      if (block.type !== FORM_BLOCK) for (const children of Object.values(block.slots ?? {})) visit(children)
    }
  }
  visit(form.slots?.[FORM_SLOT] ?? [])
  return out
}

/** The new Form block's content: a ready contact form. */
const STARTER_CHILDREN: StarterBlock[] = [
  { type: formFieldType('text'), props: { name: 'name', label: 'Name', required: true, width: 50 } },
  { type: formFieldType('email'), props: { name: 'email', label: 'Email', required: true, width: 50 } },
  { type: formFieldType('textarea'), props: { name: 'message', label: 'Message', required: true } },
  { type: FORM_SUBMIT_BLOCK, props: { label: 'Send message' } },
]

export type FormBlocksOptions = {
  /** Slug of the forms collection. Default "forms". */
  collection?: string
  /** Default classes of the form-wide parts (labels, inputs, help texts, errors, the button). */
  partClassNames?: FormPartClasses
  /** Classes a new Form block starts with. */
  defaultClassName?: string
}

const FORM_AI = [
  'A form visitors fill in and send; answers are stored as form submissions.',
  'Two modes (`mode`): "build" (default for a new form): the form\'s own fields are its children, in slot "children";',
  '"saved": shows the form in `form` (an id of the forms collection) as it is, and children are not used.',
  'In "build" mode put form field blocks (formText, formEmail, formTextarea, formSelect, formRadio, formCheckbox, …), one formSubmit block,',
  'and layout blocks (stack, grid, heading, text, richText, divider, image) in "children"; fields may sit inside a stack or grid of the form.',
  'Every field needs a `name` (letters, digits, "_"), unique in this form, and usually a `label`. `width` is 100, 75, 67, 50, 33 or 25.',
  'Form field blocks and formSubmit go only inside a Form block. Settings (title, submitButtonLabel, confirmationType, confirmationMessage, redirect, emails, spamProtection) are props of the Form block.',
  'The form is saved to the forms collection when the page is published; do not set `form` in "build" mode.',
].join(' ')

/**
 * The Form block and the Submit button block, for the app's block list. The plugin completes the
 * Form block (settings, the slot's block types) and adds the field blocks, when `websiteBuilder({ forms })`
 * is on and the list has a Form block.
 */
export function formBlocks(options: FormBlocksOptions = {}): BlockDefinition[] {
  const classes = options.partClassNames ?? {}
  const parts = Object.fromEntries(
    (Object.keys(FORM_PARTS) as FormPartName[]).map((name) => [name, { label: FORM_PARTS[name], ...(classes[name] ? { defaultClassName: classes[name] } : {}) }]),
  )
  const form: BlockDefinition = {
    type: FORM_BLOCK,
    label: 'Form',
    icon: 'form',
    category: 'Interactive',
    description: 'A form visitors fill in and send. Build its fields right here, or show a saved form.',
    fields: formModeFields(options.collection ?? 'forms'),
    slots: { [FORM_SLOT]: { label: 'Fields', disallow: [FORM_BLOCK], description: 'Form fields, the submit button and layout blocks go here.' } },
    uniqueScope: true,
    parts,
    ...(options.defaultClassName ? { defaultClassName: options.defaultClassName } : {}),
    starter: { props: { mode: 'build' }, slots: { [FORM_SLOT]: STARTER_CHILDREN } },
    ai: {
      description: FORM_AI,
      example: {
        type: FORM_BLOCK,
        props: { mode: 'build', title: 'Contact', submitButtonLabel: 'Send' },
        className: 'flex flex-wrap gap-x-4 gap-y-5',
        slots: {
          [FORM_SLOT]: [
            { id: 'f1', type: formFieldType('text'), props: { name: 'name', label: 'Name', required: true, width: 50 } },
            { id: 'f2', type: formFieldType('email'), props: { name: 'email', label: 'Email', required: true, width: 50 } },
            { id: 'f3', type: FORM_SUBMIT_BLOCK, props: { label: 'Send' } },
          ],
        },
      },
    },
  }
  const submit: BlockDefinition = {
    type: FORM_SUBMIT_BLOCK,
    label: 'Submit button',
    icon: 'button',
    category: FORM_FIELD_CATEGORY,
    description: 'The button that sends the form. Goes inside a Form block.',
    ancestors: [FORM_BLOCK],
    // The block is the row around the button (the check and a refused submission's problems show there too).
    parts: { button: { label: 'Button' } },
    fields: [
      {
        name: 'label',
        type: 'text',
        label: 'Label',
        localized: true,
        admin: { placeholder: 'The form’s submit button label', description: 'Empty: the label in the form’s settings.' },
      },
    ],
    ai: { description: 'The send button of the Form block it sits in. `label` is its text. Its classes style the button; empty classes use the form\'s button classes.' },
  }
  return [form, submit]
}

/** The Form block's own fields: the mode, the saved form, and the actions. */
function formModeFields(collection: string): Field[] {
  return [
    {
      name: 'mode',
      type: 'radio',
      label: 'Form fields',
      options: [
        { label: 'Build here', value: 'build' },
        { label: 'Use a saved form', value: 'saved' },
      ],
      admin: {
        layout: 'horizontal',
        description: 'Build here: the fields are blocks inside this form. Use a saved form: show a form from the Forms collection.',
      },
    },
    {
      name: 'form',
      type: 'relationship',
      relationTo: collection,
      label: 'Saved form',
      admin: {
        description: 'The form to show. Its fields are edited in the form builder.',
        // Layouts from before the modes have no `mode`: they show a saved form.
        custom: { builderCondition: { field: 'mode', notEquals: 'build' } },
      },
    },
    { name: 'formActions', type: 'ui', admin: { custom: { [FORM_ACTIONS_MARKER]: true } } } as unknown as Field,
  ] as Field[]
}

/** The settings sections of a form (the form builder's panel and the Form block), with the forms collection's own setting fields. */
export const FORM_SETTINGS_SECTIONS = [
  { label: 'General', fields: ['title', 'submitButtonLabel'] },
  { label: 'After submit', fields: ['confirmationType', 'confirmationMessage', 'redirect'] },
  { label: 'Mail', fields: ['emails'] },
] as const

/** The forms collection's settings in the order of the sections, then its other groups (spam protection). */
export function formSettingNames(fields: readonly Field[]): string[] {
  const names = new Set(fields.flatMap((f) => ('name' in f && typeof f.name === 'string' ? [f.name] : [])))
  const known = new Set<string>(FORM_SETTINGS_SECTIONS.flatMap((s) => s.fields))
  const sections = FORM_SETTINGS_SECTIONS.flatMap((s) => s.fields.filter((name) => names.has(name)))
  const groups = fields.flatMap((f) => (f.type === 'group' && 'name' in f && typeof f.name === 'string' && f.name && !known.has(f.name) && !f.admin?.hidden ? [f.name] : []))
  return [...sections, ...groups]
}

type LooseField = Record<string, unknown> & { name?: string; type?: string; admin?: Record<string, unknown>; virtual?: unknown }

/**
 * A setting field as a prop of the Form block: never required (the sync fills the title), and
 * without virtual fields inside (the Turnstile site key is a value Payload computes on read of the
 * form, never part of the block).
 */
function asBlockSetting(field: Field): Field {
  const { required: _required, ...rest } = field as LooseField
  if (Array.isArray(rest.fields)) rest.fields = (rest.fields as LooseField[]).filter((f) => !f.virtual).map((f) => asBlockSetting(f as unknown as Field))
  return rest as unknown as Field
}

/**
 * The Form block's settings fields: the sections General, After submit and Mail, then one section
 * per other group (spam protection), all shown only in "build" mode. `fields` are the forms
 * collection's top-level fields (functions already turned into builder conditions).
 */
export function formSettingsFields(fields: readonly Field[]): Field[] {
  const byName = new Map(fields.flatMap((f) => ('name' in f && typeof f.name === 'string' ? [[f.name, f] as const] : [])))
  const shown = { builderCondition: { field: 'mode', notEquals: 'saved' } }
  const sections: Field[] = FORM_SETTINGS_SECTIONS.flatMap((section, index) => {
    const list = section.fields.flatMap((name) => (byName.has(name) ? [asBlockSetting(byName.get(name)!)] : []))
    if (list.length === 0) return []
    return [{ type: 'collapsible', label: section.label, fields: list, admin: { initCollapsed: index > 0, custom: shown } } as Field]
  })
  const known = new Set<string>(FORM_SETTINGS_SECTIONS.flatMap((s) => s.fields))
  const groups = formSettingNames(fields).filter((name) => !known.has(name))
  for (const name of groups) {
    const group = byName.get(name) as LooseField
    const label = typeof group.label === 'string' ? group.label : name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
    sections.push({ type: 'collapsible', label, fields: [asBlockSetting(group as unknown as Field)], admin: { initCollapsed: true, custom: shown } } as Field)
  }
  return sections
}

/** The parts of a field definition for pages and the form builder, with its type's parts. */
export function withFieldParts(def: BlockDefinition): BlockDefinition {
  const slug = def.payload?.slug ?? formFieldSlug(def.type)
  const parts = slug ? formFieldParts(slug) : undefined
  return parts ? { ...def, parts } : def
}

export type PageFormsInput = {
  /** The field block definitions of the forms collection (`formFieldBlocks`). */
  fields: readonly BlockDefinition[]
  /** The Form block's settings fields (`formSettingsFields`). */
  settings: readonly Field[]
  /** Slug of the forms collection. */
  collection: string
}

/**
 * The app's block list with forms on pages completed: the Form block gets its settings, the saved
 * form's collection and the block types its slot takes; the field blocks join the list (replacing
 * any of the same type) and go only inside a Form block. Returns the list as it is when it has no
 * Form block with a children slot.
 */
export function withPageForms(blocks: readonly BlockDefinition[], input: PageFormsInput): BlockDefinition[] {
  const form = getBlockDefinition(blocks, FORM_BLOCK)
  if (!form?.slots?.[FORM_SLOT]) return [...blocks]
  const fieldTypes = input.fields.map((def) => def.type)
  const layout = FORM_LAYOUT_TYPES.filter((type) => blocks.some((b) => b.type === type))
  const settingNames = new Set(input.settings.flatMap(dataNamesOf))
  const ownFields = form.fields
    .filter((f) => !('name' in f) || !settingNames.has(f.name))
    .map((f) => ('name' in f && f.name === 'form' && f.type === 'relationship' ? ({ ...f, relationTo: input.collection } as Field) : f))
  const completed: BlockDefinition = {
    ...form,
    fields: [...ownFields, ...input.settings],
    slots: { ...form.slots, [FORM_SLOT]: { ...form.slots[FORM_SLOT], allow: [...fieldTypes, FORM_SUBMIT_BLOCK, ...layout] } },
  }
  const pageFields = input.fields.map((def) => ({ ...withFieldParts(def), ancestors: [FORM_BLOCK] }))
  const out = blocks.filter((b) => !fieldTypes.includes(b.type)).map((b) => (b.type === FORM_BLOCK ? completed : b.type === FORM_SUBMIT_BLOCK ? { ...b, ancestors: [FORM_BLOCK] } : b))
  return [...out, ...pageFields]
}

/** The data names of a field (inside collapsibles and rows too). */
function dataNamesOf(field: Field): string[] {
  if ('name' in field && typeof field.name === 'string' && field.name) return [field.name]
  if ('fields' in field && Array.isArray(field.fields)) return field.fields.flatMap(dataNamesOf)
  return []
}

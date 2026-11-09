// More field types for `@payloadcms/plugin-form-builder`, as Payload block configs for the
// plugin's `fields` option: phone, web address, hidden field, consent box and file upload. And the
// email fields of a form, Contact Form 7 style, for the plugin's `formOverrides.fields`.
// Client-safe. The app renders the field types; `formSubmissionConditions` checks their answers
// and `formFileUploads` stores the files.

import type { Block, Field } from 'payload'

/** `admin.custom.builderMergeTags`: the builder adds an "Insert field" menu with the form's merge tags. */
export const MERGE_TAGS_MARKER = 'builderMergeTags'

const mergeTags = { [MERGE_TAGS_MARKER]: true }

const name: Field = { name: 'name', type: 'text', label: 'Name', required: true, admin: { description: 'Lowercase, no spaces. Emails show the answer with {{name}}.' } }
const label: Field = { name: 'label', type: 'text', label: 'Label', localized: true }
const width: Field = { name: 'width', type: 'number', label: 'Field width (percentage)', min: 10, max: 100 }
const required: Field = { name: 'required', type: 'checkbox', label: 'Required' }
const placeholder: Field = { name: 'placeholder', type: 'text', label: 'Placeholder', localized: true }

const textLike = (slug: string, singular: string, plural: string): Block => ({
  slug,
  labels: { singular, plural },
  fields: [
    { type: 'row', fields: [name, label] },
    { type: 'row', fields: [width, { name: 'defaultValue', type: 'text', label: 'Default value', localized: true }] },
    placeholder,
    required,
  ],
})

/** A phone number. The form checks that it has 6 to 15 digits. */
export const phoneFormField: Block = textLike('phone', 'Phone', 'Phones')

/** A web address. The form checks that it is an http or https address. */
export const urlFormField: Block = textLike('url', 'Web address', 'Web addresses')

/** A value sent with every answer that visitors do not see, for example the campaign. */
export const hiddenFormField: Block = {
  slug: 'hidden',
  labels: { singular: 'Hidden field', plural: 'Hidden fields' },
  fields: [
    { type: 'row', fields: [name, { ...label, admin: { description: 'For emails and submissions only. Visitors do not see it.' } } as Field] },
    { name: 'defaultValue', type: 'text', label: 'Value', admin: { description: 'Sent with every answer.' } },
  ],
}

/** A box to tick whose text is rich text, so it can link to the privacy policy. */
export const consentFormField: Block = {
  slug: 'consent',
  labels: { singular: 'Consent', plural: 'Consents' },
  fields: [
    { type: 'row', fields: [name, { ...label, admin: { description: 'A short name for emails and submissions.' } } as Field] },
    {
      name: 'text',
      type: 'richText',
      label: 'Text',
      localized: true,
      admin: { description: 'The text next to the box. Select words and add a link, for example to the privacy policy.' },
    },
    width,
    { ...required, defaultValue: true } as Field,
  ],
}

/** Default and upper limit of a file field's size, in MB. */
export const FILE_FIELD_MAX_MB = 10

/** A file the visitor uploads. `formFileUploads` stores it in the media collection. */
export const fileFormField: Block = {
  slug: 'file',
  labels: { singular: 'File upload', plural: 'File uploads' },
  fields: [
    { type: 'row', fields: [name, label] },
    width,
    required,
    {
      name: 'accept',
      type: 'text',
      label: 'Allowed file types',
      defaultValue: 'image/*, application/pdf',
      admin: { description: 'File types or endings, separated by commas, for example "image/*, application/pdf, .docx". Empty: any type.' },
    },
    {
      name: 'maxSize',
      type: 'number',
      label: 'Largest file (MB)',
      defaultValue: 5,
      min: 0.1,
      max: FILE_FIELD_MAX_MB,
      admin: { description: `At most ${FILE_FIELD_MAX_MB} MB.` },
    },
  ],
}

/** The extra field types by slug, for the plugin's `fields` option. */
export const moreFormFields = {
  phone: phoneFormField,
  url: urlFormField,
  hidden: hiddenFormField,
  consent: consentFormField,
  file: fileFormField,
} as const

const tagHelp = 'Type {{name}} for a field’s answer, or use Insert field.'

/**
 * The fields of one form email: To, From name, From email, Reply-To, CC, BCC, Subject and the body
 * (rich text or custom HTML). The plugin's own names stay, so stored emails keep working; the
 * from name, the body type and the HTML body are new. Every line and the body take merge tags.
 */
export function formEmailFields(): Field[] {
  return [
    {
      name: 'emailTo',
      type: 'text',
      label: 'To',
      admin: { placeholder: 'owner@example.com or {{email}}', description: `Addresses separated by commas. {{email}} sends to the visitor. ${tagHelp}`, custom: mergeTags },
    },
    {
      type: 'row',
      fields: [
        { name: 'fromName', type: 'text', label: 'From name', admin: { placeholder: 'Your site', custom: mergeTags } },
        { name: 'emailFrom', type: 'text', label: 'From email', admin: { placeholder: 'noreply@example.com', description: 'Empty: the site’s address.' } },
      ],
    },
    { name: 'replyTo', type: 'text', label: 'Reply-To', admin: { placeholder: '{{email}}', custom: mergeTags } },
    {
      type: 'row',
      fields: [
        { name: 'cc', type: 'text', label: 'CC', admin: { custom: mergeTags } },
        { name: 'bcc', type: 'text', label: 'BCC', admin: { custom: mergeTags } },
      ],
    },
    { name: 'subject', type: 'text', label: 'Subject', localized: true, required: true, defaultValue: 'New message: {{formTitle}}', admin: { custom: mergeTags } },
    {
      name: 'bodyType',
      type: 'radio',
      label: 'Body',
      defaultValue: 'richText',
      options: [
        { label: 'Rich text', value: 'richText' },
        { label: 'Custom HTML', value: 'html' },
      ],
      admin: { layout: 'horizontal' },
    },
    {
      name: 'message',
      type: 'richText',
      label: 'Message',
      localized: true,
      admin: {
        description: `${tagHelp} {{*}} adds every answer as a table.`,
        condition: (_: unknown, siblings: { bodyType?: unknown }) => siblings?.bodyType !== 'html',
        custom: { ...mergeTags, builderCondition: { field: 'bodyType', notEquals: 'html' } },
      },
    },
    {
      name: 'html',
      type: 'code',
      label: 'HTML body',
      localized: true,
      admin: {
        language: 'html',
        description: `Your own HTML. ${tagHelp} {{*}} adds every answer as a table. Answers are escaped.`,
        condition: (_: unknown, siblings: { bodyType?: unknown }) => siblings?.bodyType === 'html',
        custom: { ...mergeTags, builderCondition: { field: 'bodyType', equals: 'html' } },
      },
    },
  ] as Field[]
}

/**
 * The forms collection's fields with the emails of `formEmailFields`, for
 * `formBuilderPlugin({ formOverrides: { fields: ({ defaultFields }) => withFormEmailFields(defaultFields) } })`.
 * The `emails` array keeps its access and description.
 */
export function withFormEmailFields(fields: readonly Field[]): Field[] {
  return fields.map((field) =>
    'name' in field && field.name === 'emails' && field.type === 'array'
      ? ({ ...field, label: 'Emails', labels: { singular: 'Email', plural: 'Emails' }, fields: formEmailFields() } as Field)
      : field,
  )
}

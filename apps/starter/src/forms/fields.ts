// The form-builder field types this site offers (`formBuilderPlugin({ fields })` in
// payload.config.ts): the plugin's own, and the extra types of payload-canvas (`moreFormFields`:
// phone, web address, hidden field, consent, file upload). The builder's canvas gets a preview
// component for each (CanvasClient). Client-safe.
import { formFieldType } from 'payload-canvas/forms'

/** The plugin's own field types this site uses. */
export const PLUGIN_FORM_FIELD_SLUGS = ['text', 'email', 'textarea', 'select', 'radio', 'checkbox', 'number', 'date', 'message', 'country', 'state'] as const

/** The extra field types from payload-canvas (`moreFormFields`). */
export const MORE_FORM_FIELD_SLUGS = ['phone', 'url', 'hidden', 'consent', 'file'] as const

export const FORM_FIELD_SLUGS = [...PLUGIN_FORM_FIELD_SLUGS, ...MORE_FORM_FIELD_SLUGS] as const

export type FormFieldSlug = (typeof FORM_FIELD_SLUGS)[number]

/** The builder types of the form fields (`formText`, …). */
export const FORM_FIELD_TYPES = FORM_FIELD_SLUGS.map(formFieldType)

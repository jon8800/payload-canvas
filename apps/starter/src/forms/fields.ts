// The form-builder field types this site offers (`formBuilderPlugin({ fields })` in
// payload.config.ts). The builder's canvas gets a preview component for each (CanvasClient).
// Client-safe.
import { formFieldType } from 'payload-canvas/forms'

export const FORM_FIELD_SLUGS = ['text', 'email', 'textarea', 'select', 'checkbox', 'number', 'message', 'country', 'state'] as const

export type FormFieldSlug = (typeof FORM_FIELD_SLUGS)[number]

/** The builder types of the form fields (`formText`, …). */
export const FORM_FIELD_TYPES = FORM_FIELD_SLUGS.map(formFieldType)

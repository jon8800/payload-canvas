// Server side of form display conditions and answer checks: a `beforeValidate` hook for the
// form-builder plugin's submissions collection. It reads the form, works out which fields the
// visitor's answers hide, drops the values of hidden fields, and refuses a submission that leaves a
// shown required field empty or gives an answer in the wrong format (email, phone, web address,
// number, date, an option the field does not have). A hidden required field is never required.

import { ValidationError, type CollectionBeforeValidateHook } from 'payload'

import { formAnswerProblem, TICK_FIELD_TYPES, type FormAnswerField } from './answers'
import { hiddenFormFields, isEmptyFormValue, isFormFieldShown, type FormFieldLike, type FormValue } from './conditions'

/** One answer, as the plugin stores it in `submissionData`. */
export type SubmissionRow = { field?: string | null; value?: unknown; id?: string | null }

type FormFieldWithLabel = FormAnswerField

/** A checkbox or consent answer arrives as text ("true"); the conditions compare booleans. */
function answerValue(field: FormFieldLike | undefined, value: unknown): FormValue {
  if (TICK_FIELD_TYPES.has(field?.blockType ?? '')) {
    if (typeof value === 'boolean') return value
    return typeof value === 'string' ? ['true', 'on', '1', 'yes'].includes(value.trim().toLowerCase()) : false
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return value === null || value === undefined ? undefined : String(value)
}

const hasName = (field: FormFieldLike): field is FormFieldLike & { name: string } => typeof field.name === 'string' && field.name !== ''

/**
 * The answers to keep, the shown required fields left empty, and the shown fields whose answer has
 * the wrong format (`invalid`, with the message). Pure: the hook and the tests use it. Answers for
 * hidden fields are dropped; answers for names the form does not have stay.
 */
export function applyFormConditions(
  fields: readonly FormFieldWithLabel[] | null | undefined,
  rows: readonly SubmissionRow[] | null | undefined,
): { rows: SubmissionRow[]; hidden: Set<string>; missing: FormFieldWithLabel[]; invalid: Array<{ field: FormFieldWithLabel; message: string }> } {
  const named = (fields ?? []).filter(hasName)
  const byName = new Map(named.map((f) => [f.name, f]))
  const values: Record<string, FormValue> = {}
  for (const row of rows ?? []) {
    if (typeof row?.field !== 'string') continue
    values[row.field] = answerValue(byName.get(row.field), row.value)
  }
  const hidden = hiddenFormFields(named, values)
  const kept = (rows ?? []).filter((row) => typeof row?.field !== 'string' || !hidden.has(row.field))
  const missing = named.filter((field) => {
    if (!field.required || field.blockType === 'message' || !isFormFieldShown(field, hidden)) return false
    const value = values[field.name]
    return TICK_FIELD_TYPES.has(field.blockType ?? '') ? value !== true : isEmptyFormValue(value)
  })
  const invalid = named.flatMap((field) => {
    if (missing.includes(field) || !isFormFieldShown(field, hidden)) return []
    const message = formAnswerProblem(field, values[field.name])
    return message ? [{ field, message }] : []
  })
  return { rows: kept, hidden, missing, invalid }
}

export type FormSubmissionConditionsOptions = {
  /** Slug of the forms collection. Default "forms" (the plugin's default). */
  forms?: string
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

/**
 * The submissions hook. Add it to the form-builder plugin:
 * `formSubmissionOverrides: { hooks: { beforeValidate: [formSubmissionConditions()] } }`.
 * Runs on create only. A form that cannot be read is left to the plugin's own check.
 */
export function formSubmissionConditions(options: FormSubmissionConditionsOptions = {}): CollectionBeforeValidateHook {
  const formsSlug = options.forms ?? 'forms'
  return async ({ collection, data, operation, req }) => {
    if (operation !== 'create' || !data) return data
    const id = idOf(data.form)
    if (id === null) return data
    const form = (await req.payload
      .findByID({ collection: formsSlug as never, id, depth: 0, req, overrideAccess: true })
      .catch(() => null)) as { fields?: FormFieldWithLabel[] } | null
    if (!form) return data
    const { rows, missing, invalid } = applyFormConditions(form.fields, data.submissionData as SubmissionRow[] | undefined)
    if (missing.length > 0 || invalid.length > 0) {
      throw new ValidationError({
        collection: collection.slug,
        req,
        errors: [
          ...missing.map((field) => ({ path: 'submissionData', message: `${field.label || field.name} is required.` })),
          ...invalid.map(({ field, message }) => ({ path: 'submissionData', message: `${field.label || field.name}: ${message}` })),
        ],
      })
    }
    return { ...data, submissionData: rows }
  }
}

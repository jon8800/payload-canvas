// The form builder's canvas preview of one form field: the site's own field part (FormParts),
// with the block attributes on its root element, so a click on the canvas selects the field.
// Fields with display conditions show them in a small note; the preview always shows every field.
import type { BlockComponentProps } from 'payload-canvas/react'
import { describeConditions, formFieldSlug } from 'payload-canvas/forms'
import { FormFieldView, initialValues, type FormField } from './FormParts'

export function FormFieldBlock({ block, props, attributes }: BlockComponentProps) {
  const field = { ...props, blockType: formFieldSlug(block.type) ?? 'text' } as FormField
  const value = field.name ? initialValues([field])[field.name] : undefined
  return <FormFieldView field={field} id={`builder-${block.id}`} value={value} attributes={attributes} preview note={describeConditions(field)} />
}

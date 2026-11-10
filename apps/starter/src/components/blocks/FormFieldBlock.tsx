'use client'

// One form field block (`formText`, `formEmail`, …): on a page inside a Form block, and in the
// form builder's canvas. Inside a form it reads the answers, errors and display conditions from
// the form (`useFormRuntime`). Without a form around it (the form builder's preview), and on the
// canvas, it shows the field with its default answer, takes no clicks (a click selects the block)
// and notes its display conditions under it.
//
// Classes: the block's own classes go on the field's box; each part (label, input, help text,
// error, options) takes the field's own part classes, else the form's (the Form block's Styles),
// else the defaults in formClasses.ts.
import type { BlockComponentProps } from 'payload-canvas/react'
import { describeConditions, formFieldSlug, type FormPartClasses } from 'payload-canvas/forms'
import { FormFieldView, initialValues, type FieldClasses, type FormField, type NamedField } from './FormParts'
import { useFormRuntime } from './FormRuntime'

/** The field's classes: its box, then each part's own classes or the form's. */
function fieldClasses(className: string | undefined, own: BlockComponentProps['partAttributes'] | undefined, form: FormPartClasses | undefined): FieldClasses {
  const part = (name: 'label' | 'input' | 'help' | 'error' | 'options') => own?.[name]?.className ?? (name === 'options' ? undefined : form?.[name])
  return {
    box: className,
    label: part('label'),
    input: part('input'),
    help: part('help'),
    error: part('error'),
    options: part('options'),
  }
}

type ContentProps = Pick<BlockComponentProps, 'props' | 'className' | 'partAttributes'> & {
  block: Pick<BlockComponentProps['block'], 'id' | 'type'>
  attributes?: Record<string, string>
}

/** The field as the form shows it. The Form block also uses it for a saved form on the canvas. */
export function FormFieldContent({ block, props, className, attributes, partAttributes }: ContentProps) {
  const runtime = useFormRuntime()
  const field = { ...props, blockType: formFieldSlug(block.type) ?? 'text' } as FormField
  const classes = fieldClasses(className, partAttributes, runtime?.parts)
  const name = field.name || ''
  if (!runtime || runtime.preview) {
    const value = name ? (runtime?.values[name] ?? initialValues([field])[name]) : undefined
    return <FormFieldView field={field} id={`builder-${block.id}`} value={value} attributes={attributes} preview note={describeConditions(field)} classes={classes} />
  }
  // The visitor's answers hide this field: not shown, not checked, not sent.
  if (name && runtime.hidden.has(name)) return null
  if (!name || field.blockType === 'message') return <FormFieldView field={field} attributes={attributes} classes={classes} />
  const named = field as NamedField
  return (
    <FormFieldView
      field={field}
      id={runtime.fieldId(name)}
      value={runtime.values[name]}
      error={runtime.errors[name] ?? ''}
      onChange={(value) => runtime.change(named, value)}
      attributes={attributes}
      classes={classes}
    />
  )
}

/** Block component of every form field type. */
export function FormFieldBlock({ block, props, className, attributes, partAttributes }: BlockComponentProps) {
  return <FormFieldContent block={block} props={props} className={className} attributes={attributes} partAttributes={partAttributes} />
}

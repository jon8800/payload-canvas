'use client'

// The "form" block: renders a form-builder form. The renderer loads the form document (the
// block's `form` relationship) before this runs, on the site and in the canvas.
// A client component: RenderLayout passes plain data only, so the server can render it directly.
import type { BlockComponentProps } from '@payload-toolkit/builder-react'
import { formClasses } from './formClasses'
import { FormView, type FormDoc } from './FormView'

function isFormDoc(value: unknown): value is FormDoc {
  return typeof value === 'object' && value !== null && 'id' in value
}

/** Block component for the custom "form" block. */
export function FormBlock({ props, className, attributes, mode }: BlockComponentProps) {
  const form = props.form
  if (!isFormDoc(form)) {
    if (mode !== 'canvas') return null
    return (
      <div className={className} {...attributes}>
        <p className={formClasses.placeholder}>Form: choose a form in the block settings.</p>
      </div>
    )
  }
  return (
    <div className={className} {...attributes}>
      <FormView form={form} disabled={mode === 'canvas'} />
    </div>
  )
}

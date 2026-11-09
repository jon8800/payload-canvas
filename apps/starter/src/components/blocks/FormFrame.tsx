// The form builder's page frame (server component): the form around its fields, as the site's
// FormView renders it. The canvas puts the live fields in `LayoutOutlet`; the submit button is the
// form settings region, so a click on it opens the form's settings.
import { LayoutOutlet } from 'payload-canvas/react'
import type { CanvasFrameArgs } from 'payload-canvas/react/server'
import { FORM_SETTINGS_REGION } from 'payload-canvas/forms'
import { SubmitButton, type FormDoc } from './FormParts'
import { formClasses } from './formClasses'

export function FormFrame({ doc, region }: Pick<CanvasFrameArgs, 'doc' | 'region'>) {
  const form = doc as FormDoc
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className={formClasses.form}>
        <LayoutOutlet className={formClasses.fields} />
        <div className={formClasses.footer}>{region(FORM_SETTINGS_REGION, <SubmitButton label={form.submitButtonLabel} preview />)}</div>
      </div>
    </main>
  )
}

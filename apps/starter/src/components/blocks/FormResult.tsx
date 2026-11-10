'use client'

// The result of a form sent without JavaScript (app/(frontend)/forms/submit/route.ts redirects back
// with it in the query; app/(frontend)/form-result renders the page with this provider). The form
// it belongs to shows its confirmation or its problems in the server render.
import { createContext, use, type ReactNode } from 'react'
import type { FormResult } from 'payload-canvas/forms'

const FormResultContext = createContext<FormResult | null>(null)

export function FormResultProvider({ result, children }: { result: FormResult | null; children: ReactNode }) {
  return <FormResultContext value={result}>{children}</FormResultContext>
}

/** The no-JavaScript result of this form, or null. `formId` null: a form that is not live yet ("none"). */
export function useFormResult(formId: string | number | null): FormResult | null {
  const result = use(FormResultContext)
  return result && result.form === String(formId ?? 'none') ? result : null
}

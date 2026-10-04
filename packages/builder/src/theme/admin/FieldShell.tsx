'use client'

import { FieldDescription, FieldLabel } from '@payloadcms/ui'
import type { ReactNode } from 'react'
import type { StaticDescription, StaticLabel } from 'payload'

type ShellField = {
  label?: StaticLabel | false
  admin?: { description?: unknown }
}

/** The field's label as plain text (for `aria-label`), else its path. */
export function labelText(field: ShellField, path: string): string {
  return typeof field.label === 'string' && field.label ? field.label : path
}

/** Payload's label and description around a theme control, so it looks like any Payload field. */
export function FieldShell({ field, path, className, children }: { field: ShellField; path: string; className: string; children: ReactNode }) {
  const description = field.admin?.description as StaticDescription | undefined
  return (
    <div className={`field-type theme-field ${className}`}>
      {field.label !== false && <FieldLabel label={field.label} path={path} />}
      {children}
      {description ? <FieldDescription description={description} path={path} /> : null}
    </div>
  )
}

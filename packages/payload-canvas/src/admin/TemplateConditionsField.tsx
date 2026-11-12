'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import type { JSONFieldClientProps } from 'payload'

import { TEMPLATE_TARGET_FIELD } from '../core/bindings'
import { WhereField } from './editor/fields/WhereField'
import './editor/fields/fields.css'
import './templateConditions.css'

/** The conditions test the document itself: a date value may be relative to now, nothing else. */
const DATE_ONLY = { date: true }

/**
 * The templates collection's `conditions` field: the builder's condition rows (field, operator,
 * value, in "or" groups) over the fields of the template's target collection, with "Edit as JSON" for queries
 * the rows cannot show. Stores the same Payload `where` object as a JSON field.
 */
export function TemplateConditionsField(props: JSONFieldClientProps) {
  const path = props.path ?? props.field.name
  const { value, setValue } = useField<unknown>({ path })
  const target = useFormFields(([fields]) => fields[TEMPLATE_TARGET_FIELD]?.value)
  const label = typeof props.field.label === 'string' ? props.field.label : 'Conditions'
  const description = typeof props.field.admin?.description === 'string' ? props.field.admin.description : undefined
  return (
    <div className="field-type builder-template-conditions">
      <WhereField
        label={label}
        description={description}
        path={path}
        required={Boolean(props.field.required)}
        value={value ?? undefined}
        onChange={(next) => setValue(next ?? null)}
        collection={typeof target === 'string' ? target : undefined}
        sources={DATE_ONLY}
      />
    </div>
  )
}

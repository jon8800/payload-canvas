'use client'

// The Form block (payload-canvas `formBlocks()`). "Build here": its children are the form (field
// blocks, layout blocks, a Submit button block), rendered by RenderLayout inside the `<form>`.
// "Use a saved form": the form of the forms collection in `form`. The site's `loadLayoutData` puts
// that form's fields in as child blocks, so both modes render through the same field blocks; the
// canvas shows a saved form read-only from the document.
// A client component: RenderLayout passes plain data only, so the server can render it directly.
import type { BlockComponentProps } from 'payload-canvas/react'
import type { Block } from 'payload-canvas/core'
import {
  FORM_PARTS,
  FORM_SLOT,
  fieldBlockOf,
  formBlockMode,
  formFieldsIn,
  formFieldSlug,
  formIdOf,
  formSubmitBlocks,
  type FormPartClasses,
  type FormPartName,
} from 'payload-canvas/forms'
import { FormFieldContent } from './FormFieldBlock'
import { type FormDoc, type FormField, type FormSettings } from './FormParts'
import { FormRoot } from './FormRuntime'
import { SubmitContent } from './FormSubmitBlock'
import { formClasses } from './formClasses'

function isFormDoc(value: unknown): value is FormDoc {
  return typeof value === 'object' && value !== null && 'id' in value
}

/** A field block as the field the form checks and sends. */
const fieldOf = (block: Block): FormField => ({ ...block.props, id: block.id, blockType: formFieldSlug(block.type) ?? 'text' }) as FormField

/** The form-wide part classes the Form block's Styles set (each with the builder's marker class). */
function formParts(partAttributes: BlockComponentProps['partAttributes']): FormPartClasses {
  const out: FormPartClasses = {}
  for (const name of Object.keys(FORM_PARTS) as FormPartName[]) {
    const className = partAttributes?.[name]?.className
    if (className) out[name] = className
  }
  return out
}

/** The saved form's fields as blocks, for the canvas (the site gets them from loadLayoutData). */
function savedFieldBlocks(doc: FormDoc): Block[] {
  const rows = Array.isArray(doc.fields) ? doc.fields : []
  return rows.flatMap((row) => {
    const block = fieldBlockOf(row as Record<string, unknown>)
    return block ? [block] : []
  })
}

/** Block component of the Form block. */
export function FormBlock({ block, props, className, attributes, partAttributes, slots, mode }: BlockComponentProps) {
  const canvas = mode === 'canvas'
  const formMode = formBlockMode(props, block.slots)
  const doc = isFormDoc(props.form) ? props.form : null
  const children = block.slots?.[FORM_SLOT] ?? []
  // A saved form shows nothing until one is chosen; the canvas says so.
  if (formMode === 'saved' && !doc) {
    if (!canvas) return null
    return (
      <div className={className} {...attributes}>
        <p className={formClasses.placeholder}>Form: choose a saved form in the block settings, or build the fields here.</p>
      </div>
    )
  }
  // The canvas does not load a saved form's fields as blocks: it shows them read-only.
  const savedPreview = formMode === 'saved' && children.length === 0 && doc ? savedFieldBlocks(doc) : null
  const fieldBlocks = savedPreview ?? formFieldsIn(children)
  // Built here: the block's own settings (drafts too). Turnstile follows the published form, which the server checks.
  const settings: FormSettings = formMode === 'build' ? { ...(props as FormSettings), spamProtection: doc?.spamProtection ?? null } : (doc ?? {})
  const parts = formParts(partAttributes)
  const hasSubmit = savedPreview !== null || formSubmitBlocks(block).length > 0
  // Built here, the block is the `<form>`: its classes lay out its children. A saved form keeps the
  // block as a box around the form, whose fields wrap in a row as before.
  const root = (
    <FormRoot
      formId={formIdOf(props.form)}
      fields={fieldBlocks.map(fieldOf)}
      settings={settings}
      preview={canvas}
      parts={parts}
      className={formMode === 'build' ? className : formClasses.fields}
      attributes={formMode === 'build' ? attributes : undefined}
    >
      {savedPreview ? (
        <>
          {savedPreview.map((field) => (
            <FormFieldContent key={field.id} block={field} props={field.props ?? {}} className={field.className} partAttributes={partClassesOf(field)} />
          ))}
          <SubmitContent label={null} />
        </>
      ) : (
        slots[FORM_SLOT]
      )}
      {/* Without a Submit button block the site still gets a button; the canvas asks for one. */}
      {hasSubmit ? null : canvas ? <p className={formClasses.placeholder}>Add a Submit button block to this form.</p> : <SubmitContent label={null} />}
    </FormRoot>
  )
  if (formMode === 'build') return root
  return (
    <div className={className} {...attributes}>
      {root}
    </div>
  )
}

/** A saved field's own part classes, shaped like RenderLayout's `partAttributes`. */
function partClassesOf(block: Block): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(block.partClassName ?? {}).map(([name, value]) => [name, { className: value }]))
}

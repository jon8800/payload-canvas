// Tailwind classes of the form blocks' inner elements. The app's own CSS has them (Tailwind scans
// this file). The classes people can change are the Form block's parts (`formPartClasses`): a new
// Form block starts with them, so the Styles panel shows and edits them. Colors use the theme tokens.

import type { FormPartClasses } from 'payload-canvas/forms'

export const formClasses = {
  form: 'flex flex-col gap-5',
  // The fields' box: a wrapping row, so fields with a width class share a line.
  fields: 'flex flex-wrap gap-x-4 gap-y-5',
  field: 'flex w-full min-w-0 flex-col gap-2',
  label: 'text-sm font-medium text-foreground',
  optional: 'font-normal text-muted-foreground',
  input:
    'block min-h-11 w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-base text-foreground ' +
    'outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground ' +
    'focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 ' +
    'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/30 disabled:opacity-60',
  // The label of a field whose label is hidden: screen readers still read it.
  srOnly: 'sr-only',
  // A dropdown (FormSelect, the project's Base UI select): drawn like the inputs, its list matches the form.
  selectTrigger:
    'flex cursor-pointer items-center justify-between gap-2 text-left data-placeholder:text-muted-foreground data-[size=default]:h-auto ' +
    'data-popup-open:border-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground',
  selectPopup: 'rounded-md bg-background text-foreground',
  selectItem: 'min-h-10 cursor-pointer py-2 pl-3 text-base',
  textarea: 'min-h-32 resize-y',
  fieldError: 'm-0 text-sm text-destructive',
  checkboxRow: 'flex w-full items-start gap-3 text-base',
  checkbox: 'mt-1 size-5 shrink-0 accent-primary',
  // A consent box's rich text, next to the box: links underlined.
  consentText: 'min-w-0 text-base [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:no-underline [&_p]:m-0',
  // Radio buttons: a fieldset with the label as its legend.
  radioGroup: 'm-0 flex w-full min-w-0 flex-col gap-2 border-0 p-0',
  legend: 'mb-2 p-0 text-sm font-medium text-foreground',
  // Radio displays (`display`): list, inline, buttons (joined pills) and cards. Real radio inputs
  // underneath, so arrow keys and screen readers work as usual.
  radioList: 'flex flex-col gap-2',
  radioInline: 'flex flex-wrap gap-x-6 gap-y-2',
  radioRow: 'flex cursor-pointer items-center gap-3 text-base',
  radio: 'size-5 shrink-0 accent-primary',
  radioButtons: 'inline-flex max-w-full flex-wrap gap-1 self-start rounded-3xl border border-input bg-background p-1 has-aria-invalid:border-destructive',
  radioButton:
    'inline-flex min-h-10 cursor-pointer items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors ' +
    'hover:text-foreground has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40',
  radioCards: 'grid gap-3 sm:grid-cols-2',
  radioCard:
    'flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-background px-4 py-3.5 text-base transition-colors ' +
    'hover:border-foreground/40 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40 ' +
    'has-aria-invalid:border-destructive',
  // File drop zone (FileDropZone): drag files in or click to browse; the chosen files below.
  dropZone:
    'flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-input bg-background px-6 py-8 text-center ' +
    'transition-colors hover:border-foreground/40 has-focus-visible:border-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40 ' +
    'has-aria-invalid:border-destructive data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/5',
  dropIcon: 'size-6 text-muted-foreground',
  dropTitle: 'm-0 text-base text-foreground',
  dropBrowse: 'font-medium underline underline-offset-4',
  fileList: 'm-0 flex list-none flex-col gap-2 p-0',
  fileItem: 'flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm',
  fileName: 'min-w-0 flex-1 truncate text-foreground',
  fileSize: 'shrink-0 text-muted-foreground tabular-nums',
  fileRemove:
    'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors ' +
    'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
  fileRemoveIcon: 'size-4',
  hint: 'm-0 text-sm text-muted-foreground',
  // A hidden field in the builder's preview: visitors never see it.
  hiddenPreview: 'w-full rounded-md border border-dashed border-border px-3.5 py-2 text-sm text-muted-foreground',
  message: 'w-full',
  messageText: 'm-0 text-muted-foreground',
  // The builder's preview: inputs take no clicks, so a click selects the field.
  previewInput: 'pointer-events-none',
  // Under a field in the builder's preview, e.g. its display conditions.
  note: 'm-0 text-xs text-muted-foreground',
  // The spam honeypot: off screen, so people never see it.
  honeypot: 'absolute -left-[10000px] top-auto size-px overflow-hidden',
  footer: 'flex w-full flex-col items-start gap-3 pt-1',
  submit:
    'inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 text-base ' +
    'font-medium text-primary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--color-primary),black_14%)] sm:w-auto ' +
    'disabled:cursor-progress disabled:opacity-70',
  spinner: 'size-4 animate-spin motion-reduce:animate-none',
  errorText: 'm-0',
  errorList: 'm-0 mt-1 list-disc pl-5',
  error: 'm-0 w-full rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground',
  success: 'flex flex-col items-start gap-3 outline-none',
  successTitle: 'm-0 font-display text-2xl text-foreground',
  successText: 'm-0 text-muted-foreground',
  again: 'cursor-pointer text-sm font-medium underline underline-offset-4 hover:no-underline',
  placeholder: 'm-0 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground',
} as const

/** Class names without the empty ones, joined by spaces. */
export const join = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ')

/**
 * The Form block's default part classes (payload-canvas `formBlocks({ partClassNames })`): every
 * field inside uses them unless it sets its own. The default look of a form.
 */
export const formPartClasses: FormPartClasses = {
  label: formClasses.label,
  input: formClasses.input,
  help: formClasses.hint,
  error: formClasses.fieldError,
  button: formClasses.submit,
}

// Tailwind classes of the form block's inner elements. `formBlock.classes` in src/builder.ts lists
// them, so the plugin adds them to the generated CSS (on save and in the canvas). Colors use the
// theme tokens.

export const formClasses = {
  form: 'flex flex-wrap gap-x-4 gap-y-5',
  field: 'flex w-full min-w-0 flex-col gap-2',
  label: 'text-sm font-medium text-foreground',
  optional: 'font-normal text-muted-foreground',
  input:
    'block min-h-11 w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-base text-foreground ' +
    'outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground ' +
    'focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 ' +
    'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/30 disabled:opacity-60',
  selectWrap: 'relative',
  select: 'cursor-pointer appearance-none pr-11',
  selectIcon: 'pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground',
  textarea: 'min-h-32 resize-y',
  fieldError: 'm-0 text-sm text-destructive',
  checkboxRow: 'flex w-full items-start gap-3 text-base',
  checkbox: 'mt-1 size-5 shrink-0 accent-primary',
  message: 'm-0 w-full text-muted-foreground',
  footer: 'flex w-full flex-col items-start gap-3 pt-1',
  submit:
    'inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 text-base ' +
    'font-medium text-primary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--color-primary),black_14%)] sm:w-auto ' +
    'disabled:cursor-progress disabled:opacity-70',
  spinner: 'size-4 animate-spin motion-reduce:animate-none',
  error: 'm-0 w-full rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground',
  success: 'flex flex-col items-start gap-3 outline-none',
  successTitle: 'm-0 font-display text-2xl text-foreground',
  successText: 'm-0 text-muted-foreground',
  again: 'cursor-pointer text-sm font-medium underline underline-offset-4 hover:no-underline',
  placeholder: 'm-0 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground',
} as const

/** Width classes for form-builder field widths (percent). Full width on phones. */
export const widthClasses: Array<[max: number, className: string]> = [
  [25, 'sm:w-[calc(25%-0.75rem)]'],
  [34, 'sm:w-[calc(33.333%-0.667rem)]'],
  [50, 'sm:w-[calc(50%-0.5rem)]'],
  [67, 'sm:w-[calc(66.667%-0.333rem)]'],
  [75, 'sm:w-[calc(75%-0.25rem)]'],
]

/** Every class above, for `BlockDefinition.classes`. */
export const formClassList: string[] = [
  ...Object.values(formClasses).flatMap((value) => value.split(' ')),
  ...widthClasses.map(([, className]) => className),
]

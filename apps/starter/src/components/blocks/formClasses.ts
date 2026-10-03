// Tailwind classes of the form block's inner elements. `formBlock.classes` in src/builder.ts lists
// them, so the plugin adds them to the generated CSS (on save and in the canvas). Colors use the
// theme tokens.

export const formClasses = {
  form: 'flex flex-wrap gap-4',
  field: 'flex w-full flex-col gap-1.5',
  label: 'text-sm font-medium',
  required: 'text-destructive',
  input:
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
  checkboxRow: 'flex w-full items-center gap-2 text-sm',
  checkbox: 'size-4 accent-primary',
  message: 'm-0 w-full',
  submit:
    'inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50',
  success: 'rounded-md bg-muted p-4 text-sm',
  error: 'm-0 w-full text-sm text-destructive',
  placeholder: 'm-0 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground',
} as const

/** Every class above, for `BlockDefinition.classes`. */
export const formClassList: string[] = Object.values(formClasses).flatMap((value) => value.split(' '))

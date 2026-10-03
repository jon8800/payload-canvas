import { form, grid, heading, list, stack, styles, text, type Section } from './build'

export type ContactInput = {
  title: string
  text: string
  /** ID of a document in the form-builder "forms" collection. */
  formId: number | string
  details?: string[]
}

export const contact: Section<ContactInput> = {
  name: 'Contact',
  description: 'Two columns: contact details (title, text, list) beside a form from the Forms collection.',
  create: ({ title, text: body, formId, details }) =>
    stack('section', styles.section, [
      grid('mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 md:grid-cols-2', [
        stack('div', 'flex flex-col gap-4', [
          heading(title, '2', styles.sectionTitle),
          text(body, styles.lead),
          ...(details && details.length > 0 ? [list(details, false, 'flex list-none flex-col gap-2 text-muted-foreground')] : []),
        ]),
        form(formId, 'rounded-lg border border-border bg-background p-8'),
      ]),
    ]),
}

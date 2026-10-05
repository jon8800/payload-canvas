import { form, heading, link, stack, styles, text, url, defineSection } from './build'

export type ContactInput = {
  title: string
  text: string
  /** ID of a document in the form-builder "forms" collection. */
  formId: number | string
  /** Contact details. A detail with `href` (mailto:, tel:) is a link. */
  details?: Array<{ label: string; value: string; href?: string }>
}

const DETAIL_LINK = 'self-start text-lg font-medium underline decoration-1 underline-offset-[6px] hover:decoration-2'

export const contact = defineSection<ContactInput>({
  name: 'Contact',
  description:
    'Two columns: a title, text and contact details (email and phone as links) beside a form from the Forms collection. ' +
    'On small screens the form comes right after the title and text, and the details follow it.',
  create: ({ title, text: body, formId, details }) =>
    stack('section', styles.section, [
      // Phones: intro, form, details. Wide screens: intro and details on the left, the form on the right.
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 md:grid-cols-12 md:grid-rows-[auto_1fr] md:gap-x-16 md:gap-y-8', [
        stack('div', 'flex flex-col gap-5 md:col-span-5', [heading(title, '2', styles.sectionTitle), text(body, styles.body)]),
        form(formId, 'rounded-lg border border-border bg-card p-6 sm:p-8 md:col-span-7 md:row-span-2 md:p-10'),
        ...(details && details.length > 0
          ? [
              stack(
                'div',
                'flex flex-col self-start border-b border-border md:col-span-5',
                details.map((detail) =>
                  stack('div', 'flex flex-col gap-1 border-t border-border py-5', [
                    text(detail.label, 'text-sm text-muted-foreground'),
                    detail.href ? link(url(detail.href), DETAIL_LINK, [text(detail.value)]) : text(detail.value, 'text-lg'),
                  ]),
                ),
              ),
            ]
          : []),
      ]),
    ]),
})

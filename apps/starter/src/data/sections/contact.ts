import type { Block } from 'payload-canvas/core'
import { FIELD_WIDTH, FORM_ROW, formField, form, heading, link, stack, styles, submit, text, url, defineSection } from './build'

export type ContactInput = {
  title: string
  text: string
  /** The Form block (`contactForm()`, or `form()` from ./build). Its classes are set here. */
  form: Block
  /** Contact details. A detail with `href` (mailto:, tel:) is a link. */
  details?: Array<{ label: string; value: string; href?: string }>
}

const DETAIL_LINK = 'self-start text-lg font-medium underline decoration-1 underline-offset-[6px] hover:decoration-2'

export const contact = defineSection<ContactInput>({
  name: 'Contact',
  description:
    'Two columns: a title, text and contact details (email and phone as links) beside a form built on the page. ' +
    'On small screens the form comes right after the title and text, and the details follow it.',
  create: ({ title, text: body, form: formBlock, details }) =>
    stack('section', styles.section, [
      // Phones: intro, form, details. Wide screens: intro and details on the left, the form on the right.
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 md:grid-cols-12 md:grid-rows-[auto_1fr] md:gap-x-16 md:gap-y-8', [
        stack('div', 'flex flex-col gap-5 md:col-span-5', [heading(title, '2', styles.sectionTitle), text(body, styles.body)]),
        { ...formBlock, className: `${FORM_ROW} ${styles.card} md:col-span-7 md:row-span-2` },
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

/** The contact form: name and email side by side, a topic, a message and the Submit button. */
export function contactForm(settings: Record<string, unknown> = {}): Block {
  return form({ title: 'Contact form', submitButtonLabel: 'Send message', confirmationType: 'message', ...settings }, [
    formField('text', { name: 'name', label: 'Name', required: true }, FIELD_WIDTH.half),
    formField('email', { name: 'email', label: 'Email', required: true }, FIELD_WIDTH.half),
    formField('select', {
      name: 'topic',
      label: 'Topic',
      options: [
        { label: 'New website', value: 'website' },
        { label: 'Redesign', value: 'redesign' },
        { label: 'Something else', value: 'other' },
      ],
    }),
    formField('textarea', { name: 'message', label: 'Message', required: true }),
    submit(),
  ])
}

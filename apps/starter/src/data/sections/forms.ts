// Ready-made form sections: a newsletter signup and a quote request, built on the page with the
// form field blocks (forms on pages). Publishing the page saves each form to the Forms collection.
import { FIELD_WIDTH, FORM_ROW, formField, form, heading, stack, styles, submit, text, defineSection } from './build'

export type NewsletterInput = { title: string; text: string }

export const newsletter = defineSection<NewsletterInput>({
  name: 'Newsletter signup',
  description: 'A title and a short text beside an email field and a Subscribe button on one line.',
  create: ({ title, text: body }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 md:items-end md:gap-16', [
        stack('div', 'flex flex-col gap-4', [heading(title, '2', styles.sectionTitle), text(body, styles.body)]),
        form(
          { title: 'Newsletter signup', submitButtonLabel: 'Subscribe', confirmationType: 'message' },
          [
            formField('email', { name: 'email', label: 'Email', required: true, placeholder: 'you@example.com', labelVisibility: 'hidden' }, FIELD_WIDTH.twoThirds),
            submit('Subscribe', `pt-0 ${FIELD_WIDTH.third}`),
            formField('consent', { name: 'consent', label: 'I agree to receive the newsletter.', required: true }),
          ],
          `${FORM_ROW} items-start`,
        ),
      ]),
    ]),
})

export type QuoteInput = { title: string; text: string }

export const quoteRequest = defineSection<QuoteInput>({
  name: 'Quote request',
  description:
    'A title and text above a project form: contact details, the service as buttons (with a follow-up question for "Something else"), budget, start date, details and a file.',
  create: ({ title, text: body }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto flex w-full max-w-3xl flex-col gap-10', [
        stack('div', 'flex flex-col gap-4', [heading(title, '2', styles.sectionTitle), text(body, styles.body)]),
        form(
          { title: 'Quote request', submitButtonLabel: 'Request a quote', confirmationType: 'message' },
          [
            formField('text', { name: 'name', label: 'Name', required: true }, FIELD_WIDTH.half),
            formField('email', { name: 'email', label: 'Email', required: true }, FIELD_WIDTH.half),
            formField('text', { name: 'company', label: 'Company' }, FIELD_WIDTH.half),
            formField('phone', { name: 'phone', label: 'Phone' }, FIELD_WIDTH.half),
            formField('radio', {
              name: 'service',
              label: 'What do you need?',
              required: true,
              display: 'buttons',
              options: [
                { label: 'New website', value: 'website' },
                { label: 'Redesign', value: 'redesign' },
                { label: 'Something else', value: 'other' },
              ],
            }),
            formField('text', {
              name: 'other_service',
              label: 'What else do you need?',
              required: true,
              conditions: { match: 'all', rules: [{ field: 'service', operator: 'equals', value: 'other' }] },
            }),
            formField('select', {
              name: 'budget',
              label: 'Budget',
              options: [
                { label: 'Under 5,000', value: 'small' },
                { label: '5,000 to 15,000', value: 'medium' },
                { label: 'Over 15,000', value: 'large' },
              ],
            }, FIELD_WIDTH.half),
            formField('date', { name: 'start', label: 'Start date' }, FIELD_WIDTH.half),
            formField('textarea', { name: 'details', label: 'Project details', required: true, description: 'Goals, pages, deadlines: anything that helps us plan.' }),
            formField('file', { name: 'brief', label: 'Brief or sketches', accept: 'image/*, application/pdf', maxSize: 5 }),
            submit('Request a quote'),
          ],
          `${FORM_ROW} ${styles.card}`,
        ),
      ]),
    ]),
})

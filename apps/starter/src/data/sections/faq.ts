import { divider, heading, stack, styles, text, type Section } from './build'

export type FaqInput = {
  title: string
  items: Array<{ question: string; answer: string }>
}

export const faq: Section<FaqInput> = {
  name: 'FAQ',
  description: 'Frequently asked questions: question and answer pairs separated by dividers in a narrow column.',
  create: ({ title, items }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto flex w-full max-w-3xl flex-col gap-8', [
        heading(title, '2', `text-center ${styles.sectionTitle}`),
        stack(
          'div',
          'flex flex-col gap-6',
          items.flatMap((item, i) => [
            ...(i > 0 ? [divider('border-border')] : []),
            stack('div', 'flex flex-col gap-2', [
              heading(item.question, '3', 'text-lg font-semibold'),
              text(item.answer, styles.muted),
            ]),
          ]),
        ),
      ]),
    ]),
}

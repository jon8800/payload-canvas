import { heading, stack, styles, text, defineSection } from './build'

export type FaqInput = {
  title: string
  items: Array<{ question: string; answer: string }>
}

export const faq = defineSection<FaqInput>({
  name: 'FAQ',
  description: 'Frequently asked questions: a title on the left, question and answer pairs on the right, separated by lines.',
  create: ({ title, items }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 md:grid-cols-12 md:gap-12', [
        heading(title, '2', `md:col-span-4 ${styles.sectionTitle}`),
        stack(
          'div',
          'flex flex-col border-b border-border md:col-span-8',
          items.map((item) =>
            stack('div', 'flex flex-col gap-2 border-t border-border py-7', [
              heading(item.question, '3', styles.cardTitle),
              text(item.answer, styles.body),
            ]),
          ),
        ),
      ]),
    ]),
})

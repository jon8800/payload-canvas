import { heading, stack, styles, text, defineSection } from './build'

export type FeaturesInput = {
  title: string
  intro?: string
  items: Array<{ title: string; text: string }>
}

export const features = defineSection<FeaturesInput>({
  name: 'Features',
  description:
    'A title and intro on the left, and a list of points on the right: each point has a short title and a sentence, ' +
    'separated by thin lines. Stacks on small screens.',
  create: ({ title, intro, items }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 md:grid-cols-12 md:gap-12', [
        stack('div', 'flex flex-col gap-4 md:col-span-5', [
          heading(title, '2', styles.sectionTitle),
          ...(intro ? [text(intro, styles.lead)] : []),
        ]),
        stack(
          'div',
          'flex flex-col border-b border-border md:col-span-7',
          items.map((item) =>
            stack('article', 'grid grid-cols-1 gap-2 border-t border-border py-7 sm:grid-cols-[12rem_1fr] sm:gap-8', [
              heading(item.title, '3', styles.cardTitle),
              text(item.text, styles.body),
            ]),
          ),
        ),
      ]),
    ]),
})

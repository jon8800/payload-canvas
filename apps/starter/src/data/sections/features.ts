import { grid, heading, stack, styles, text, type Section } from './build'

export type FeaturesInput = {
  title: string
  intro?: string
  items: Array<{ title: string; text: string }>
}

export const features: Section<FeaturesInput> = {
  name: 'Features',
  description: 'A centered title and intro above a three-column grid of feature cards (title and short text).',
  create: ({ title, intro, items }) =>
    stack('section', styles.section, [
      stack('div', styles.container, [
        stack('div', 'mx-auto flex max-w-2xl flex-col items-center gap-3 text-center', [
          heading(title, '2', styles.sectionTitle),
          ...(intro ? [text(intro, styles.lead)] : []),
        ]),
        grid(
          'grid grid-cols-1 gap-6 md:grid-cols-3',
          items.map((item) =>
            stack('article', 'flex flex-col gap-2 rounded-lg border border-border bg-background p-6', [
              heading(item.title, '3', 'text-lg font-semibold'),
              text(item.text, styles.muted),
            ]),
          ),
        ),
      ]),
    ]),
}

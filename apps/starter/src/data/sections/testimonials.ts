import { grid, heading, quote, stack, styles, type Section } from './build'

export type TestimonialsInput = {
  title: string
  items: Array<{ quote: string; cite: string }>
}

export const testimonials: Section<TestimonialsInput> = {
  name: 'Testimonials',
  description: 'A title above a grid of customer quotes with attribution, on a muted background.',
  create: ({ title, items }) =>
    stack('section', `bg-muted ${styles.section}`, [
      stack('div', styles.container, [
        heading(title, '2', `text-center ${styles.sectionTitle}`),
        grid(
          'grid grid-cols-1 gap-6 md:grid-cols-2',
          items.map((item) => quote(item.quote, item.cite, 'flex flex-col gap-4 rounded-lg bg-background p-8 text-lg')),
        ),
      ]),
    ]),
}

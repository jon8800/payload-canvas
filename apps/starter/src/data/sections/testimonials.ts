import { grid, heading, quote, stack, styles, defineSection } from './build'

export type TestimonialsInput = {
  title: string
  items: Array<{ quote: string; cite: string }>
}

const QUOTE =
  'flex flex-col gap-6 border-t border-foreground/20 pt-8 font-display text-2xl leading-snug tracking-[-0.01em] md:text-3xl ' +
  '[&_cite]:font-sans [&_cite]:text-base [&_cite]:not-italic [&_cite]:tracking-normal [&_cite]:text-muted-foreground'

export const testimonials = defineSection<TestimonialsInput>({
  name: 'Testimonials',
  description: 'A title above large customer quotes with attribution, in two columns on a muted background.',
  create: ({ title, items }) =>
    stack('section', `bg-muted ${styles.section}`, [
      stack('div', styles.container, [
        heading(title, '2', styles.sectionTitle),
        grid('grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16', items.map((item) => quote(item.quote, item.cite, QUOTE))),
      ]),
    ]),
})

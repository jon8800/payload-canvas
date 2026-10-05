import { heading, image, motions, sectionHeader, stack, styles, text, withMotion, defineSection } from './build'

export type WorkInput = {
  title: string
  intro?: string
  /** Two or four projects read best. */
  items: Array<{ title: string; meta: string; image: { id: number | string; alt: string } }>
}

// Each project appears as it scrolls into view. The columns are tall and offset, so one entrance
// per column would play too early for the lower projects.
const project = (item: WorkInput['items'][number]) =>
  withMotion(
    stack('article', 'flex flex-col gap-5', [
      image(item.image.id, item.image.alt, styles.image),
      stack('div', 'flex flex-col gap-1', [
        heading(item.title, '3', 'font-display text-2xl leading-tight tracking-[-0.01em] md:text-3xl'),
        text(item.meta, styles.muted),
      ]),
    ]),
    motions.reveal,
  )

export const work = defineSection<WorkInput>({
  name: 'Selected work',
  description:
    'A portfolio: a title and intro above project images in two columns, the right column set lower. ' +
    'Each project has an image, a name and one line about the work.',
  create: ({ title, intro, items }) => {
    const left = items.filter((_, i) => i % 2 === 0)
    const right = items.filter((_, i) => i % 2 === 1)
    return stack('section', styles.section, [
      stack('div', styles.container, [
        sectionHeader(title, intro),
        stack('div', 'grid grid-cols-1 gap-14 md:grid-cols-2 md:gap-x-10', [
          stack('div', 'flex flex-col gap-14 md:gap-20', left.map(project)),
          stack('div', 'flex flex-col gap-14 md:gap-20 md:pt-28', right.map(project)),
        ]),
      ]),
    ])
  },
})

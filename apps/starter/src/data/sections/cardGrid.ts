import { grid, heading, image, link, motions, sectionHeader, stack, styles, text, withMotion, type LinkInput, defineSection } from './build'

export type CardGridInput = {
  title: string
  intro?: string
  cards: Array<{ title: string; text: string; image?: { id: number | string; alt: string }; link?: LinkInput }>
}

export const cardGrid = defineSection<CardGridInput>({
  name: 'Card grid',
  description:
    'A title and intro above a grid of items with an optional image, a title and text: one column on phones, ' +
    'two on tablets, three on laptops. An item with a link is clickable.',
  create: ({ title, intro, cards }) =>
    stack('section', styles.section, [
      stack('div', styles.container, [
        sectionHeader(title, intro),
        withMotion(
          grid(
            'grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3',
            cards.map((card) => {
              const body = [
                ...(card.image ? [image(card.image.id, card.image.alt, styles.image)] : []),
                stack('div', 'flex flex-col gap-2', [
                  heading(card.title, '3', `${styles.cardTitle}${card.link ? ' group-hover:underline' : ''}`),
                  text(card.text, styles.muted),
                ]),
              ]
              if (!card.link) return stack('article', 'flex flex-col gap-5', body)
              return withMotion(link(card.link, 'group flex flex-col gap-5', body), motions.interactive)
            }),
          ),
          motions.staggerChildren,
        ),
      ]),
    ]),
})

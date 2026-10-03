import { grid, heading, image, link, stack, styles, text, type LinkInput, type Section } from './build'

export type CardGridInput = {
  title: string
  intro?: string
  cards: Array<{ title: string; text: string; image?: { id: number | string; alt: string }; link?: LinkInput }>
}

const CARD = 'flex flex-col overflow-hidden rounded-lg border border-border bg-background'

export const cardGrid: Section<CardGridInput> = {
  name: 'Card grid',
  description:
    'A title above a three-column grid of cards with an optional image, a title and text. A card with a link is clickable.',
  create: ({ title, intro, cards }) =>
    stack('section', styles.section, [
      stack('div', styles.container, [
        stack('div', 'flex flex-col items-center gap-3 text-center', [
          heading(title, '2', styles.sectionTitle),
          ...(intro ? [text(intro, `max-w-2xl ${styles.lead}`)] : []),
        ]),
        grid(
          'grid grid-cols-1 gap-6 md:grid-cols-3',
          cards.map((card) => {
            const body = [
              ...(card.image ? [image(card.image.id, card.image.alt, 'aspect-video w-full object-cover')] : []),
              stack('div', 'flex flex-col gap-2 p-6', [
                heading(card.title, '3', 'text-lg font-semibold'),
                text(card.text, styles.muted),
              ]),
            ]
            if (!card.link) return stack('article', CARD, body)
            return link(card.link, `${CARD} transition-shadow hover:shadow-lg`, body)
          }),
        ),
      ]),
    ]),
}

import { button, grid, heading, image, stack, styles, text, type Action, type Section } from './build'

export type ImageTextInput = {
  title: string
  paragraphs: string[]
  image: { id: number | string; alt: string }
  action?: Action
  /** Puts the image on the right on wide screens. */
  imageRight?: boolean
}

export const imageText: Section<ImageTextInput> = {
  name: 'Image and text',
  description: 'Two columns: an image beside a title, paragraphs and an optional button. Stacks on small screens.',
  create: ({ title, paragraphs, image: picture, action, imageRight }) =>
    stack('section', styles.section, [
      grid('mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2', [
        image(picture.id, picture.alt, imageRight ? 'w-full rounded-lg md:order-last' : 'w-full rounded-lg'),
        stack('div', 'flex flex-col items-start gap-4', [
          heading(title, '2', styles.sectionTitle),
          ...paragraphs.map((paragraph) => text(paragraph, styles.muted)),
          ...(action ? [button(action, styles.buttonOutline)] : []),
        ]),
      ]),
    ]),
}

import { button, heading, image, stack, styles, text, type Action, defineSection } from './build'

export type ImageTextInput = {
  title: string
  paragraphs: string[]
  image: { id: number | string; alt: string }
  action?: Action
  /** Puts the image on the right on wide screens. */
  imageRight?: boolean
}

export const imageText = defineSection<ImageTextInput>({
  name: 'Image and text',
  description: 'Two columns: a large image beside a title, paragraphs and an optional button. Stacks on small screens.',
  create: ({ title, paragraphs, image: picture, action, imageRight }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-16', [
        image(picture.id, picture.alt, `md:col-span-7 ${styles.image}${imageRight ? ' md:order-last' : ''}`),
        stack('div', 'flex flex-col items-start gap-5 md:col-span-5', [
          heading(title, '2', styles.sectionTitle),
          ...paragraphs.map((paragraph) => text(paragraph, styles.body)),
          ...(action ? [button(action, `mt-2 ${styles.buttonOutline}`)] : []),
        ]),
      ]),
    ]),
})

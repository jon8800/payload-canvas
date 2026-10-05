import { button, heading, image, motions, stack, styles, text, withMotion, type Action, defineSection } from './build'

export type ImageTextInput = {
  title: string
  paragraphs: string[]
  image: { id: number | string; alt: string }
  action?: Action
  /** Puts the image on the right on wide screens. */
  imageRight?: boolean
  /** Adds a slow parallax to the image. Use it on one image of the page at most. */
  parallax?: boolean
}

export const imageText = defineSection<ImageTextInput>({
  name: 'Image and text',
  description: 'Two columns: a large image beside a title, paragraphs and an optional button. Stacks on small screens.',
  create: ({ title, paragraphs, image: picture, action, imageRight, parallax }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-16', [
        // The image slides in from its own side.
        withMotion(image(picture.id, picture.alt, `md:col-span-7 ${styles.image}${imageRight ? ' md:order-last' : ''}`), {
          enter: { preset: imageRight ? 'fade-left' : 'fade-right', distance: 24 },
          ...(parallax ? { scroll: { preset: 'parallax', distance: 35 } } : {}),
        }),
        stack('div', 'flex flex-col items-start gap-5 md:col-span-5', [
          heading(title, '2', styles.sectionTitle),
          ...paragraphs.map((paragraph) => text(paragraph, styles.body)),
          ...(action ? [withMotion(button(action, `mt-2 ${styles.buttonOutline}`), motions.pressable)] : []),
        ]),
      ]),
    ]),
})

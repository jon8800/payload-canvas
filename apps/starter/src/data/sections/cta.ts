import { button, heading, stack, styles, text, type Action, type Section } from './build'

export type CtaInput = {
  title: string
  text: string
  primary: Action
  secondary?: Action
}

const OUTLINE_INVERTED =
  'inline-flex items-center justify-center rounded-md border border-primary-foreground px-5 py-3 text-sm font-medium'

export const cta: Section<CtaInput> = {
  name: 'Call to action',
  description: 'A bold banner in the primary color with a title, a short text and one or two buttons.',
  create: ({ title, text: body, primary, secondary }) =>
    stack('section', 'bg-primary px-6 py-20 text-primary-foreground', [
      stack('div', 'mx-auto flex max-w-2xl flex-col items-center gap-6 text-center', [
        heading(title, '2', styles.sectionTitle),
        text(body, 'text-lg opacity-80'),
        stack('div', 'flex flex-row flex-wrap justify-center gap-4', [
          button(primary, styles.buttonInverted),
          ...(secondary ? [button(secondary, OUTLINE_INVERTED)] : []),
        ]),
      ]),
    ]),
}

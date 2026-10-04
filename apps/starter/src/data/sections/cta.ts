import { button, heading, stack, styles, text, type Action, defineSection } from './build'

export type CtaInput = {
  title: string
  text: string
  primary: Action
  secondary?: Action
}

export const cta = defineSection<CtaInput>({
  name: 'Call to action',
  description: 'A band in the primary color: a large title and a short text, with one or two buttons beside them.',
  create: ({ title, text: body, primary, secondary }) =>
    stack('section', 'bg-primary px-5 py-20 text-primary-foreground md:px-8 md:py-28', [
      stack('div', 'mx-auto flex w-full max-w-6xl flex-col gap-10 md:flex-row md:items-end md:justify-between', [
        stack('div', 'flex max-w-3xl flex-col gap-5', [
          heading(title, '2', 'font-display text-4xl leading-[1.05] tracking-[-0.02em] md:text-6xl'),
          text(body, 'max-w-[52ch] text-lg leading-relaxed opacity-80'),
        ]),
        stack('div', 'flex flex-row flex-wrap gap-3 md:shrink-0', [
          button(primary, styles.buttonInverted),
          ...(secondary ? [button(secondary, styles.buttonOutlineInverted)] : []),
        ]),
      ]),
    ]),
})

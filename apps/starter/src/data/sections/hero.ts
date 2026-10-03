import { button, heading, stack, styles, text, type Action, type Section } from './build'

export type HeroInput = {
  title: string
  text: string
  primary?: Action
  secondary?: Action
}

export const hero: Section<HeroInput> = {
  name: 'Hero',
  description:
    'Full-width opening section: a large title, a lead paragraph and up to two buttons, centered on a muted background.',
  create: ({ title, text: lead, primary, secondary }) => {
    const actions = [
      ...(primary ? [button(primary, styles.buttonPrimary)] : []),
      ...(secondary ? [button(secondary, styles.buttonOutline)] : []),
    ]
    return stack('section', 'bg-muted px-6 py-24 md:py-32', [
      stack('div', 'mx-auto flex max-w-3xl flex-col items-center gap-6 text-center', [
        heading(title, '1', 'text-4xl font-bold tracking-tight md:text-6xl'),
        text(lead, 'text-lg text-muted-foreground md:text-xl'),
        ...(actions.length > 0 ? [stack('div', 'flex flex-row flex-wrap justify-center gap-4 pt-2', actions)] : []),
      ]),
    ])
  },
}

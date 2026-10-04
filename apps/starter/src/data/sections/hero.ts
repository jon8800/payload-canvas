import { button, heading, list, stack, styles, text, type Action, defineSection } from './build'

export type HeroInput = {
  title: string
  text: string
  primary?: Action
  secondary?: Action
  /**
   * "home": a large title for the home page, with optional notes in a row below.
   * "page" (default): the title of an inner page, with the text beside it on wide screens.
   */
  variant?: 'home' | 'page'
  /** Short notes under a home hero, e.g. the services. */
  notes?: string[]
}

export const hero = defineSection<HeroInput>({
  name: 'Hero',
  description:
    'Opening section, left-aligned. "home": a very large title, a lead paragraph, buttons and a row of short notes. ' +
    '"page": an inner page title with the lead paragraph and buttons beside it, above a thin line.',
  create: ({ title, text: lead, primary, secondary, variant = 'page', notes }) => {
    const actions = [
      ...(primary ? [button(primary, styles.buttonPrimary)] : []),
      ...(secondary ? [button(secondary, styles.buttonOutline)] : []),
    ]
    const actionRow = actions.length > 0 ? [stack('div', 'flex flex-row flex-wrap gap-3', actions)] : []
    if (variant === 'home') {
      return stack('section', 'px-5 pt-14 pb-2 md:px-8 md:pt-24 md:pb-4', [
        stack('div', 'mx-auto flex w-full max-w-6xl flex-col gap-8', [
          heading(title, '1', `max-w-5xl ${styles.displayTitle}`),
          text(lead, styles.lead),
          ...actionRow,
          ...(notes && notes.length > 0
            ? [
                list(
                  notes,
                  false,
                  'mt-6 flex list-none flex-col gap-2 border-t border-border pt-6 text-base text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-10',
                ),
              ]
            : []),
        ]),
      ])
    }
    const pageHeader = stack('section', 'border-b border-border px-5 pt-14 pb-12 md:px-8 md:pt-24 md:pb-16', [
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-12 md:items-end md:gap-12', [
        heading(title, '1', `md:col-span-7 ${styles.pageTitle}`),
        stack('div', 'flex flex-col items-start gap-6 md:col-span-5', [text(lead, styles.lead), ...actionRow]),
      ]),
    ])
    return { ...pageHeader, label: 'Page header' }
  },
})

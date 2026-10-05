import { button, heading, list, motions, stack, styles, text, withMotion, type Action, defineSection } from './build'

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
  /** A small label before the notes, e.g. "What we do", so they read as a list, not as links. */
  notesLabel?: string
}

export const hero = defineSection<HeroInput>({
  name: 'Hero',
  description:
    'Opening section, left-aligned. "home": a very large title, a lead paragraph, buttons and a labeled row of short notes. ' +
    '"page": an inner page title with the lead paragraph and buttons beside it, above a thin line.',
  create: ({ title, text: lead, primary, secondary, variant = 'page', notes, notesLabel }) => {
    const actions = [
      ...(primary ? [withMotion(button(primary, styles.buttonPrimary), motions.pressable)] : []),
      ...(secondary ? [withMotion(button(secondary, styles.buttonOutline), motions.pressable)] : []),
    ]
    const actionRow = actions.length > 0 ? [stack('div', 'flex flex-row flex-wrap gap-3', actions)] : []
    // The title is still, so it paints at once (it is the largest element of the page). The
    // text and buttons beside it fade up one beat later.
    if (variant === 'home') {
      return stack('section', 'px-5 pt-14 pb-2 md:px-8 md:pt-24 md:pb-4', [
        stack('div', 'mx-auto flex w-full max-w-6xl flex-col gap-8', [
          heading(title, '1', `max-w-5xl ${styles.displayTitle}`),
          withMotion(
            {
              ...stack('div', 'flex flex-col gap-8', [
                text(lead, styles.lead),
                ...actionRow,
                ...(notes && notes.length > 0
                  ? [
                      stack('div', 'mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-baseline sm:gap-10', [
                        ...(notesLabel ? [text(notesLabel, 'text-sm font-medium text-foreground')] : []),
                        list(notes, false, 'flex list-none flex-col gap-2 text-base text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-10'),
                      ]),
                    ]
                  : []),
              ]),
              label: 'Intro',
            },
            motions.heroEnter,
          ),
        ]),
      ])
    }
    const pageHeader = stack('section', 'border-b border-border px-5 pt-14 pb-12 md:px-8 md:pt-24 md:pb-16', [
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-12 md:items-end md:gap-12', [
        heading(title, '1', `md:col-span-7 ${styles.pageTitle}`),
        withMotion(stack('div', 'flex flex-col items-start gap-6 md:col-span-5', [text(lead, styles.lead), ...actionRow]), motions.heroEnter),
      ]),
    ])
    return { ...pageHeader, label: 'Page header' }
  },
})

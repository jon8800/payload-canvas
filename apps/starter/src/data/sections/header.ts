import { button, defineSection, link, menu, PRIMARY_HOVER, stack, text, type Action, type LinkInput, type Section } from './build'

export type HeaderInput = {
  siteName: string
  home: LinkInput
  nav: Action[]
  /** A button after the links. Hidden on phones, where it is the last row of the menu panel. */
  cta?: Action
}

const CTA =
  'hidden min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground ' +
  `transition-colors ${PRIMARY_HOVER} sm:inline-flex`

export const header: Section<HeaderInput> = defineSection<HeaderInput>({
  name: 'Header',
  description:
    'Site header for a template part, sticky at the top: the site name (links home), a menu and an optional button. ' +
    'Below tablet width the links fold into a "Menu" button that opens a panel under the header.',
  create: ({ siteName, home, nav, cta }) =>
    // `sticky` positions the header, so the menu panel opens right below it.
    stack('header', 'sticky top-0 z-40 border-b border-border bg-background px-5 md:px-8', [
      stack('div', 'mx-auto flex w-full max-w-6xl flex-row items-center justify-between gap-6 py-3', [
        link(home, 'inline-flex min-h-11 items-center font-display text-2xl tracking-[-0.01em]', [text(siteName)]),
        stack('div', 'flex flex-row items-center gap-3 md:gap-8', [
          menu(nav, 'Main', 'md', 'flex flex-row items-center gap-7 text-[0.9375rem] font-medium', cta),
          ...(cta ? [button(cta, CTA)] : []),
        ]),
      ]),
    ]),
})

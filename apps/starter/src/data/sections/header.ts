import { button, link, stack, text, type Action, type LinkInput, type Section } from './build'

export type HeaderInput = {
  siteName: string
  home: LinkInput
  nav: Action[]
  cta?: Action
}

const NAV_BUTTON =
  'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90'

export const header: Section<HeaderInput> = {
  name: 'Header',
  description: 'Site header for a template part: the site name (links home), a row of nav links and an optional button.',
  create: ({ siteName, home, nav, cta }) =>
    stack('header', 'border-b border-border bg-background', [
      stack('div', 'mx-auto flex max-w-6xl flex-row flex-wrap items-center justify-between gap-4 px-6 py-4', [
        link(home, 'text-lg font-bold tracking-tight', [text(siteName)]),
        stack('nav', 'flex flex-row flex-wrap items-center gap-6 text-sm font-medium', [
          ...nav.map((item) =>
            link(item.link, 'text-muted-foreground transition-colors hover:text-foreground', [text(item.label)]),
          ),
          ...(cta ? [button(cta, NAV_BUTTON)] : []),
        ]),
      ]),
    ]),
}

import { divider, link, stack, text, type Action, type Section } from './build'

export type FooterInput = {
  siteName: string
  tagline: string
  links: Action[]
  copyright: string
}

export const footer: Section<FooterInput> = {
  name: 'Footer',
  description:
    'Site footer for a template part: site name and tagline, a row of links, a divider and a copyright line.',
  create: ({ siteName, tagline, links, copyright }) =>
    stack('footer', 'border-t border-border bg-muted', [
      stack('div', 'mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12', [
        stack('div', 'flex flex-col gap-6 md:flex-row md:items-center md:justify-between', [
          stack('div', 'flex flex-col gap-1', [
            text(siteName, 'text-lg font-bold'),
            text(tagline, 'text-sm text-muted-foreground'),
          ]),
          stack(
            'nav',
            'flex flex-row flex-wrap gap-6 text-sm',
            links.map((item) => link(item.link, 'text-muted-foreground hover:text-foreground', [text(item.label)])),
          ),
        ]),
        divider('border-border'),
        text(copyright, 'text-sm text-muted-foreground'),
      ]),
    ]),
}

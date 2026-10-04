import { defineSection, grid, link, menu, stack, text, url, type Action, type Section } from './build'

export type FooterInput = {
  siteName: string
  tagline: string
  links: Action[]
  contact?: { email?: string; phone?: string; hours?: string }
  copyright: string
}

const CONTACT_LINK = 'self-start underline decoration-1 underline-offset-4 hover:decoration-2'
const COLUMN_TITLE = 'text-sm font-medium text-muted-foreground'

export const footer: Section<FooterInput> = defineSection<FooterInput>({
  name: 'Footer',
  description:
    'Site footer for a template part: the site name and tagline, a column of links, a contact column ' +
    '(email and phone as links, opening hours) and a copyright line.',
  create: ({ siteName, tagline, links, contact, copyright }) =>
    stack('footer', 'border-t border-border bg-muted px-5 md:px-8', [
      stack('div', 'mx-auto flex w-full max-w-6xl flex-col gap-14 py-14 md:py-20', [
        grid('grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12', [
          stack('div', 'flex flex-col gap-3 sm:col-span-2 lg:col-span-6', [
            text(siteName, 'font-display text-3xl tracking-[-0.01em]'),
            text(tagline, 'max-w-sm text-muted-foreground'),
          ]),
          stack('div', 'flex flex-col gap-2 lg:col-span-3', [
            text('Pages', COLUMN_TITLE),
            menu(links, 'Footer', 'never', 'flex flex-col items-start text-base'),
          ]),
          ...(contact
            ? [
                stack('div', 'flex flex-col items-start gap-3 lg:col-span-3', [
                  text('Contact', COLUMN_TITLE),
                  ...(contact.email ? [link(url(`mailto:${contact.email}`), CONTACT_LINK, [text(contact.email)])] : []),
                  ...(contact.phone
                    ? [link(url(`tel:${contact.phone.replace(/[^+\d]/g, '')}`), CONTACT_LINK, [text(contact.phone)])]
                    : []),
                  ...(contact.hours ? [text(contact.hours, 'text-muted-foreground')] : []),
                ]),
              ]
            : []),
        ]),
        text(copyright, 'border-t border-border pt-6 text-sm text-muted-foreground'),
      ]),
    ]),
})

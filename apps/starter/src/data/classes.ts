// The demo site's editable classes (the plugin's `builder-classes` collection). The seed creates
// them, and the sections use them by name in `className`. An editor changes a class once in the
// Styles panel, and every block that uses it changes. See the plugin README, "Editable classes".
// Names must not be Tailwind classes: "site-container", because `container` is one.

export type SiteClass = { name: string; label: string; group: string; styles: string }

/** A primary-colored button gets a little darker on hover. */
export const PRIMARY_HOVER = 'hover:bg-[color-mix(in_oklch,var(--color-primary),black_14%)]'

export const siteClasses: SiteClass[] = [
  { name: 'section', label: 'Section', group: 'Layout', styles: 'px-5 py-20 md:px-8 md:py-28' },
  { name: 'site-container', label: 'Container', group: 'Layout', styles: 'mx-auto flex w-full max-w-6xl flex-col gap-12 md:gap-16' },
  { name: 'card', label: 'Card', group: 'Layout', styles: 'rounded-lg border border-border bg-card p-6 sm:p-8 md:p-10' },
  { name: 'section-title', label: 'Section title', group: 'Text', styles: 'font-display text-4xl leading-[1.08] tracking-[-0.02em] md:text-5xl' },
  { name: 'lead', label: 'Lead', group: 'Text', styles: 'max-w-[60ch] text-lg leading-relaxed text-muted-foreground md:text-xl' },
  { name: 'eyebrow', label: 'Eyebrow', group: 'Text', styles: 'text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground' },
  // The base of every button. The other button classes start with it.
  { name: 'button', label: 'Button base', group: 'Buttons', styles: 'inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-medium' },
  { name: 'button-primary', label: 'Primary button', group: 'Buttons', styles: `button bg-primary text-primary-foreground transition-colors ${PRIMARY_HOVER}` },
  { name: 'button-secondary', label: 'Secondary button', group: 'Buttons', styles: 'button border border-foreground/25 text-foreground transition-colors hover:border-foreground' },
]

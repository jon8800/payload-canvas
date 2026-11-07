// Read by the menu component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/** A panel's background, text and border colours: the theme's, else the system's. */
const SURFACE =
  'bg-[var(--color-background,Canvas)] text-[var(--color-foreground,CanvasText)] ' +
  'border-[var(--color-border,color-mix(in_oklab,currentColor_15%,transparent))]'

/**
 * Classes the menu component uses itself (the toggle, the panel and the links). They are listed in
 * the block's `classes`, so the generated CSS has them. Each string also holds `builder-css`:
 * the generated CSS only styles elements with that class. Keep in sync with `Menu.tsx` in
 * `payload-canvas/react`. Colours read the theme's CSS variables (`--color-background`,
 * `--color-foreground`, `--color-border`, `--color-primary`, `--color-primary-foreground`) with
 * system colours as the fallback, so the menu assumes no design system. The block's parts
 * (`partClassName`) take other colours.
 */
export const MENU_CLASS_MAP = classMap({
  /** The inline list: its items become children of the <nav>, so the block's className lays them out. */
  list: { md: 'hidden md:contents', lg: 'hidden lg:contents', never: 'contents' },
  toggleWrap: { md: 'md:hidden', lg: 'lg:hidden' },
  link:
    'inline-flex items-center py-2 opacity-75 transition-opacity hover:opacity-100 ' +
    'aria-[current=page]:opacity-100 aria-[current=page]:underline decoration-1 underline-offset-8',
  toggle:
    'flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md px-2 -mr-2 ' +
    '[&::-webkit-details-marker]:hidden',
  iconOpen: 'size-5 group-open:hidden',
  iconClose: 'hidden size-5 group-open:block',
  panel: `absolute inset-x-0 top-full z-50 border-y px-5 pt-2 pb-6 shadow-md ${SURFACE}`,
  panelList: 'flex flex-col',
  panelLink:
    'flex min-h-12 items-center border-b border-[var(--color-border,color-mix(in_oklab,currentColor_15%,transparent))] py-3 text-lg ' +
    'aria-[current=page]:font-semibold aria-[current=page]:underline decoration-1 underline-offset-8',
  /** A link with children (one level): a <details> dropdown next to, or in place of, the link. */
  submenu: 'relative flex items-center gap-1',
  submenuDetails: 'group/submenu',
  submenuToggle:
    'inline-flex cursor-pointer list-none items-center gap-1 py-2 opacity-75 transition-opacity hover:opacity-100 ' +
    'aria-[current=true]:opacity-100 [&::-webkit-details-marker]:hidden',
  submenuIcon: 'size-4 transition-transform group-open/submenu:rotate-180 motion-reduce:transition-none',
  submenuList: `absolute top-full left-0 z-50 flex min-w-48 flex-col border p-2 shadow-md ${SURFACE}`,
  submenuLink:
    'flex min-h-10 items-center px-3 py-2 opacity-75 transition-opacity hover:opacity-100 ' +
    'aria-[current=page]:opacity-100 aria-[current=page]:underline decoration-1 underline-offset-8',
  /** The children of a link in the small-screen panel: a nested list. */
  panelSubList: 'flex flex-col pl-4',
  panelSubLink:
    'flex min-h-11 items-center py-2 text-base ' +
    'aria-[current=page]:font-semibold aria-[current=page]:underline decoration-1 underline-offset-8',
  /** The optional button after the links in the panel. */
  panelCta:
    'mt-5 flex min-h-12 items-center justify-center rounded-full bg-[var(--color-primary,CanvasText)] px-6 text-base ' +
    'font-medium text-[var(--color-primary-foreground,Canvas)] transition-colors ' +
    'hover:bg-[color-mix(in_oklch,var(--color-primary,CanvasText),black_14%)]',
} as const)

/** The menu's labels and their English defaults (`builtinComponents({ labels: { menu } })`). */
export const MENU_LABELS = { label: 'Main', toggleLabel: 'Menu', submenuLabel: '{label} menu' }

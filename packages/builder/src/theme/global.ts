// The theme global: colors, fonts, radius and spacing, with the plugin's color, font and slider
// fields. Server-only (the revalidation hook imports next/cache).
import { revalidatePath, revalidateTag } from 'next/cache'
import type { Field, GlobalAfterChangeHook, GlobalBeforeChangeHook, GlobalConfig, TextField } from 'payload'

import { deriveColors } from './colors'
import { DEFAULT_THEME_SLUG, type ThemeOptions } from './config'

const CLIENT = '@payload-toolkit/builder/theme-client'
const COLOR_FIELD = `${CLIENT}#ThemeColorField`
const FONT_FIELD = `${CLIENT}#ThemeFontField`
const SLIDER_FIELD = `${CLIENT}#ThemeSliderField`
const SAVE_SIGNAL = `${CLIENT}#ThemeSaveSignal`

/** Name of the hidden field that holds the derived color variables. */
export const DERIVED_TOKENS_FIELD = 'derivedTokens'

const COLORS: { name: string; description: string }[] = [
  { name: 'primary', description: 'Buttons, links and accents.' },
  { name: 'secondary', description: 'Secondary buttons and surfaces.' },
  { name: 'accent', description: 'Highlights and hover surfaces.' },
  { name: 'muted', description: 'Quiet surfaces. Secondary text is derived from the background and text colors.' },
  { name: 'destructive', description: 'Errors and destructive actions.' },
  { name: 'background', description: 'Page background. Cards and popovers use it too.' },
  { name: 'foreground', description: 'Body text. Borders are mixed from the background and this color.' },
]

const colorField = ({ name, description }: (typeof COLORS)[number]): TextField => ({
  name,
  type: 'text',
  admin: { description: `${description} Empty: the default from your CSS.`, components: { Field: COLOR_FIELD } },
})

const fontField = (name: string, label: string, description: string): TextField => ({
  name,
  type: 'text',
  label,
  admin: { description, components: { Field: FONT_FIELD } },
})

/** The global's fields. Names and types match the starter's earlier `theme-settings` global, so its data keeps working. */
function themeFields(): Field[] {
  return [
    { name: 'colors', type: 'group', label: 'Colors', fields: COLORS.map(colorField) },
    {
      name: 'fonts',
      type: 'group',
      label: 'Fonts',
      admin: { description: 'Google Fonts. The site loads the chosen families.' },
      fields: [
        fontField('sans', 'Body text', 'Sets --font-sans. Empty: the default from your CSS.'),
        fontField('heading', 'Headings', 'Sets --font-heading. Empty: your CSS decides, usually the body font.'),
        fontField('mono', 'Code', 'Sets --font-mono. Empty: the default from your CSS.'),
      ],
    },
    {
      name: 'spacing',
      type: 'group',
      label: 'Spacing',
      fields: [
        {
          name: 'baseMultiplier',
          type: 'number',
          label: 'Spacing unit',
          min: 1,
          max: 16,
          admin: {
            description: 'Tailwind spacing unit in px (--spacing). p-4 is 4 units. Tailwind default: 4. Empty: the default from your CSS.',
            components: { Field: SLIDER_FIELD },
            custom: { min: 1, max: 16, step: 1, unit: 'px', fallback: 4 },
          },
        },
      ],
    },
    {
      name: 'borderRadius',
      type: 'text',
      label: 'Corner radius',
      admin: {
        description: 'Base corner radius in rem (--radius). Empty: the default from your CSS.',
        components: { Field: SLIDER_FIELD },
        custom: { min: 0, max: 2, step: 0.125, unit: 'rem', fallback: 0.625 },
      },
    },
    { name: DERIVED_TOKENS_FIELD, type: 'json', admin: { hidden: true } },
    // Renders nothing. After each save it tells open builder canvases to reload the theme.
    { name: 'themeSaveSignal', type: 'ui', admin: { components: { Field: SAVE_SIGNAL } } },
  ]
}

/** Derives the color variables on the same write, so API consumers get them too. */
const deriveTokens: GlobalBeforeChangeHook = ({ data, originalDoc }) => ({
  ...data,
  [DERIVED_TOKENS_FIELD]: deriveColors({ ...originalDoc?.colors, ...data.colors }),
})

/**
 * Clears Next's caches after a save: the theme's cache tag, and every page's cached render
 * (the theme is in every page's `<head>`). `context.disableRevalidate` skips it. Outside a Next
 * request (seed scripts, `payload run`) Next throws; that is logged and ignored.
 */
function revalidateTheme(cacheTag: string): GlobalAfterChangeHook {
  return ({ doc, req: { payload, context } }) => {
    if (context?.disableRevalidate) return doc
    try {
      revalidateTag(cacheTag, { expire: 0 })
      revalidatePath('/', 'layout')
    } catch (error) {
      payload.logger.debug(`[websiteBuilder] Theme revalidation skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
    return doc
  }
}

export function themeGlobal(options: ThemeOptions): GlobalConfig {
  const slug = options.slug ?? DEFAULT_THEME_SLUG
  return {
    slug,
    label: options.label ?? 'Theme',
    access: {
      read: () => true,
      update: ({ req }) => Boolean(req.user),
      ...options.access,
    },
    admin: { ...options.admin },
    hooks: {
      ...options.hooks,
      beforeChange: [deriveTokens, ...(options.hooks?.beforeChange ?? [])],
      afterChange: [revalidateTheme(options.cacheTag ?? slug), ...(options.hooks?.afterChange ?? [])],
    },
    fields: themeFields(),
  }
}

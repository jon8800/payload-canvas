// The Payload side of the translation demo (BUILDER_I18N_DEMO=1): Payload's `localization` and a
// plugin that keeps the app's other fields unlocalized. No Next imports: the Payload CLI loads it.
import type { Config, Field, LocalizationConfig, Plugin } from 'payload'
import { DEMO_DEFAULT_LOCALE, DEMO_LOCALES } from './locales'

/** English and German, with fallback to English. */
export const demoLocalization: LocalizationConfig = {
  locales: DEMO_LOCALES,
  defaultLocale: DEMO_DEFAULT_LOCALE,
  fallback: true,
}

/** A copy of the fields with `localized` turned off, at any depth. */
function unlocalized(fields: Field[]): Field[] {
  return fields.map((field) => {
    const next = { ...field } as Field & { localized?: boolean; fields?: Field[]; tabs?: { fields: Field[] }[]; blocks?: unknown[] }
    if ('localized' in next && next.localized) next.localized = false
    if (Array.isArray(next.fields)) next.fields = unlocalized(next.fields)
    if (Array.isArray(next.tabs)) next.tabs = next.tabs.map((tab) => ({ ...tab, fields: unlocalized(tab.fields) }))
    // Blocks fields (the form builder's form fields): each block's own fields. Slugs (block references) stay.
    if (Array.isArray(next.blocks)) {
      next.blocks = next.blocks.map((block) =>
        block && typeof block === 'object' && Array.isArray((block as { fields?: unknown }).fields)
          ? { ...block, fields: unlocalized((block as { fields: Field[] }).fields) }
          : block,
      )
    }
    return next
  })
}

/**
 * The demo translates builder layouts only. Plugins such as SEO, form builder and nested docs mark
 * their fields `localized`: with localization on, Drizzle's dev push would move those columns
 * to `_locales` tables and drop the seeded values. This plugin (before websiteBuilder) turns them
 * off, so turning the demo on and off only adds and removes Payload's version columns.
 */
export const withoutFieldLocalization: Plugin = (config: Config): Config => ({
  ...config,
  collections: config.collections?.map((c) => ({ ...c, fields: unlocalized(c.fields) })),
  globals: config.globals?.map((g) => ({ ...g, fields: unlocalized(g.fields) })),
})

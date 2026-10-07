// Localization on the site: the locale a page renders in. Payload already gives a layout read
// with `locale` in that locale's values (the plugin's afterRead hook). These helpers cover the
// rest: related documents and collection lists load in the same locale, and a layout in the
// stored form (read with `locale: 'all'`, or from a raw read) is resolved here.

import type { Payload } from 'payload'
import { hasLocaleValues, localeSettingsOf, resolveLayoutLocale, type BlockDefinition, type FallbackLocale, type Layout } from '../../core'

/** The locale of a render. Pass what you pass to Payload's Local API. */
export type RenderLocale = {
  /** The locale code, e.g. "de". Leave out for the default locale (or a site without localization). */
  locale?: string | null
  /** Payload's `fallbackLocale`: a code, codes, or `false` for no fallback. Default: the config's. */
  fallbackLocale?: FallbackLocale
}

/**
 * Local API arguments. Typed `never`: an app's generated types narrow `locale` to its own codes
 * (and to `null` without localization), and the builder works with any app.
 */
export type LocaleArgs = { locale?: never; fallbackLocale?: never }

/** The Local API arguments for a locale: `{ locale, fallbackLocale }`, or nothing. */
export function localeArgs(options: RenderLocale | undefined): LocaleArgs {
  if (!options?.locale) return {}
  const fallback = options.fallbackLocale
  const args: Record<string, unknown> = { locale: options.locale }
  if (fallback === false || typeof fallback === 'string' || Array.isArray(fallback)) args.fallbackLocale = fallback
  return args as LocaleArgs
}

/**
 * The layout in the render's locale. A layout Payload already resolved (it has no `locales`)
 * stays as it is. A stored form is resolved with the Payload config's locales and fallback.
 */
export function localizeLayout(layout: Layout, blocks: readonly BlockDefinition[], payload: Payload, options: RenderLocale | undefined): Layout {
  if (!hasLocaleValues(layout)) return layout
  const settings = localeSettingsOf(payload.config.localization)
  if (!settings) return layout
  return resolveLayoutLocale(layout, blocks, settings, options?.locale ?? settings.defaultLocale, options?.fallbackLocale)
}

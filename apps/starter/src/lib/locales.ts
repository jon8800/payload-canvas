// Dev demo of translated pages (BUILDER_I18N_DEMO=1 in .env): English and German. No server
// imports, so the proxy can read it too.
//
// With the flag on, Payload's `localization` is on and builder pages translate their text props
// (one layout, translated content). The site serves German under the /de prefix: the proxy
// removes the prefix and passes the locale in the `x-locale` request header.

export const i18nDemo = process.env.BUILDER_I18N_DEMO === '1'

export const DEMO_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
]

export const DEMO_DEFAULT_LOCALE = 'en'

/** Request header with the locale of a /de/… request. */
export const LOCALE_HEADER = 'x-locale'

/** The locale prefix of a path ("/de/about" -> "de"), or null for the default locale. */
export function localeOfPath(pathname: string): string | null {
  if (!i18nDemo) return null
  const first = pathname.split('/')[1] ?? ''
  return first !== DEMO_DEFAULT_LOCALE && DEMO_LOCALES.some((l) => l.code === first) ? first : null
}

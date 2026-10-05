// The locale of a site request (BUILDER_I18N_DEMO=1). Server only: it reads the request headers.
import { headers } from 'next/headers'
import { DEMO_LOCALES, i18nDemo, LOCALE_HEADER } from './locales'

/** The request's locale ("de" under /de/…), or undefined for the default locale and without the demo. */
export async function requestLocale(): Promise<string | undefined> {
  if (!i18nDemo) return undefined
  const value = (await headers()).get(LOCALE_HEADER)
  return value && DEMO_LOCALES.some((l) => l.code === value) ? value : undefined
}

import type { GlobalAfterChangeHook, GlobalBeforeChangeHook } from 'payload'
import { revalidateTag } from 'next/cache'
import { deriveAllColors, type CoreColors } from '@/fields/theme/deriveColors'

/**
 * Derives all color tokens from the core colors before the theme is saved.
 * It sets the value on the same write, so no second update (and no lock wait) is needed.
 */
export const deriveThemeTokens: GlobalBeforeChangeHook = ({ data, originalDoc }) => {
  const colors: CoreColors = { ...originalDoc?.colors, ...data.colors }
  return { ...data, derivedTokens: deriveAllColors(colors) }
}

export const revalidateTheme: GlobalAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (context?.disableRevalidate) return doc
  payload.logger.info('Revalidating theme-settings cache tag')
  revalidateTag('theme-settings', { expire: 0 })
  return doc
}

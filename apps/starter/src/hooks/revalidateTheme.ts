import type { GlobalAfterChangeHook } from 'payload'
import { revalidateTag } from 'next/cache'
import { deriveAllColors } from '@/fields/theme/deriveColors'

export const revalidateTheme: GlobalAfterChangeHook = async ({
  doc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc

  // Extract core colors from doc
  const coreColors = {
    primary: doc.colors?.primary,
    secondary: doc.colors?.secondary,
    accent: doc.colors?.accent,
    muted: doc.colors?.muted,
    destructive: doc.colors?.destructive,
    background: doc.colors?.background,
    foreground: doc.colors?.foreground,
  }

  // Only derive if at least one core color is set
  const hasAnyColor = Object.values(coreColors).some((v) => v != null && v !== '')
  if (!hasAnyColor) {
    revalidateTag('theme-settings')
    return doc
  }

  // Derive all color tokens from core set
  const derived = deriveAllColors(coreColors)

  // Update the global with derived tokens, using context flag to prevent infinite loop
  await payload.updateGlobal({
    slug: 'theme-settings',
    data: { derivedTokens: derived },
    context: { disableRevalidate: true },
  })

  payload.logger.info('Revalidating theme-settings cache tag')
  revalidateTag('theme-settings')

  return doc
}

// Theme CSS variables and Google font links from the ThemeSettings global.
// Rendered inside <head> by the site layout and the builder canvas layout.
import { cache } from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { buildCSSVariables, cssVarsToString, type ThemeData } from '@/lib/themeUtils'

// Read once per request, not with Next's data cache: a save from another process (for example
// `pnpm seed:demo`) cannot clear that cache, so the site kept an old theme until a restart.
// The site pages are dynamic anyway, and the global is one small row.
const getTheme = cache(async () => {
  const payload = await getPayload({ config: configPromise })
  return payload.findGlobal({ slug: 'theme-settings', depth: 0 })
})

/**
 * Google Fonts stylesheet with the regular, italic, medium, semibold and bold styles. The CSS v1
 * API skips styles a family does not have, so any family from the font list loads.
 */
function fontHref(family: string): string {
  return `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:400,400i,500,600,700&display=swap`
}

export async function ThemeHead() {
  const theme = (await getTheme()) as ThemeData
  const themeCSS = cssVarsToString(buildCSSVariables(theme))
  const families = [...new Set([theme.fonts?.sans, theme.fonts?.heading, theme.fonts?.mono])].filter((f): f is string => Boolean(f))

  return (
    <>
      {themeCSS ? <style data-theme-vars="" dangerouslySetInnerHTML={{ __html: themeCSS }} /> : null}
      {families.length > 0 ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {families.map((family) => (
            <link key={family} rel="stylesheet" href={fontHref(family)} />
          ))}
        </>
      ) : null}
    </>
  )
}

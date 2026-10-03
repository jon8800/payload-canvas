// Theme CSS variables and Google font links from the ThemeSettings global.
// Rendered inside <head> by the site layout and the builder canvas layout.
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { buildCSSVariables, cssVarsToString, type ThemeData } from '@/lib/themeUtils'

const getTheme = unstable_cache(
  async () => {
    const payload = await getPayload({ config: configPromise })
    return payload.findGlobal({ slug: 'theme-settings' })
  },
  ['theme-settings'],
  { tags: ['theme-settings'] },
)

function fontHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`
}

export async function ThemeHead() {
  const theme = (await getTheme()) as ThemeData
  const themeCSS = cssVarsToString(buildCSSVariables(theme))
  const families = [theme.fonts?.sans, theme.fonts?.mono].filter((f): f is string => Boolean(f))

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

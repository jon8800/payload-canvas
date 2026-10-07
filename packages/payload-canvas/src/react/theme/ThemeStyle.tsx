// Server-only: the theme global as CSS variables and Google Fonts links, for the `<head>`.
import { themeConfigOf, themeOutput, type ThemeData, type ThemeOutput } from '../../theme'
import type { Payload } from 'payload'
import { cache } from 'react'

import { THEME_PRECEDENCE, themeStyleHref } from './constants'
import { ThemeLive } from './ThemeLive'

export type LoadedTheme = ThemeOutput & {
  /** The theme global (depth 0). */
  data: ThemeData
}

/**
 * Reads the theme global and turns it into CSS (`:root:root { --primary: …; … }`) and a Google
 * Fonts URL. `null` when the plugin runs with `theme: false`. Read once per request (React
 * `cache`), never from Next's data cache, so a save is visible on the next request. The plugin
 * clears Next's page cache after each theme save.
 */
export const loadTheme = cache(async (payload: Payload): Promise<LoadedTheme | null> => {
  const config = themeConfigOf(payload)
  if (!config) return null
  const data = (await payload.findGlobal({ slug: config.slug as never, depth: 0 })) as ThemeData
  return { data, ...themeOutput(data) }
})

export type ThemeStyleProps = {
  payload: Payload
  /** Load the theme's Google Fonts (`<link>` tags). Default `true`. `false` when you host fonts yourself. */
  fonts?: boolean
  /**
   * Reload the theme in the browser when the theme global is saved (in another tab) or the page
   * becomes visible. For the builder canvas. Default `false`.
   */
  live?: boolean
}

/**
 * The theme for the `<head>`: a `<style>` tag with the theme variables and the Google Fonts links.
 * Put it in the site's root layout and in the canvas layout (with `live`). Renders nothing with
 * `theme: false`.
 */
export async function ThemeStyle({ payload, fonts = true, live = false }: ThemeStyleProps) {
  const theme = await loadTheme(payload)
  const config = themeConfigOf(payload)
  if (!theme || !config) return null
  const fontsHref = fonts ? theme.fontsHref : null
  return (
    <>
      {/* React manages tags with `precedence` itself (in the head, outside hydration). The href
          holds a hash of the CSS, so a new theme renders a new tag. */}
      {theme.css ? (
        <style href={themeStyleHref(theme.css)} precedence={THEME_PRECEDENCE}>
          {theme.css}
        </style>
      ) : null}
      {fontsHref ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} precedence={THEME_PRECEDENCE} />
        </>
      ) : null}
      {live ? <ThemeLive endpoint={config.endpoint} fonts={fonts} /> : null}
    </>
  )
}

'use client'

import { THEME_CHANNEL, type ThemeOutput } from '../../theme'
import { useEffect } from 'react'

import { THEME_FONTS_SELECTOR, THEME_PRECEDENCE, THEME_STYLE_SELECTOR } from './constants'

/**
 * Puts the theme in the page: updates the theme `<style>` and fonts `<link>` tags that
 * `ThemeStyle` rendered, or adds them to the `<head>`.
 */
export function applyThemeOutput(doc: Document, { css, fontsHref }: ThemeOutput) {
  const styles = [...doc.querySelectorAll<HTMLStyleElement>(THEME_STYLE_SELECTOR)]
  if (styles.length === 0) {
    const style = doc.createElement('style')
    style.dataset.precedence = THEME_PRECEDENCE
    doc.head.appendChild(style)
    styles.push(style)
  }
  for (const style of styles) {
    if (style.textContent !== css) style.textContent = css
  }

  const links = [...doc.querySelectorAll<HTMLLinkElement>(THEME_FONTS_SELECTOR)]
  if (!fontsHref) {
    for (const link of links) link.remove()
    return
  }
  if (links.length === 0) {
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.dataset.precedence = THEME_PRECEDENCE
    doc.head.appendChild(link)
    links.push(link)
  }
  for (const link of links) {
    if (link.getAttribute('href') !== fontsHref) link.setAttribute('href', fontsHref)
  }
}

/**
 * Keeps the page's theme current without a reload: it loads the theme from `endpoint` (the
 * plugin's `GET {api}/builder/theme`) when the theme global is saved in another tab, and when
 * the page becomes visible again. `ThemeStyle` renders it with `live`. `fonts={false}` leaves the
 * Google Fonts link out. Renders nothing.
 */
export function ThemeLive({ endpoint, fonts = true }: { endpoint: string; fonts?: boolean }) {
  useEffect(() => {
    let controller: AbortController | null = null
    const reload = () => {
      controller?.abort()
      const current = new AbortController()
      controller = current
      fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', signal: current.signal })
        .then((res) => (res.ok ? (res.json() as Promise<ThemeOutput>) : null))
        .then((output) => {
          if (output && typeof output.css === 'string') applyThemeOutput(document, fonts ? output : { ...output, fontsHref: null })
        })
        .catch(() => {
          // Offline or aborted: keep the current theme.
        })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload()
    }
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(THEME_CHANNEL)
    channel?.addEventListener('message', reload)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller?.abort()
      channel?.close()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endpoint, fonts])

  return null
}

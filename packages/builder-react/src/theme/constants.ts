// Shared by ThemeStyle (server) and ThemeLive (client). A plain module: values exported from a
// 'use client' file are client references on the server.

/**
 * React precedence group of the theme's `<style>` and fonts `<link>`. React renders them with
 * `data-precedence="<this>"` in the `<head>` and manages them itself, so they never take part in
 * hydration (no mismatch with other tags in the head or body).
 */
export const THEME_PRECEDENCE = 'payload-toolkit-theme'

/** `href` of the theme `<style>`: a prefix plus a hash of its CSS, so a changed theme renders a new tag (React dedupes by href). */
export function themeStyleHref(css: string): string {
  let hash = 5381
  for (let i = 0; i < css.length; i++) hash = ((hash << 5) + hash + css.charCodeAt(i)) | 0
  return `payload-toolkit-theme-${(hash >>> 0).toString(36)}`
}

/** Selector of the theme `<style>` tags. */
export const THEME_STYLE_SELECTOR = `style[data-precedence="${THEME_PRECEDENCE}"]`
/** Selector of the theme's Google Fonts `<link>` tags. */
export const THEME_FONTS_SELECTOR = `link[rel="stylesheet"][data-precedence="${THEME_PRECEDENCE}"]`

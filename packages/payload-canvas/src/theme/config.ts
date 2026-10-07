// Theme option types and the keys shared by the plugin, the site helpers and the canvas.
// Client-safe: type imports only.
import type { GlobalConfig } from 'payload'

/** Default slug of the theme global. */
export const DEFAULT_THEME_SLUG = 'theme-settings'

/** Path of the theme endpoint below the API route: `GET {api}/builder/theme` returns `ThemeOutput`. */
export const THEME_PATH = '/builder/theme'

/** BroadcastChannel name. The theme's admin page posts on it after a save; `ThemeLive` listens. */
export const THEME_CHANNEL = 'payload-canvas:theme'

/** Server-only key in `config.custom` that holds `ThemeServerConfig`. */
export const THEME_CONFIG_KEY = 'websiteBuilderTheme'

export type ThemeOptions = {
  /** Slug of the theme global. Default "theme-settings". */
  slug?: string
  /** Label in the admin. Default "Theme". */
  label?: GlobalConfig['label']
  /** Default: anyone reads, signed-in users update. */
  access?: GlobalConfig['access']
  /** Merged into the global's `admin` (for example `group` or `livePreview`). */
  admin?: GlobalConfig['admin']
  /** Extra hooks. They run after the plugin's own hooks. */
  hooks?: GlobalConfig['hooks']
  /**
   * Cache tag the plugin revalidates after each theme save, with `revalidateTag(tag, { expire: 0 })`.
   * Tag your own cached theme reads with it. Default: the slug.
   */
  cacheTag?: string
}

/** What the server helpers need. Stored under `THEME_CONFIG_KEY`. */
export type ThemeServerConfig = {
  slug: string
  cacheTag: string
  /** Full API path of the theme endpoint, e.g. "/api/builder/theme". */
  endpoint: string
}

/** The theme config the plugin stored on the Payload config. `null` without the plugin or with `theme: false`. */
export function themeConfigOf(payload: { config: { custom?: Record<string, unknown> } }): ThemeServerConfig | null {
  const value = payload.config.custom?.[THEME_CONFIG_KEY] as ThemeServerConfig | undefined
  return typeof value?.slug === 'string' ? value : null
}

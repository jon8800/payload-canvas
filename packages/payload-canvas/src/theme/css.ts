// The stored theme as CSS variables and font links. Pure and client-safe.
import { deriveColors, type ThemeColors } from './colors'
import { fallbackFamilyName, fallbackFontFace, hasFallbackMetrics } from './fallbacks'

/** The theme global's data, as Payload stores it. Every value is optional. */
export type ThemeData = {
  colors?: ThemeColors | null
  fonts?: ThemeFonts | null
  spacing?: { baseMultiplier?: number | string | null } | null
  /** Corner radius in rem, e.g. "0.625". */
  borderRadius?: string | number | null
  /** The color variables derived on save (for API consumers). The CSS helpers derive them again. */
  derivedTokens?: Record<string, string> | null
}

/** Google Font family names. */
export type ThemeFonts = {
  sans?: string | null
  heading?: string | null
  mono?: string | null
}

/** Font variable name → fallback stack after the chosen family. */
const FONT_FALLBACKS: Record<keyof ThemeFonts, string> = {
  sans: 'sans-serif',
  heading: 'serif',
  mono: 'monospace',
}

/** A family name with only letters, digits, spaces and dashes (Google Fonts names), so it is safe in CSS and URLs. */
export function cleanFamily(family: string | null | undefined): string | null {
  const clean = family?.replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim()
  return clean || null
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

/**
 * The font families the theme chose, by CSS variable name: `{ sans: 'Inter', heading: 'Fraunces' }`.
 * Empty fonts are left out.
 */
export function themeFontFamilies(theme: ThemeData | null | undefined): Record<string, string> {
  const families: Record<string, string> = {}
  for (const name of Object.keys(FONT_FALLBACKS) as (keyof ThemeFonts)[]) {
    const family = cleanFamily(theme?.fonts?.[name])
    if (family) families[name] = family
  }
  return families
}

/**
 * The CSS variables the theme sets. Only values the theme has are included, so everything else
 * keeps the default from the app's CSS.
 *
 * - Colors: `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--secondary`,
 *   `--secondary-foreground`, `--accent`, `--accent-foreground`, `--muted`, `--muted-foreground`,
 *   `--destructive`, `--destructive-foreground`, `--card`, `--card-foreground`, `--popover`,
 *   `--popover-foreground`, `--border`, `--input`, `--ring`, `--chart-1` … `--chart-5`,
 *   `--sidebar*` (the shadcn/ui names).
 * - `--radius` (rem), `--spacing` (Tailwind's spacing unit, from the base in px).
 * - `--font-sans`, `--font-heading`, `--font-mono`.
 */
export function themeVariables(theme: ThemeData | null | undefined): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(deriveColors(theme?.colors))) vars[`--${key}`] = value

  const radius = toNumber(theme?.borderRadius)
  if (radius != null && radius >= 0) vars['--radius'] = `${radius}rem`

  const base = toNumber(theme?.spacing?.baseMultiplier)
  if (base != null && base > 0) vars['--spacing'] = `${base / 16}rem`

  for (const [name, family] of Object.entries(themeFontFamilies(theme))) {
    // A known family gets a fallback face scaled to its size (see `themeCss`), so the swap does not move text.
    const sized = hasFallbackMetrics(family) ? `'${fallbackFamilyName(family)}', ` : ''
    vars[`--font-${name}`] = `'${family}', ${sized}${FONT_FALLBACKS[name as keyof ThemeFonts]}`
  }
  return vars
}

/**
 * The theme as CSS: the fallback font faces (one `@font-face` for each chosen family that has known
 * metrics), then one rule `:root:root { --primary: …; … }`. Empty string when the theme sets nothing.
 * The doubled selector wins over the `:root` defaults in the app's CSS in any load order.
 */
export function themeCss(theme: ThemeData | null | undefined): string {
  const entries = Object.entries(themeVariables(theme))
  if (entries.length === 0) return ''
  const faces = [...new Set(Object.values(themeFontFamilies(theme)))].flatMap((family) => fallbackFontFace(family) ?? [])
  const rule = `:root:root { ${entries.map(([k, v]) => `${k}: ${v};`).join(' ')} }`
  return [...faces, rule].join('\n')
}

/**
 * One Google Fonts stylesheet URL for the families, with the regular, italic, medium, semibold
 * and bold styles. The CSS v1 API skips styles a family does not have, so any Google font loads.
 * `null` without families.
 */
export function googleFontsHref(families: Iterable<string>): string | null {
  const unique = [...new Set([...families].map(cleanFamily).filter((f): f is string => Boolean(f)))]
  if (unique.length === 0) return null
  const family = unique.map((f) => `${encodeURIComponent(f)}:400,400i,500,600,700`).join('|')
  return `https://fonts.googleapis.com/css?family=${family}&display=swap`
}

/** What a page needs to apply a theme: the CSS rule and the Google Fonts URL. JSON-serializable. */
export type ThemeOutput = { css: string; fontsHref: string | null }

export function themeOutput(theme: ThemeData | null | undefined): ThemeOutput {
  return { css: themeCss(theme), fontsHref: googleFontsHref(Object.values(themeFontFamilies(theme))) }
}

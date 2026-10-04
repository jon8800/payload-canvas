// Color math for the theme: hex colors to OKLCH, and the full set of color variables derived from
// the theme's core colors. Pure and client-safe (no dependencies).

/** A color in OKLCH: lightness 0–1, chroma, hue in degrees. */
export type Oklch = { l: number; c: number; h: number }

/** The theme's core colors, as hex strings (`#1f4536`). Empty values are skipped. */
export type ThemeColors = {
  primary?: string | null
  secondary?: string | null
  accent?: string | null
  muted?: string | null
  destructive?: string | null
  background?: string | null
  foreground?: string | null
}

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa` (alpha ignored). `null` for anything else. */
export function parseHex(value: string | null | undefined): [number, number, number] | null {
  const hex = value?.trim().replace(/^#/, '')
  if (!hex || !/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex.slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number]
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** sRGB (0–1 per channel) to OKLCH, with Björn Ottosson's OKLab matrices. */
export function rgbToOklch([red, green, blue]: [number, number, number]): Oklch {
  const r = linear(red)
  const g = linear(green)
  const b = linear(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.sqrt(A * A + B * B)
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c: c < 1e-4 ? 0 : c, h }
}

/** A hex color as OKLCH. `null` if the value is not a hex color. */
export function hexToOklchValue(hex: string | null | undefined): Oklch | null {
  const rgb = parseHex(hex)
  return rgb ? rgbToOklch(rgb) : null
}

const round = (n: number, digits: number) => Number(n.toFixed(digits))
const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** CSS text for an OKLCH color: `oklch(0.3712 0.0521 163.42)`. */
export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${round(clamp(l), 4)} ${round(Math.max(0, c), 4)} ${round(h, 2)})`
}

/** A hex color as CSS `oklch(…)`. `null` if the value is not a hex color. */
export function hexToOklch(hex: string | null | undefined): string | null {
  const color = hexToOklchValue(hex)
  return color ? formatOklch(color) : null
}

const DARK_TEXT = 'oklch(0.145 0 0)'
const LIGHT_TEXT = 'oklch(0.985 0 0)'

/** Dark text on light colors, light text on dark ones. */
function autoForeground(color: Oklch): string {
  // 0.65, not 0.5: saturated mid-tone brand colors (indigo, blue) read better with light text.
  return color.l > 0.65 ? DARK_TEXT : LIGHT_TEXT
}

/**
 * A color between `from` and `to`: `amount` 0 is `from`, 1 is `to`. Lightness and chroma mix;
 * the hue stays `from`'s when `from` has one, so tints keep the surface's warmth.
 */
function mix(from: Oklch, to: Oklch, amount: number): string {
  return formatOklch({
    l: from.l + (to.l - from.l) * amount,
    c: from.c + (to.c - from.c) * amount,
    h: from.c > 0.005 ? from.h : to.h,
  })
}

/**
 * Every color variable the theme sets, from its core colors. Keys are CSS variable names without
 * `--` (`primary`, `primary-foreground`, `border`, `chart-1`, …); values are `oklch(…)`.
 * Core colors that are empty or not hex are left out, and so are the variables derived from them.
 */
export function deriveColors(core: ThemeColors | null | undefined): Record<string, string> {
  const tokens: Record<string, string> = {}
  const parsed = Object.fromEntries(
    Object.entries(core ?? {}).map(([key, value]) => [key, hexToOklchValue(value)]),
  ) as Partial<Record<keyof ThemeColors, Oklch | null>>
  const { primary, secondary, accent, muted, destructive, background, foreground } = parsed

  const set = (key: string, color: Oklch | string | null | undefined) => {
    if (!color) return
    tokens[key] = typeof color === 'string' ? color : formatOklch(color)
  }
  const shiftLightness = (color: Oklch, delta: number): Oklch => ({ ...color, l: clamp(color.l + delta) })

  if (primary) {
    set('primary', primary)
    set('primary-foreground', autoForeground(primary))
  }
  if (secondary) {
    set('secondary', secondary)
    set('secondary-foreground', autoForeground(secondary))
  }
  if (accent) {
    set('accent', accent)
    set('accent-foreground', autoForeground(accent))
  }
  if (muted) {
    set('muted', muted)
    // Secondary text: about two thirds of the way from the background to the foreground, so it
    // reads as quieter text and still passes 4.5:1 on the background and on muted surfaces.
    set('muted-foreground', background && foreground ? mix(background, foreground, 0.68) : autoForeground(muted))
  }
  if (destructive) {
    set('destructive', destructive)
    set('destructive-foreground', autoForeground(destructive))
  }
  if (background) {
    set('background', background)
    set('card', background)
    set('popover', background)
    set('sidebar', shiftLightness(background, -0.015))
  }
  if (foreground) {
    set('foreground', foreground)
    set('card-foreground', foreground)
    set('popover-foreground', foreground)
    set('sidebar-foreground', foreground)
  }

  // Borders: a tint of the foreground over the background. Dividers stay quiet (about 14%).
  // Form controls need 3:1 against the page (WCAG 1.4.11), so their border is much stronger.
  if (background && foreground) {
    set('border', mix(background, foreground, 0.14))
    set('input', mix(background, foreground, 0.5))
    set('sidebar-border', mix(background, foreground, 0.14))
  } else if (secondary) {
    const quiet = formatOklch({ ...secondary, c: secondary.c * 0.3 })
    set('border', quiet)
    set('input', quiet)
    set('sidebar-border', quiet)
  }

  if (primary) {
    set('ring', shiftLightness(primary, 0.2))
    set('sidebar-primary', primary)
    set('sidebar-primary-foreground', autoForeground(primary))
    set('sidebar-ring', shiftLightness(primary, 0.2))
    // Chart colors: the primary hue turned by 0, 30, 60, 90 and 120 degrees, a little darker each step.
    for (let i = 0; i < 5; i++) {
      set(`chart-${i + 1}`, {
        l: clamp(primary.l - i * 0.05),
        c: primary.c < 0.05 ? 0.1 : primary.c,
        h: (primary.h + i * 30) % 360,
      })
    }
  }
  if (accent) {
    set('sidebar-accent', accent)
    set('sidebar-accent-foreground', autoForeground(accent))
  }

  return tokens
}

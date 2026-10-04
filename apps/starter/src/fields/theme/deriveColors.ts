import { useMode, modeOklch, modeRgb, parse, formatCss } from 'culori/fn'
import { hexToOklch } from '@/lib/themeUtils'

// Register only needed color spaces for minimal bundle
const toOklch = useMode(modeOklch)
useMode(modeRgb)

/**
 * Adjust the lightness of a hex color by a delta value.
 * Clamps the result between 0 and 1.
 */
function adjustLightness(hex: string, deltaL: number): string {
  const color = parse(hex)
  if (!color) return hex
  const oklch = toOklch(color)
  oklch.l = Math.max(0, Math.min(1, oklch.l + deltaL))
  return formatCss(oklch)
}

/**
 * Desaturate a hex color by multiplying its chroma by a factor (0-1).
 */
function desaturate(hex: string, factor: number): string {
  const color = parse(hex)
  if (!color) return hex
  const oklch = toOklch(color)
  oklch.c = (oklch.c || 0) * factor
  return formatCss(oklch)
}

/**
 * A color between `from` and `to` in OKLCH: `amount` 0 is `from`, 1 is `to`. Lightness and chroma
 * mix; the hue stays `from`'s when `from` has one, so tints keep the surface's warmth.
 */
function mix(from: string, to: string, amount: number): string | null {
  const a = parse(from)
  const b = parse(to)
  if (!a || !b) return null
  const x = toOklch(a)
  const y = toOklch(b)
  const hue = (x.c ?? 0) > 0.005 ? x.h : y.h
  return formatCss({
    mode: 'oklch',
    l: x.l + (y.l - x.l) * amount,
    c: (x.c ?? 0) + ((y.c ?? 0) - (x.c ?? 0)) * amount,
    h: hue,
  })
}

/**
 * Compute a foreground color (dark or light) based on the lightness of a background color.
 * Returns dark foreground for light backgrounds, light foreground for dark backgrounds.
 */
function autoForeground(hex: string): string {
  const color = parse(hex)
  if (!color) return 'oklch(0.145 0 0)'
  const oklch = toOklch(color)
  // 0.65, not 0.5: saturated mid-tone brand colors (indigo, blue) read better with light text.
  return oklch.l > 0.65 ? 'oklch(0.145 0 0)' : 'oklch(0.985 0 0)'
}

export type CoreColors = {
  primary?: string | null
  secondary?: string | null
  accent?: string | null
  muted?: string | null
  destructive?: string | null
  background?: string | null
  foreground?: string | null
}

/**
 * Derive all CSS variable values from a core set of hex colors.
 * Returns a Record where keys are CSS variable names WITHOUT the -- prefix
 * and values are oklch strings.
 */
export function deriveAllColors(core: CoreColors): Record<string, string> {
  const tokens: Record<string, string> = {}

  // Only derive if at least one core color is set
  const hasAnyColor = Object.values(core).some((v) => v != null && v !== '')
  if (!hasAnyColor) return tokens

  // Helper to safely convert, skipping null/undefined values
  const set = (key: string, value: string | null | undefined) => {
    if (value != null && value !== '') {
      tokens[key] = value
    }
  }

  // Direct conversions of core colors
  if (core.primary) {
    set('primary', hexToOklch(core.primary))
    set('primary-foreground', autoForeground(core.primary))
  }
  if (core.secondary) {
    set('secondary', hexToOklch(core.secondary))
    set('secondary-foreground', autoForeground(core.secondary))
  }
  if (core.accent) {
    set('accent', hexToOklch(core.accent))
    set('accent-foreground', autoForeground(core.accent))
  }
  if (core.muted) {
    set('muted', hexToOklch(core.muted))
    // Secondary text: about two thirds of the way from the background to the foreground, so it reads
    // as quieter text and still passes 4.5:1 on the background and on muted surfaces.
    const quiet = core.background && core.foreground ? mix(core.background, core.foreground, 0.68) : null
    set('muted-foreground', quiet ?? autoForeground(core.muted))
  }
  if (core.destructive) {
    set('destructive', hexToOklch(core.destructive))
    set('destructive-foreground', autoForeground(core.destructive))
  }
  if (core.background) {
    set('background', hexToOklch(core.background))
  }
  if (core.foreground) {
    set('foreground', hexToOklch(core.foreground))
  }

  // Derived from background: card, popover
  if (core.background) {
    set('card', hexToOklch(core.background))
    set('popover', hexToOklch(core.background))
  }
  if (core.foreground) {
    set('card-foreground', hexToOklch(core.foreground))
    set('popover-foreground', hexToOklch(core.foreground))
  }

  // Borders: a tint of the foreground over the background. Dividers stay quiet (about 14%).
  // Form controls need 3:1 against the page (WCAG 1.4.11), so their border is much stronger.
  if (core.background && core.foreground) {
    set('border', mix(core.background, core.foreground, 0.14))
    set('input', mix(core.background, core.foreground, 0.5))
  } else if (core.secondary) {
    const desaturated = desaturate(core.secondary, 0.3)
    set('border', desaturated)
    set('input', desaturated)
  }

  // Ring: primary with lightness shifted +0.2
  if (core.primary) {
    set('ring', adjustLightness(core.primary, 0.2))
  }

  // Sidebar variants
  if (core.background) {
    set('sidebar', adjustLightness(core.background, -0.015))
  }
  if (core.foreground) {
    set('sidebar-foreground', hexToOklch(core.foreground))
  }
  if (core.primary) {
    set('sidebar-primary', hexToOklch(core.primary))
    set('sidebar-primary-foreground', autoForeground(core.primary))
  }
  if (core.accent) {
    set('sidebar-accent', hexToOklch(core.accent))
    set('sidebar-accent-foreground', autoForeground(core.accent))
  }
  if (core.background && core.foreground) {
    set('sidebar-border', mix(core.background, core.foreground, 0.14))
  } else if (core.secondary) {
    set('sidebar-border', desaturate(core.secondary, 0.3))
  }
  if (core.primary) {
    set('sidebar-ring', adjustLightness(core.primary, 0.2))
  }

  // Chart colors: rotate primary hue by 0, 30, 60, 90, 120 degrees
  if (core.primary) {
    const lightnessOffsets = [0, -0.05, -0.1, -0.15, -0.2]
    for (let i = 0; i < 5; i++) {
      // Apply both hue rotation and lightness in one step
      const color = parse(core.primary)
      if (color) {
        const oklch = toOklch(color)
        oklch.h = ((oklch.h || 0) + i * 30) % 360
        oklch.l = Math.max(0, Math.min(1, oklch.l + lightnessOffsets[i]))
        // Ensure some chroma for chart colors to be visible
        if (oklch.c < 0.05) oklch.c = 0.1
        set(`chart-${i + 1}`, formatCss(oklch))
      }
    }
  }

  return tokens
}

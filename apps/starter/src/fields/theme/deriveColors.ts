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
 * Rotate the hue of a hex color by the given degrees.
 */
function rotateHue(hex: string, degrees: number): string {
  const color = parse(hex)
  if (!color) return hex
  const oklch = toOklch(color)
  oklch.h = ((oklch.h || 0) + degrees) % 360
  if (oklch.h < 0) oklch.h += 360
  return formatCss(oklch)
}

/**
 * Compute a foreground color (dark or light) based on the lightness of a background color.
 * Returns dark foreground for light backgrounds, light foreground for dark backgrounds.
 */
function autoForeground(hex: string): string {
  const color = parse(hex)
  if (!color) return 'oklch(0.145 0 0)'
  const oklch = toOklch(color)
  return oklch.l > 0.5 ? 'oklch(0.145 0 0)' : 'oklch(0.985 0 0)'
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
    set('muted-foreground', autoForeground(core.muted))
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

  // Derived from secondary: border, input (desaturated)
  if (core.secondary) {
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
  if (core.secondary) {
    set('sidebar-border', desaturate(core.secondary, 0.3))
  }
  if (core.primary) {
    set('sidebar-ring', adjustLightness(core.primary, 0.2))
  }

  // Chart colors: rotate primary hue by 0, 30, 60, 90, 120 degrees
  if (core.primary) {
    const lightnessOffsets = [0, -0.05, -0.1, -0.15, -0.2]
    for (let i = 0; i < 5; i++) {
      const rotated = rotateHue(core.primary, i * 30)
      const adjusted = adjustLightness(
        // Parse the oklch string back for lightness adjustment
        rotated.startsWith('oklch') ? core.primary : rotated,
        lightnessOffsets[i],
      )
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

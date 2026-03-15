import { useMode, modeOklch, modeRgb, parse, formatCss, converter } from 'culori/fn'

// Register only needed color spaces for minimal bundle
const toOklch = useMode(modeOklch)
useMode(modeRgb)

/**
 * Convert a hex color string to an oklch CSS string.
 * Falls back to the input hex if parsing fails.
 */
export function hexToOklch(hex: string): string {
  const color = parse(hex)
  if (!color) return hex
  const oklch = toOklch(color)
  return formatCss(oklch)
}

/**
 * Shape of the ThemeSettings global document as stored in Payload.
 */
export type ThemeData = {
  colors?: {
    primary?: string | null
    secondary?: string | null
    accent?: string | null
    muted?: string | null
    destructive?: string | null
    background?: string | null
    foreground?: string | null
  }
  fonts?: {
    sans?: string | null
    mono?: string | null
  }
  spacing?: {
    baseMultiplier?: number | null
  }
  borderRadius?: string | null
  derivedTokens?: Record<string, string> | null
}

/**
 * Build a flat Record of CSS variable names to values from a ThemeData object.
 * Only includes variables where the admin has set a value (skips null/undefined).
 */
export function buildCSSVariables(theme: ThemeData): Record<string, string> {
  const vars: Record<string, string> = {}

  // Derived color tokens (already in oklch format from afterChange hook)
  if (theme.derivedTokens) {
    for (const [key, value] of Object.entries(theme.derivedTokens)) {
      if (value != null) {
        vars[`--${key}`] = value
      }
    }
  }

  // Spacing scale from baseMultiplier
  if (theme.spacing?.baseMultiplier != null) {
    const base = theme.spacing.baseMultiplier
    const scale: Record<string, number> = {
      xs: base * 1,
      sm: base * 2,
      md: base * 4,
      lg: base * 6,
      xl: base * 8,
      '2xl': base * 12,
    }
    for (const [name, value] of Object.entries(scale)) {
      vars[`--spacing-${name}`] = `${value}px`
    }
  }

  // Border radius
  if (theme.borderRadius != null) {
    vars['--radius'] = `${theme.borderRadius}rem`
  }

  // Fonts
  if (theme.fonts?.sans) {
    vars['--font-sans'] = `'${theme.fonts.sans}', sans-serif`
  }
  if (theme.fonts?.mono) {
    vars['--font-mono'] = `'${theme.fonts.mono}', monospace`
  }

  return vars
}

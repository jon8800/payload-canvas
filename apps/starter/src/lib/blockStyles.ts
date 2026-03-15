import type { CSSProperties } from 'react'

// Maps spacing preset values to Tailwind spacing scale numbers
const spacingMap: Record<string, string> = {
  none: '0',
  xs: '1',
  sm: '2',
  md: '4',
  lg: '6',
  xl: '8',
  '2xl': '12',
}

// Direction prefix mapping for padding and margin
const directionPrefix = {
  padding: { top: 'pt', right: 'pr', bottom: 'pb', left: 'pl' },
  margin: { top: 'mt', right: 'mr', bottom: 'mb', left: 'ml' },
} as const

const breakpoints = ['sm', 'md', 'lg', 'xl'] as const

// Resolve spacing classes for padding or margin
function resolveSpacing(
  type: 'padding' | 'margin',
  data: Record<string, any> | undefined,
): string[] {
  if (!data) return []
  const classes: string[] = []
  const prefixes = directionPrefix[type]

  for (const [dir, prefix] of Object.entries(prefixes)) {
    const dirData = data[dir]
    if (!dirData) continue

    // Base value
    const baseVal = dirData.base
    if (baseVal && baseVal !== 'none') {
      if (baseVal === 'custom') {
        const num = dirData.custom
        if (num != null) classes.push(`${prefix}-[${num}px]`)
      } else {
        const tw = spacingMap[baseVal]
        if (tw) classes.push(`${prefix}-${tw}`)
      }
    }

    // Responsive overrides
    for (const bp of breakpoints) {
      const bpVal = dirData[bp]
      if (bpVal && bpVal !== 'none') {
        if (bpVal === 'custom') {
          // Responsive custom values not supported (no per-bp custom field)
          continue
        }
        const tw = spacingMap[bpVal]
        if (tw) classes.push(`${bp}:${prefix}-${tw}`)
      }
    }
  }
  return classes
}

// Border radius mapping
const borderRadiusMap: Record<string, string> = {
  none: 'none',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
  full: 'full',
}

function resolveBorderRadius(data: Record<string, any> | undefined): string[] {
  if (!data) return []
  const classes: string[] = []

  const baseVal = data.base
  if (baseVal && baseVal !== 'none') {
    if (baseVal === 'custom') {
      const num = data.custom
      if (num != null) classes.push(`rounded-[${num}px]`)
    } else {
      const tw = borderRadiusMap[baseVal]
      if (tw) classes.push(`rounded-${tw}`)
    }
  }

  for (const bp of breakpoints) {
    const bpVal = data[bp]
    if (bpVal && bpVal !== 'none' && bpVal !== 'custom') {
      const tw = borderRadiusMap[bpVal]
      if (tw) classes.push(`${bp}:rounded-${tw}`)
    }
  }

  return classes
}

// Border width mapping
function resolveBorderWidth(data: Record<string, any> | undefined): string[] {
  if (!data) return []
  const classes: string[] = []

  const baseVal = data.base
  if (baseVal && baseVal !== 'none') {
    if (baseVal === 'custom') {
      const num = data.custom
      if (num != null) classes.push(`border-[${num}px]`)
    } else if (baseVal === '1') {
      classes.push('border')
    } else {
      classes.push(`border-${baseVal}`)
    }
  }

  for (const bp of breakpoints) {
    const bpVal = data[bp]
    if (bpVal && bpVal !== 'none' && bpVal !== 'custom') {
      if (bpVal === '1') {
        classes.push(`${bp}:border`)
      } else {
        classes.push(`${bp}:border-${bpVal}`)
      }
    }
  }

  return classes
}

// Text size mapping
function resolveTextSize(data: Record<string, any> | undefined): string[] {
  if (!data) return []
  const classes: string[] = []

  const baseVal = data.base
  if (baseVal) {
    if (baseVal === 'custom') {
      const custom = data.custom
      if (custom) classes.push(`text-${custom}`)
    } else {
      classes.push(`text-${baseVal}`)
    }
  }

  for (const bp of breakpoints) {
    const bpVal = data[bp]
    if (bpVal && bpVal !== 'custom') {
      classes.push(`${bp}:text-${bpVal}`)
    }
  }

  return classes
}

// Color mapping (background and text)
function resolveColor(
  prefix: 'bg' | 'text',
  data: Record<string, any> | undefined,
): { classes: string[]; style?: CSSProperties } {
  if (!data) return { classes: [] }
  const classes: string[] = []
  let style: CSSProperties | undefined

  const preset = data.preset
  if (preset && preset !== 'none') {
    if (preset === 'custom') {
      const custom = data.custom
      if (custom) {
        style = prefix === 'bg'
          ? { backgroundColor: custom }
          : { color: custom }
      }
    } else {
      classes.push(`${prefix}-${preset}`)
    }
  }

  // Responsive overrides for presets only
  for (const bp of breakpoints) {
    const bpVal = data[bp]
    if (bpVal && bpVal !== 'none' && bpVal !== 'custom') {
      classes.push(`${bp}:${prefix}-${bpVal}`)
    }
  }

  return { classes, style }
}

// Parse inline CSS string into React CSSProperties
// e.g. "max-width: 600px; opacity: 0.5" -> { maxWidth: '600px', opacity: '0.5' }
export function parseInlineCSS(css: string): CSSProperties {
  const result: Record<string, string> = {}

  const declarations = css.split(';').filter((d) => d.trim())
  for (const declaration of declarations) {
    const colonIndex = declaration.indexOf(':')
    if (colonIndex === -1) continue

    const prop = declaration.slice(0, colonIndex).trim()
    const value = declaration.slice(colonIndex + 1).trim()
    if (!prop || !value) continue

    // Convert kebab-case to camelCase
    const camelProp = prop.replace(/-([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    )
    result[camelProp] = value
  }

  return result as CSSProperties
}

// Main function: takes block style data and returns className + optional style
export function getBlockStyles(styles: Record<string, any> | undefined): {
  className: string
  style?: CSSProperties
} {
  if (!styles) return { className: '' }

  const classes: string[] = []
  const inlineStyles: CSSProperties[] = []

  // Spacing
  classes.push(...resolveSpacing('padding', styles.padding))
  classes.push(...resolveSpacing('margin', styles.margin))

  // Border radius
  classes.push(...resolveBorderRadius(styles.borderRadius))

  // Border width
  classes.push(...resolveBorderWidth(styles.borderWidth))

  // Text size
  classes.push(...resolveTextSize(styles.textSize))

  // Background color
  const bg = resolveColor('bg', styles.backgroundColor)
  classes.push(...bg.classes)
  if (bg.style) inlineStyles.push(bg.style)

  // Text color
  const tc = resolveColor('text', styles.textColor)
  classes.push(...tc.classes)
  if (tc.style) inlineStyles.push(tc.style)

  // Custom CSS classes
  if (styles.customCSS?.classes) {
    classes.push(styles.customCSS.classes)
  }

  // Inline CSS
  let style: CSSProperties | undefined
  if (inlineStyles.length > 0 || styles.customCSS?.inlineCSS) {
    style = Object.assign(
      {},
      ...inlineStyles,
      styles.customCSS?.inlineCSS
        ? parseInlineCSS(styles.customCSS.inlineCSS)
        : {},
    )
  }

  return {
    className: classes.join(' '),
    style: style && Object.keys(style).length > 0 ? style : undefined,
  }
}

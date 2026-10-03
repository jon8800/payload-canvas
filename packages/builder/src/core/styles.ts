// Tailwind class model for the Styles panel. Pure: no React, no DOM, no Tailwind runtime.
// It reads and writes ONE block's className, per style property and per variant
// (breakpoint + state), so visual controls and raw classes edit the same data.
// Owner: styles-model agent. The exported names and shapes below are the contract.

/** Responsive prefix. "base" means no prefix. Must match the theme's breakpoints. */
export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

/** Interaction prefix. "default" means no prefix. */
export type StyleState = 'default' | 'hover' | 'focus' | 'active'

export type Variant = { breakpoint: Breakpoint; state: StyleState }

export const BASE_VARIANT: Variant = { breakpoint: 'base', state: 'default' }

export type StyleGroup =
  | 'layout'
  | 'spacing'
  | 'size'
  | 'typography'
  | 'background'
  | 'border'
  | 'effects'
  | 'position'

/**
 * How a property's value is chosen in the UI:
 * - "enum": fixed options (display: block/flex/grid/hidden …)
 * - "spacing": the spacing scale (StyleTokens.spacing) or an arbitrary length
 * - "color": a theme color name (StyleTokens.colors) or an arbitrary color, optional /opacity
 * - "token": a named theme value from one StyleTokens list (see `tokens`) or an arbitrary value
 * - "number": a plain number (z-index, opacity, grid columns, order …)
 */
export type StyleValueKind = 'enum' | 'spacing' | 'color' | 'token' | 'number'

export type StylePropertyDef = {
  /** Stable id, e.g. "padding-top", "display", "font-size", "background-color", "radius-tl". */
  id: string
  label: string
  group: StyleGroup
  kind: StyleValueKind
  /** For kind "enum": the allowed values (the utility suffix or the full utility). */
  options?: Array<{ value: string; label: string }>
  /** For kind "token": which StyleTokens list supplies values, e.g. "fontSizes", "radius". */
  tokens?: 'fontSizes' | 'fontWeights' | 'fonts' | 'leading' | 'tracking' | 'radius' | 'shadows' | 'containers'
  /** True when a negative value is allowed (margins, inset, translate …). */
  negative?: boolean
}

/** Every property the Styles panel can edit, in display order. */
export const STYLE_PROPERTIES: StylePropertyDef[] = []

/** One class split into its parts. `property` is null for classes the model does not manage. */
export type ParsedClass = {
  raw: string
  /** Variant prefixes in order, e.g. ["md", "hover"]. Unknown prefixes (dark:, group-hover:) stay here too. */
  variants: string[]
  /** Utility without variants or "!" / "-", e.g. "pt-4", "bg-primary/50". */
  utility: string
  important: boolean
  negative: boolean
  property: string | null
  /** The value part, e.g. "4", "primary/50", "[37px]", "flex". */
  value: string | null
}

export type StyleValue = {
  /** Value as the UI shows it: scale key, token name, color name, enum value, or "[arbitrary]". */
  value: string
  negative: boolean
  /** The class that set it. */
  className: string
  /**
   * Where the value comes from:
   * - "set": a class for exactly this property and variant
   * - "shorthand": inherited from a shorthand at the same variant (pt from py- or p-)
   * - "inherited": from a smaller breakpoint or the default state (shown dimmed in the UI)
   */
  source: 'set' | 'shorthand' | 'inherited'
}

const NI = (): never => {
  throw new Error('not implemented')
}

export function parseClassName(className: string): ParsedClass[] {
  void className
  return NI()
}

/** The value of one property at one variant, following Tailwind's cascade, or null if unset. */
export function getStyleValue(className: string, property: string, variant: Variant): StyleValue | null {
  void className
  void property
  void variant
  return NI()
}

/**
 * Sets (or with `value: null` removes) one property at one variant and returns the new className.
 * Keeps every unrelated class and the original class order where possible. Setting a side
 * (padding-top) while a shorthand exists (p-4) keeps the shorthand; setting the shorthand
 * removes the side classes at that variant.
 */
export function setStyleValue(
  className: string,
  property: string,
  variant: Variant,
  value: string | null,
  options?: { negative?: boolean },
): string {
  void className
  void property
  void variant
  void value
  void options
  return NI()
}

/** Classes the model does not manage (shown as raw classes under the controls). */
export function unmanagedClasses(className: string): string[] {
  void className
  return NI()
}

/** Variants (other than base/default) that have at least one managed class, for "has overrides" dots. */
export function variantsInUse(className: string): Variant[] {
  void className
  return NI()
}

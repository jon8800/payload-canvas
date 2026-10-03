// Types and constants for the Tailwind class model. See ../styles.ts for the public API.
import type { StyleTokens } from '../types'

/** Responsive prefix. "base" means no prefix. Must match the theme's breakpoints. */
export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

/** Interaction prefix. "default" means no prefix. */
export type StyleState = 'default' | 'hover' | 'focus' | 'active'

export type Variant = { breakpoint: Breakpoint; state: StyleState }

export const BASE_VARIANT: Variant = { breakpoint: 'base', state: 'default' }

/** Breakpoints in mobile-first order. A value set at one breakpoint applies to every larger one. */
export const BREAKPOINTS: readonly Breakpoint[] = ['base', 'sm', 'md', 'lg', 'xl', '2xl']

/** States. hover/focus/active inherit from "default", never from each other. */
export const STATES: readonly StyleState[] = ['default', 'hover', 'focus', 'active']

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
  /**
   * For kind "enum": the allowed values. `value` is what getStyleValue returns and setStyleValue
   * accepts: the utility suffix after the property's prefix ("center" for justify-center), or the
   * full utility when the property has no prefix ("flex", "uppercase", "italic").
   */
  options?: Array<{ value: string; label: string }>
  /** For kind "token": which StyleTokens list supplies values, e.g. "fontSizes", "radius". */
  tokens?: 'fontSizes' | 'fontWeights' | 'fonts' | 'leading' | 'tracking' | 'radius' | 'shadows' | 'containers'
  /** True when a negative value is allowed (margins, inset, translate …). */
  negative?: boolean
}

/** One class split into its parts. `property` is null for classes the model does not manage. */
export type ParsedClass = {
  raw: string
  /** Variant prefixes in order, e.g. ["md", "hover"]. Unknown prefixes (dark:, group-hover:) stay here too. */
  variants: string[]
  /** Utility without variants or "!" / "-", e.g. "pt-4", "bg-primary/50". */
  utility: string
  important: boolean
  negative: boolean
  /**
   * The property the utility sets, or null when no property matches. This is set even when a
   * variant is unknown (`dark:pt-4` → "padding-top"); such classes still count as unmanaged.
   * It can be a hidden shorthand id (see HIDDEN_STYLE_PROPERTIES), e.g. "radius-t" for rounded-t-lg.
   */
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
  /** True when the class has "!" (important). */
  important: boolean
  /** The variant of the class that set the value. */
  variant: Variant
}

/**
 * Optional theme tokens. They resolve names Tailwind's defaults cannot: a custom font size
 * `text-display`, a custom weight `font-heavy`, a custom shadow `shadow-card`, a theme color
 * `shadow-brand`. Without them, unknown `text-*` names count as colors, unknown `font-*` names
 * as families, and unknown `shadow-*` names as shadows.
 */
export type StyleTokenHints = Partial<StyleTokens>

// Reads and writes one property at one variant, following Tailwind's cascade.
import { getSpec, optionUtility, resolveUtility, shorthandChain, shorthandSides } from './properties'
import { type ParsedStyleClass, parseClasses, sameVariant, variantPrefix } from './parse'
import { BREAKPOINTS, STATES, type StyleTokenHints, type StyleValue, type Variant } from './types'

/**
 * Variants to check for a value, most specific first. A state beats a breakpoint (its selector is
 * more specific), so lg+hover checks lg:hover, md:hover, sm:hover, hover, then lg, md, sm, base.
 */
function cascade(variant: Variant): Variant[] {
  const breakpoints = BREAKPOINTS.slice(0, BREAKPOINTS.indexOf(variant.breakpoint) + 1).toReversed()
  const states = variant.state === 'default' ? (['default'] as const) : [variant.state, 'default' as const]
  return states.flatMap((state) => breakpoints.map((breakpoint) => ({ breakpoint, state })))
}

/** The value of one property at one variant, following Tailwind's cascade, or null if unset. */
export function getStyleValue(
  className: string,
  property: string,
  variant: Variant,
  tokens: StyleTokenHints = {},
): StyleValue | null {
  const classes = parseClasses(className, tokens)
  const chain = shorthandChain(property)
  // Important classes win over everything else, so look at them first.
  for (const important of [true, false]) {
    for (const candidate of cascade(variant)) {
      for (const id of chain) {
        const match = classes.findLast(
          (item) =>
            item.property === id &&
            item.important === important &&
            item.variant !== null &&
            sameVariant(item.variant, candidate),
        )
        if (!match || match.value === null) continue
        let source: StyleValue['source'] = 'inherited'
        if (sameVariant(candidate, variant)) source = id === property ? 'set' : 'shorthand'
        return {
          value: match.value,
          negative: match.negative,
          className: match.raw,
          source,
          important,
          variant: candidate,
        }
      }
    }
  }
  return null
}

function normalizeValue(value: string): { value: string; negative: boolean } {
  const trimmed = value.trim()
  if (trimmed.startsWith('[')) return { value: trimmed.replaceAll(/\s+/g, '_'), negative: false }
  if (trimmed.startsWith('-')) return { value: trimmed.slice(1), negative: true }
  return { value: trimmed, negative: false }
}

/**
 * The class for one property, variant and value, e.g. ("padding-top", md+hover, "4") → "md:hover:pt-4".
 * Throws when the property is unknown or the value would produce a class for another property.
 */
export function styleClass(
  property: string,
  variant: Variant,
  value: string,
  options: { negative?: boolean; important?: boolean; tokens?: StyleTokenHints } = {},
): string {
  const spec = getSpec(property)
  if (!spec) throw new Error(`Unknown style property "${property}"`)
  const normalized = normalizeValue(value)
  const negative = Boolean(options.negative) || normalized.negative
  if (negative && !spec.negative) throw new Error(`"${property}" does not allow negative values`)
  const option = spec.options?.find((item) => item.value === normalized.value)
  let utility: string
  if (spec.bare !== undefined && spec.prefix && normalized.value === spec.bare) utility = spec.prefix
  else if (option) utility = optionUtility(spec, option.value)
  else if (spec.prefix) utility = `${spec.prefix}-${normalized.value}`
  else throw new Error(`"${value}" is not an option of "${property}"`)
  const resolved = resolveUtility(utility, negative, options.tokens ?? {})
  if (resolved?.spec.id !== property) {
    throw new Error(`"${value}" is not a valid value for "${property}" (class "${utility}")`)
  }
  return `${variantPrefix(variant)}${negative ? '-' : ''}${utility}${options.important ? '!' : ''}`
}

/**
 * Sets (or with `value: null` removes) one property at one variant and returns the new className.
 * Keeps every unrelated class and the original class order where possible. Setting a side
 * (padding-top) while a shorthand exists (p-4) keeps the shorthand; setting the shorthand
 * removes the side classes at that variant.
 *
 * - An empty string removes, like null.
 * - "-4" or `negative: true` writes a negative class (-mt-4). Arbitrary values "[…]" are written
 *   as given, with spaces turned into "_".
 * - The class is replaced in place. A new shorthand takes the place of the first side it removes.
 *   Any other new class goes at the end. Duplicates for the same property
 *   and variant are removed. A replaced important class stays important unless `important` is given.
 * - Classes with unknown variants (dark:, group-hover:) are never touched.
 */
export function setStyleValue(
  className: string,
  property: string,
  variant: Variant,
  value: string | null,
  options: { negative?: boolean; important?: boolean; tokens?: StyleTokenHints } = {},
): string {
  if (!getSpec(property)) throw new Error(`Unknown style property "${property}"`)
  const classes = parseClasses(className, options.tokens)
  const atVariant = (item: ParsedStyleClass): boolean => item.variant !== null && sameVariant(item.variant, variant)
  const existing = classes.filter((item) => atVariant(item) && item.property === property)
  const isRemove = value === null || value.trim() === ''
  const next = isRemove
    ? null
    : styleClass(property, variant, value, {
        ...options,
        important: options.important ?? existing.some((item) => item.important),
      })
  const sides = isRemove ? new Set<string>() : shorthandSides(property)
  const output: string[] = []
  let placed = false
  for (const item of classes) {
    if (atVariant(item) && item.property === property) {
      if (next && !placed) output.push(next)
      placed = true
      continue
    }
    if (atVariant(item) && item.property && sides.has(item.property)) {
      // A shorthand takes the place of the first side class it replaces.
      if (next && !placed && !existing.length) {
        output.push(next)
        placed = true
      }
      continue
    }
    if (item.raw === next) continue
    output.push(item.raw)
  }
  if (next && !placed) output.push(next)
  return output.join(' ')
}

function isHidden(id: string): boolean {
  return Boolean(getSpec(id)?.hidden)
}

/**
 * Classes the model does not manage (shown as raw classes under the controls): no matching
 * property, an unknown variant (dark:pt-4), or a hidden shorthand (rounded-t-lg, size-4).
 */
export function unmanagedClasses(className: string, tokens: StyleTokenHints = {}): string[] {
  return parseClasses(className, tokens)
    .filter((item) => item.property === null || item.variant === null || isHidden(item.property))
    .map((item) => item.raw)
}

function variantRank(variant: Variant): number {
  return BREAKPOINTS.indexOf(variant.breakpoint) * STATES.length + STATES.indexOf(variant.state)
}

/**
 * Variants (other than base/default) that have at least one managed class, for "has overrides"
 * dots. Hidden shorthands count, because they change the values the panel shows. Sorted by
 * breakpoint, then state.
 */
export function variantsInUse(className: string, tokens: StyleTokenHints = {}): Variant[] {
  const found: Variant[] = []
  for (const item of parseClasses(className, tokens)) {
    const variant = item.variant
    if (!item.property || !variant) continue
    if (variant.breakpoint === 'base' && variant.state === 'default') continue
    if (!found.some((other) => sameVariant(other, variant))) found.push(variant)
  }
  return found.toSorted((a, b) => variantRank(a) - variantRank(b))
}

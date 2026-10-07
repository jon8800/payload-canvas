// The property table: every style property, the utilities that set it, and its shorthands.
import type { StyleGroup, StylePropertyDef, StyleTokenHints, StyleValueKind } from './types'
import {
  type Accept,
  anyValue,
  isAspectValue,
  isBackgroundColor,
  isBorderColor,
  isBorderWidth,
  isCursorValue,
  isFlexValue,
  isFontFamily,
  isFontSize,
  isFontWeight,
  isGradientAngle,
  isGradientStop,
  isInset,
  isLegacyGradient,
  isRadius,
  isShadow,
  isSpaceValue,
  isTextColor,
} from './values'

export type PropertySpec = StylePropertyDef & {
  /** Utilities are `${prefix}-${value}`; for enums the option values follow the prefix. */
  prefix?: string
  /** Values accepted after the prefix. Non-enum kinds default to any value. Enums: extra values beyond the options. */
  accept?: Accept
  /** Extra prefixes that are read but never written (legacy names). */
  aliases?: Array<{ prefix: string; accept: Accept }>
  /** Value of the bare prefix utility: `border` → "1", `rounded` → "DEFAULT". */
  bare?: string
  /** Shorthand properties that also set this one, nearest first: padding-top → ["padding-y"]. */
  parents?: string[]
  /** No panel control. Read as a shorthand; shown with the raw classes. */
  hidden?: boolean
}

type Option = string | [value: string, label: string]

function title(value: string): string {
  const text = value.replaceAll('-', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function options(...values: Option[]): StylePropertyDef['options'] {
  return values.map((option) =>
    typeof option === 'string' ? { value: option, label: title(option) } : { value: option[0], label: option[1] },
  )
}

type SpecInput = Omit<PropertySpec, 'group'>

function group(name: StyleGroup, specs: SpecInput[]): PropertySpec[] {
  return specs.map((spec) => ({ ...spec, group: name }))
}

function prop(id: string, label: string, kind: StyleValueKind, prefix: string, extra: Partial<SpecInput> = {}): SpecInput {
  return { id, label, kind, prefix, ...extra }
}

const SPECS: PropertySpec[] = [
  ...group('layout', [
    {
      id: 'display',
      label: 'Display',
      kind: 'enum',
      options: options(
        'block',
        'inline-block',
        'inline',
        'flex',
        'inline-flex',
        'grid',
        'inline-grid',
        'contents',
        ['hidden', 'None'],
      ),
    },
    prop('flex-direction', 'Direction', 'enum', 'flex', {
      options: options('row', ['row-reverse', 'Row reverse'], ['col', 'Column'], ['col-reverse', 'Column reverse']),
    }),
    prop('flex-wrap', 'Wrap', 'enum', 'flex', { options: options('wrap', 'wrap-reverse', ['nowrap', 'No wrap']) }),
    prop('justify-content', 'Justify', 'enum', 'justify', {
      options: options('start', 'center', 'end', ['between', 'Space between'], ['around', 'Space around'], ['evenly', 'Space evenly'], 'stretch', 'normal'),
    }),
    prop('align-items', 'Align items', 'enum', 'items', {
      options: options('start', 'center', 'end', 'baseline', 'stretch'),
    }),
    prop('align-content', 'Align content', 'enum', 'content', {
      options: options('start', 'center', 'end', ['between', 'Space between'], ['around', 'Space around'], ['evenly', 'Space evenly'], 'stretch', 'baseline', 'normal'),
    }),
    prop('align-self', 'Align self', 'enum', 'self', {
      options: options('auto', 'start', 'center', 'end', 'stretch', 'baseline'),
    }),
    prop('gap', 'Gap', 'spacing', 'gap'),
    prop('gap-x', 'Column gap', 'spacing', 'gap-x', { parents: ['gap'] }),
    prop('gap-y', 'Row gap', 'spacing', 'gap-y', { parents: ['gap'] }),
    prop('grid-cols', 'Grid columns', 'number', 'grid-cols'),
    prop('grid-rows', 'Grid rows', 'number', 'grid-rows'),
    prop('col-span', 'Column span', 'number', 'col-span'),
    prop('row-span', 'Row span', 'number', 'row-span'),
    prop('flex', 'Flex', 'enum', 'flex', {
      options: options(['1', 'Fill (1)'], 'auto', 'initial', 'none'),
      accept: isFlexValue,
    }),
    prop('grow', 'Grow', 'number', 'grow', { bare: '1' }),
    prop('shrink', 'Shrink', 'number', 'shrink', { bare: '1' }),
    prop('basis', 'Basis', 'spacing', 'basis'),
    prop('order', 'Order', 'number', 'order', { negative: true }),
    prop('overflow', 'Overflow', 'enum', 'overflow', { options: options('visible', 'hidden', 'clip', 'scroll', 'auto') }),
    prop('overflow-x', 'Overflow X', 'enum', 'overflow-x', {
      options: options('visible', 'hidden', 'clip', 'scroll', 'auto'),
      parents: ['overflow'],
    }),
    prop('overflow-y', 'Overflow Y', 'enum', 'overflow-y', {
      options: options('visible', 'hidden', 'clip', 'scroll', 'auto'),
      parents: ['overflow'],
    }),
  ]),
  ...group('spacing', [
    prop('padding', 'Padding', 'spacing', 'p'),
    prop('padding-x', 'Padding X', 'spacing', 'px', { parents: ['padding'] }),
    prop('padding-y', 'Padding Y', 'spacing', 'py', { parents: ['padding'] }),
    prop('padding-top', 'Padding top', 'spacing', 'pt', { parents: ['padding-y'] }),
    prop('padding-right', 'Padding right', 'spacing', 'pr', { parents: ['padding-x'] }),
    prop('padding-bottom', 'Padding bottom', 'spacing', 'pb', { parents: ['padding-y'] }),
    prop('padding-left', 'Padding left', 'spacing', 'pl', { parents: ['padding-x'] }),
    prop('margin', 'Margin', 'spacing', 'm', { negative: true }),
    prop('margin-x', 'Margin X', 'spacing', 'mx', { negative: true, parents: ['margin'] }),
    prop('margin-y', 'Margin Y', 'spacing', 'my', { negative: true, parents: ['margin'] }),
    prop('margin-top', 'Margin top', 'spacing', 'mt', { negative: true, parents: ['margin-y'] }),
    prop('margin-right', 'Margin right', 'spacing', 'mr', { negative: true, parents: ['margin-x'] }),
    prop('margin-bottom', 'Margin bottom', 'spacing', 'mb', { negative: true, parents: ['margin-y'] }),
    prop('margin-left', 'Margin left', 'spacing', 'ml', { negative: true, parents: ['margin-x'] }),
    prop('space-x', 'Space between X', 'spacing', 'space-x', { negative: true, accept: isSpaceValue }),
    prop('space-y', 'Space between Y', 'spacing', 'space-y', { negative: true, accept: isSpaceValue }),
  ]),
  ...group('size', [
    prop('width', 'Width', 'spacing', 'w', { parents: ['size'] }),
    prop('height', 'Height', 'spacing', 'h', { parents: ['size'] }),
    prop('min-width', 'Min width', 'spacing', 'min-w'),
    prop('max-width', 'Max width', 'token', 'max-w', { tokens: 'containers' }),
    prop('min-height', 'Min height', 'spacing', 'min-h'),
    prop('max-height', 'Max height', 'spacing', 'max-h'),
    prop('aspect-ratio', 'Aspect ratio', 'enum', 'aspect', {
      options: options('auto', ['square', 'Square (1/1)'], ['video', 'Video (16/9)']),
      accept: isAspectValue,
    }),
    prop('object-fit', 'Object fit', 'enum', 'object', { options: options('contain', 'cover', 'fill', 'none', 'scale-down') }),
    prop('size', 'Size (width and height)', 'spacing', 'size', { hidden: true }),
  ]),
  ...group('typography', [
    prop('font-family', 'Font', 'token', 'font', { tokens: 'fonts', accept: isFontFamily }),
    prop('font-size', 'Size', 'token', 'text', { tokens: 'fontSizes', accept: isFontSize }),
    prop('font-weight', 'Weight', 'token', 'font', { tokens: 'fontWeights', accept: isFontWeight }),
    prop('line-height', 'Line height', 'token', 'leading', { tokens: 'leading' }),
    prop('letter-spacing', 'Letter spacing', 'token', 'tracking', { tokens: 'tracking' }),
    prop('text-color', 'Color', 'color', 'text', { accept: isTextColor }),
    prop('text-align', 'Align', 'enum', 'text', { options: options('left', 'center', 'right', 'justify', 'start', 'end') }),
    {
      id: 'text-transform',
      label: 'Transform',
      kind: 'enum',
      options: options('uppercase', 'lowercase', 'capitalize', ['normal-case', 'None']),
    },
    {
      id: 'text-decoration',
      label: 'Decoration',
      kind: 'enum',
      options: options('underline', 'overline', 'line-through', ['no-underline', 'None']),
    },
    { id: 'font-style', label: 'Style', kind: 'enum', options: options('italic', ['not-italic', 'Normal']) },
    prop('white-space', 'White space', 'enum', 'whitespace', {
      options: options('normal', ['nowrap', 'No wrap'], 'pre', 'pre-line', 'pre-wrap', 'break-spaces'),
    }),
    prop('text-wrap', 'Text wrap', 'enum', 'text', { options: options('wrap', ['nowrap', 'No wrap'], 'balance', 'pretty') }),
  ]),
  ...group('background', [
    prop('background-color', 'Background', 'color', 'bg', { accept: isBackgroundColor }),
    prop('gradient-direction', 'Gradient direction', 'enum', 'bg-linear', {
      options: options(['to-t', 'To top'], ['to-tr', 'To top right'], ['to-r', 'To right'], ['to-br', 'To bottom right'], ['to-b', 'To bottom'], ['to-bl', 'To bottom left'], ['to-l', 'To left'], ['to-tl', 'To top left']),
      accept: isGradientAngle,
      aliases: [{ prefix: 'bg-gradient', accept: isLegacyGradient }],
    }),
    prop('gradient-from', 'Gradient from', 'color', 'from', { accept: isGradientStop }),
    prop('gradient-via', 'Gradient via', 'color', 'via', { accept: isGradientStop }),
    prop('gradient-to', 'Gradient to', 'color', 'to', { accept: isGradientStop }),
  ]),
  ...group('border', [
    prop('radius', 'Radius', 'token', 'rounded', { tokens: 'radius', bare: 'DEFAULT', accept: isRadius }),
    prop('radius-tl', 'Radius top left', 'token', 'rounded-tl', { tokens: 'radius', bare: 'DEFAULT', parents: ['radius-t', 'radius-l'] }),
    prop('radius-tr', 'Radius top right', 'token', 'rounded-tr', { tokens: 'radius', bare: 'DEFAULT', parents: ['radius-t', 'radius-r'] }),
    prop('radius-br', 'Radius bottom right', 'token', 'rounded-br', { tokens: 'radius', bare: 'DEFAULT', parents: ['radius-b', 'radius-r'] }),
    prop('radius-bl', 'Radius bottom left', 'token', 'rounded-bl', { tokens: 'radius', bare: 'DEFAULT', parents: ['radius-b', 'radius-l'] }),
    prop('border-width', 'Border width', 'number', 'border', { bare: '1', accept: isBorderWidth }),
    prop('border-width-top', 'Border top', 'number', 'border-t', { bare: '1', accept: isBorderWidth, parents: ['border-width-y'] }),
    prop('border-width-right', 'Border right', 'number', 'border-r', { bare: '1', accept: isBorderWidth, parents: ['border-width-x'] }),
    prop('border-width-bottom', 'Border bottom', 'number', 'border-b', { bare: '1', accept: isBorderWidth, parents: ['border-width-y'] }),
    prop('border-width-left', 'Border left', 'number', 'border-l', { bare: '1', accept: isBorderWidth, parents: ['border-width-x'] }),
    prop('border-style', 'Border style', 'enum', 'border', { options: options('solid', 'dashed', 'dotted', 'double', 'hidden', 'none') }),
    prop('border-color', 'Border color', 'color', 'border', { accept: isBorderColor }),
    prop('radius-t', 'Radius top', 'token', 'rounded-t', { tokens: 'radius', bare: 'DEFAULT', parents: ['radius'], hidden: true }),
    prop('radius-r', 'Radius right', 'token', 'rounded-r', { tokens: 'radius', bare: 'DEFAULT', parents: ['radius'], hidden: true }),
    prop('radius-b', 'Radius bottom', 'token', 'rounded-b', { tokens: 'radius', bare: 'DEFAULT', parents: ['radius'], hidden: true }),
    prop('radius-l', 'Radius left', 'token', 'rounded-l', { tokens: 'radius', bare: 'DEFAULT', parents: ['radius'], hidden: true }),
    prop('border-width-x', 'Border X', 'number', 'border-x', { bare: '1', accept: isBorderWidth, parents: ['border-width'], hidden: true }),
    prop('border-width-y', 'Border Y', 'number', 'border-y', { bare: '1', accept: isBorderWidth, parents: ['border-width'], hidden: true }),
  ]),
  ...group('effects', [
    prop('opacity', 'Opacity', 'number', 'opacity'),
    prop('shadow', 'Shadow', 'token', 'shadow', { tokens: 'shadows', bare: 'DEFAULT', accept: isShadow }),
    prop('cursor', 'Cursor', 'enum', 'cursor', {
      options: options('auto', 'default', 'pointer', 'wait', 'text', 'move', 'help', 'not-allowed', 'none', 'grab', 'grabbing'),
      accept: isCursorValue,
    }),
  ]),
  ...group('position', [
    {
      id: 'position',
      label: 'Position',
      kind: 'enum',
      options: options('static', 'relative', 'absolute', 'fixed', 'sticky'),
    },
    prop('inset', 'Inset', 'spacing', 'inset', { negative: true, accept: isInset }),
    prop('top', 'Top', 'spacing', 'top', { negative: true, parents: ['inset-y'] }),
    prop('right', 'Right', 'spacing', 'right', { negative: true, parents: ['inset-x'] }),
    prop('bottom', 'Bottom', 'spacing', 'bottom', { negative: true, parents: ['inset-y'] }),
    prop('left', 'Left', 'spacing', 'left', { negative: true, parents: ['inset-x'] }),
    prop('z-index', 'Z-index', 'number', 'z', { negative: true }),
    prop('inset-x', 'Inset X', 'spacing', 'inset-x', { negative: true, parents: ['inset'], hidden: true }),
    prop('inset-y', 'Inset Y', 'spacing', 'inset-y', { negative: true, parents: ['inset'], hidden: true }),
  ]),
]


function toDef(spec: PropertySpec): StylePropertyDef {
  const def: StylePropertyDef = { id: spec.id, label: spec.label, group: spec.group, kind: spec.kind }
  if (spec.options) def.options = spec.options
  if (spec.tokens) def.tokens = spec.tokens
  if (spec.negative) def.negative = true
  return def
}

/** Every property the Styles panel can edit, in display order. */
export const STYLE_PROPERTIES: StylePropertyDef[] = SPECS.filter((spec) => !spec.hidden).map(toDef)

/**
 * Shorthands with no panel control: rounded-t/r/b/l, border-x/y, inset-x/y, size-*. getStyleValue
 * reads them as shorthands of the sides, and setStyleValue accepts their ids too. Their classes
 * are listed by unmanagedClasses so the user can see and remove them.
 */
export const HIDDEN_STYLE_PROPERTIES: StylePropertyDef[] = SPECS.filter((spec) => spec.hidden).map(toDef)

const SPEC_BY_ID = new Map(SPECS.map((spec) => [spec.id, spec]))

export function getSpec(id: string): PropertySpec | undefined {
  return SPEC_BY_ID.get(id)
}

/** The definition of a property id, visible or hidden. */
export function getStyleProperty(id: string): StylePropertyDef | undefined {
  const spec = SPEC_BY_ID.get(id)
  return spec ? toDef(spec) : undefined
}

/** The utility (without "-" or variants) for one option or value. */
export function optionUtility(spec: PropertySpec, value: string): string {
  return spec.prefix ? `${spec.prefix}-${value}` : value
}

// --- lookup tables ------------------------------------------------------------------------------

type Exact = { spec: PropertySpec; value: string }

/** Full utility → property, for enum options and bare utilities (`flex`, `border`, `rounded`). */
export const EXACT = new Map<string, Exact>()
for (const spec of SPECS) {
  for (const option of spec.options ?? []) EXACT.set(optionUtility(spec, option.value), { spec, value: option.value })
  if (spec.bare !== undefined && spec.prefix) EXACT.set(spec.prefix, { spec, value: spec.bare })
}

type PrefixRule = { prefix: string; spec: PropertySpec; accept: Accept }

/** Prefix rules, longest prefix first, so `border-t-2` is tried before `border-2`. */
export const PREFIX_RULES: PrefixRule[] = SPECS.flatMap((spec): PrefixRule[] => {
  const rules: PrefixRule[] = []
  if (spec.prefix && (spec.kind !== 'enum' || spec.accept)) {
    rules.push({ prefix: spec.prefix, spec, accept: spec.accept ?? anyValue })
  }
  for (const alias of spec.aliases ?? []) rules.push({ prefix: alias.prefix, spec, accept: alias.accept })
  return rules
}).toSorted((a, b) => b.prefix.length - a.prefix.length)

/** Resolves a utility (no variants, "!" or "-") to its property and value. */
export function resolveUtility(
  utility: string,
  negative: boolean,
  tokens: StyleTokenHints,
): { spec: PropertySpec; value: string } | null {
  const exact = EXACT.get(utility)
  if (exact) return negative && !exact.spec.negative ? null : exact
  for (const rule of PREFIX_RULES) {
    if (!utility.startsWith(`${rule.prefix}-`)) continue
    const value = utility.slice(rule.prefix.length + 1)
    if (!rule.accept(value, tokens)) continue
    if (negative && !rule.spec.negative) return null
    return { spec: rule.spec, value }
  }
  return null
}

// --- shorthand graph ----------------------------------------------------------------------------

/** The property and its shorthands, nearest first: padding-top → [padding-top, padding-y, padding]. */
export function shorthandChain(id: string): string[] {
  const chain = [id]
  for (let i = 0; i < chain.length; i++) {
    for (const parent of SPEC_BY_ID.get(chain[i])?.parents ?? []) {
      if (!chain.includes(parent)) chain.push(parent)
    }
  }
  return chain
}

/** Every property a shorthand covers: padding → padding-x, padding-y, padding-top, … */
export function shorthandSides(id: string): Set<string> {
  const sides = new Set<string>()
  for (const spec of SPECS) {
    if (spec.id !== id && shorthandChain(spec.id).includes(id)) sides.add(spec.id)
  }
  return sides
}

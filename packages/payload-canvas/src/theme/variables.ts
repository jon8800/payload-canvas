// Design variables of the theme: named colors, sizes and fonts that blocks and classes use by name
// (`bg-brand`, `p-gutter`, `font-display`). Pure and client-safe. See the README section "Design
// variables".
//
// - Output: CSS custom properties in Tailwind's names (`--color-brand`, `--spacing-gutter`,
//   `--font-display`), set by `ThemeStyle` in `:root:root`, with dark values under the `.dark` class.
// - Compile: `variablesThemeCss` registers the names in a `@theme inline reference` block after the
//   app's CSS entry. Utilities then read the variable (`.bg-brand { background-color:
//   var(--color-brand) }`) and the compile outputs no value, so the compiled CSS depends only on the
//   names and types, never on the values.

export type ThemeVariableType = 'color' | 'size' | 'font'

/** One design variable as the theme global stores it. */
export type ThemeVariable = {
  /** The name classes use: `brand` gives `bg-brand`, `text-brand`. */
  name: string
  type: ThemeVariableType
  /** Color: a hex color or a CSS color. Size: a CSS length (`1.5rem`, `24px`, `clamp(…)`). Font: a Google Fonts family. */
  value?: string | null
  /** The value under the `.dark` class (colors and sizes). Empty: the same as `value`. */
  darkValue?: string | null
  id?: string | null
}

/** What the editor, the AI and the MCP tools see of a variable. */
export type VariableToken = {
  name: string
  type: ThemeVariableType
  /** The CSS custom property, e.g. "--color-brand". */
  property: string
  value: string
  darkValue?: string
}

export const VARIABLE_TYPES: ReadonlyArray<{ value: ThemeVariableType; label: string }> = [
  { value: 'color', label: 'Color' },
  { value: 'size', label: 'Size' },
  { value: 'font', label: 'Font' },
]

/** Tailwind's theme namespace of each type. */
const NAMESPACE: Record<ThemeVariableType, string> = { color: '--color', size: '--spacing', font: '--font' }

/** Example classes per type, for help text and the AI. */
export const VARIABLE_CLASS_EXAMPLES: Record<ThemeVariableType, string[]> = {
  color: ['bg', 'text', 'border'],
  size: ['p', 'm', 'gap', 'w'],
  font: ['font'],
}

export const VARIABLE_NAME_MAX = 40

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Names the theme or Tailwind already uses, per type. A variable with one of them would replace it. */
const RESERVED: Record<ThemeVariableType, ReadonlySet<string>> = {
  color: new Set([
    'inherit', 'current', 'transparent', 'black', 'white',
    'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
    'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
    'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring',
    'sidebar', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground', 'sidebar-accent',
    'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring',
  ]),
  size: new Set(['px', 'full', 'auto', 'screen', 'svh', 'dvh', 'lvh', 'svw', 'dvw', 'lvw', 'fit', 'min', 'max', 'none', 'prose']),
  font: new Set(['sans', 'serif', 'mono', 'heading']),
}

/** A palette shade (`red-500`) or a chart color (`chart-2`). */
const PALETTE_NAME = /^(?:[a-z]+-(?:50|[1-9]00|950)|chart-\d+)$/

/** The CSS custom property of a variable: `--color-brand`. */
export const variableProperty = (variable: Pick<ThemeVariable, 'name' | 'type'>) => `${NAMESPACE[variable.type]}-${variable.name}`

/** Why a variable name is not usable for this type, or null. */
export function variableNameProblem(name: unknown, type: ThemeVariableType): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'Enter a name.'
  const value = name.trim()
  if (value.length > VARIABLE_NAME_MAX) return `Use at most ${VARIABLE_NAME_MAX} characters.`
  if (!NAME.test(value)) return 'Use lower-case letters, digits and single dashes, and start with a letter. For example "brand" or "space-lg".'
  if (RESERVED[type].has(value) || (type === 'color' && PALETTE_NAME.test(value))) return `“${value}” is taken by the theme. Pick another name.`
  return null
}

const UNSAFE = /[;{}<>\\"`]|\/\*/

const COLOR = /^(?:#[\da-f]{3,8}|[a-z]+|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|color-mix|light-dark)\(.*\)|var\(--[\w-]+\))$/i
const SIZE = /^(?:-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vw|vh|svh|dvh|lvh|ch|ex|lh|cqw|cqh)?|(?:calc|clamp|min|max)\(.*\)|var\(--[\w-]+\))$/i

/** Why a value is not usable for this type, or null. Empty values are allowed (the variable is left out). */
export function variableValueProblem(value: unknown, type: ThemeVariableType): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return 'Enter text.'
  const text = value.trim()
  if (!text) return null
  if (UNSAFE.test(text) || text.length > 200) return 'This value has characters CSS does not allow here.'
  if (type === 'color' && !COLOR.test(text)) return 'Enter a color, for example #1f4536.'
  if (type === 'size' && !SIZE.test(text)) return 'Enter a size, for example 24px, 1.5rem or clamp(1rem, 4vw, 3rem).'
  if (type === 'font' && !cleanVariableFamily(text)) return 'Enter a Google Fonts family, for example Inter.'
  return null
}

/** A Google Fonts family name with only letters, digits, spaces and dashes. */
export function cleanVariableFamily(family: string | null | undefined): string | null {
  const clean = family?.replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim()
  return clean || null
}

const isType = (value: unknown): value is ThemeVariableType => value === 'color' || value === 'size' || value === 'font'

/**
 * The usable variables: a valid name and type, a valid non-empty value, the first of each name.
 * Invalid rows are left out (the save validation reports them), so the output never breaks the CSS.
 */
export function cleanVariables(list: unknown): ThemeVariable[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: ThemeVariable[] = []
  for (const item of list as Array<Partial<ThemeVariable> | null>) {
    if (!item || !isType(item.type) || typeof item.name !== 'string') continue
    const name = item.name.trim()
    if (seen.has(name) || variableNameProblem(name, item.type)) continue
    const value = typeof item.value === 'string' ? item.value.trim() : ''
    if (!value || variableValueProblem(value, item.type)) continue
    const dark = item.type !== 'font' && typeof item.darkValue === 'string' ? item.darkValue.trim() : ''
    seen.add(name)
    out.push({ name, type: item.type, value, ...(dark && !variableValueProblem(dark, item.type) ? { darkValue: dark } : {}) })
  }
  return out
}

/** Problems of a variables list, by row index: names and values. For the global's validation. */
export function variablesProblems(list: unknown): string | true {
  if (list == null) return true
  if (!Array.isArray(list)) return 'Variables must be a list.'
  const seen = new Set<string>()
  for (const [index, item] of (list as Array<Partial<ThemeVariable> | null>).entries()) {
    const row = `Variable ${index + 1}`
    if (!item || !isType(item.type)) return `${row}: choose a type.`
    const nameProblem = variableNameProblem(item.name, item.type)
    if (nameProblem) return `${row}: ${nameProblem}`
    const name = String(item.name).trim()
    if (seen.has(name)) return `${row}: “${name}” is used twice. Each variable needs its own name.`
    seen.add(name)
    const valueProblem = variableValueProblem(item.value, item.type) ?? (item.type === 'font' ? null : variableValueProblem(item.darkValue, item.type))
    if (valueProblem) return `${row} (${name}): ${valueProblem}`
  }
  return true
}

/** The CSS value of a variable. Fonts get a fallback stack. */
export function variableCssValue(variable: Pick<ThemeVariable, 'type'>, value: string): string {
  if (variable.type !== 'font') return value
  return `'${cleanVariableFamily(value)}', sans-serif`
}

/** The font families the variables choose, by font name (`{ display: 'Fraunces' }`). */
export function variableFontFamilies(list: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const variable of cleanVariables(list)) {
    if (variable.type !== 'font') continue
    const family = cleanVariableFamily(variable.value)
    if (family) out[variable.name] = family
  }
  return out
}

/** Light values by custom property, colors and sizes only (fonts come with the theme's fonts). */
export function variableDeclarations(list: unknown, mode: 'light' | 'dark' = 'light'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const variable of cleanVariables(list)) {
    if (variable.type === 'font') continue
    const value = mode === 'dark' ? variable.darkValue : variable.value
    if (value) out[variableProperty(variable)] = variableCssValue(variable, value)
  }
  return out
}

/**
 * The dark values as a rule under the `.dark` class, on the root element and on any element inside
 * it. Empty string without dark values. The selectors beat the theme's `:root:root` rule.
 */
export function variablesDarkCss(list: unknown): string {
  const entries = Object.entries(variableDeclarations(list, 'dark'))
  if (entries.length === 0) return ''
  return `:root:root.dark, :root:root .dark { ${entries.map(([k, v]) => `${k}: ${v};`).join(' ')} }`
}

/**
 * The `@theme` block both Tailwind compiles add after the app's CSS entry, so `bg-brand`,
 * `p-gutter` and `font-display` exist. Empty string without variables.
 */
export function variablesThemeCss(list: unknown): string {
  const variables = cleanVariables(list).toSorted((a, b) => variableProperty(a).localeCompare(variableProperty(b)))
  if (variables.length === 0) return ''
  const lines = variables.map((v) => `  ${variableProperty(v)}: var(${variableProperty(v)});`)
  return `\n/* Design variables of the theme (payload-canvas). */\n@theme inline reference {\n${lines.join('\n')}\n}\n`
}

/** The variables as the editor, the AI and the MCP tools see them. */
export function variableTokens(list: unknown): VariableToken[] {
  return cleanVariables(list).map((v) => ({
    name: v.name,
    type: v.type,
    property: variableProperty(v),
    value: v.value!,
    ...(v.darkValue ? { darkValue: v.darkValue } : {}),
  }))
}

// ---------------------------------------------------------------------------------------------
// Where a variable is used: class strings and custom CSS

/** Utility roots that take a color, a size or a font. */
const ROOTS: Record<ThemeVariableType, string> = {
  color: 'bg|text|border(?:-[xytrblse])?|outline|ring|ring-offset|fill|stroke|from|via|to|shadow|inset-shadow|inset-ring|drop-shadow|decoration|accent|caret|divide|placeholder|scrollbar',
  size: '(?:p|m|scroll-p|scroll-m)[xytrblse]?|gap(?:-[xy])?|space-[xy]|w|h|size|min-w|min-h|max-w|max-h|inset(?:-[xy])?|top|right|bottom|left|start|end|basis|indent|translate-[xy]|scroll-[mp][xytrblse]?',
  font: 'font',
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const patternCache = new Map<string, RegExp>()

/** True when one class token (any variant prefix, `-` sign, `!` mark, `/opacity`) uses the variable. */
export function tokenUsesVariable(token: string, variable: Pick<ThemeVariable, 'name' | 'type'>): boolean {
  const key = `${variable.type}:${variable.name}`
  let pattern = patternCache.get(key)
  if (!pattern) {
    const name = escape(variable.name)
    const property = escape(variableProperty(variable))
    pattern = new RegExp(`^(?:[^\\s:]+:)*!?-?(?:(?:${ROOTS[variable.type]})-${name}(?:\\/[^\\s]+)?!?$|.*${property}(?![\\w-]))`)
    patternCache.set(key, pattern)
  }
  return pattern.test(token)
}

/** True when a class string or a CSS text uses the variable (its classes or `var(--color-brand)`). */
export function textUsesVariable(text: string | null | undefined, variable: Pick<ThemeVariable, 'name' | 'type'>): boolean {
  if (!text) return false
  if (new RegExp(`${escape(variableProperty(variable))}(?![\\w-])`).test(text)) return true
  return text.split(/\s+/).some((token) => token && tokenUsesVariable(token, variable))
}

// ---------------------------------------------------------------------------------------------
// For the AI assistant and the MCP tools

/** Example classes of a variable: "bg-brand text-brand border-brand". */
export const variableClasses = (variable: Pick<ThemeVariable, 'name' | 'type'>) =>
  VARIABLE_CLASS_EXAMPLES[variable.type].map((root) => `${root}-${variable.name}`).join(' ')

export const VARIABLES_NOTE =
  "The site's design variables (Theme > Variables): named colors, sizes and fonts. Prefer them over raw values so the site keeps one look: colors as bg-<name>, text-<name>, border-<name>; sizes as p-<name>, m-<name>, gap-<name>, w-<name>; fonts as font-<name>. In custom CSS use var(<property>). darkValue applies under the .dark class."

/** The variables for a tool result: name, type, value, dark value and example classes. */
export function describeVariables(tokens: readonly VariableToken[]): Array<VariableToken & { classes: string }> {
  return tokens.map((token) => ({ ...token, classes: variableClasses(token) }))
}

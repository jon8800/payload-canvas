// Field conditions that survive JSON. Payload's `admin.condition` is a function, so it never
// reaches the admin client. The builder stores a small JSON rule in
// `admin.custom.builderCondition` instead. The inspector reads it to show or hide a field, and
// validateLayout reads it to skip the required check of a hidden field (Payload does the same).

import { isPlainObject } from './tree'

/**
 * Shows a field only when a sibling field matches. Exactly one test applies, in this order:
 * - `equals`: the sibling equals the value (or one of the values, when it is an array),
 * - `notEquals`: the sibling does not equal the value (or none of the values),
 * - `truthy`: the sibling is truthy (`true`) or falsy (`false`).
 * A sibling without a value counts as its field's `defaultValue`.
 */
export type BuilderCondition = {
  field: string
  equals?: unknown
  notEquals?: unknown
  truthy?: boolean
}

type SiblingField = { name?: string; defaultValue?: unknown }

/** The field's `admin.custom.builderCondition`, or null. */
export function readCondition(field: unknown): BuilderCondition | null {
  if (!isPlainObject(field)) return null
  const admin = field.admin
  const custom = isPlainObject(admin) ? admin.custom : undefined
  const condition = isPlainObject(custom) ? custom.builderCondition : undefined
  if (!isPlainObject(condition) || typeof condition.field !== 'string') return null
  return condition as BuilderCondition
}

const matches = (value: unknown, expected: unknown) => (Array.isArray(expected) ? expected.includes(value) : value === expected)

/** True when the condition holds for these sibling values. */
export function conditionMet(
  condition: BuilderCondition,
  siblings: Record<string, unknown>,
  siblingFields: readonly SiblingField[] = [],
): boolean {
  let value = siblings[condition.field]
  if (value === undefined || value === null) {
    const fallback = siblingFields.find((f) => f.name === condition.field)?.defaultValue
    if (typeof fallback !== 'function') value = fallback
  }
  if ('equals' in condition) return matches(value, condition.equals)
  if ('notEquals' in condition) return !matches(value, condition.notEquals)
  if (typeof condition.truthy === 'boolean') return Boolean(value) === condition.truthy
  return true
}

// ---------------------------------------------------------------------------
// Reading simple `admin.condition` functions
// ---------------------------------------------------------------------------

const IDENT = '[A-Za-z_$][\\w$]*'
const LITERAL = `'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|true|false|null|-?\\d+(?:\\.\\d+)?`

function parseLiteral(source: string): { ok: true; value: unknown } | { ok: false } {
  const text = source.trim()
  if (text === 'true') return { ok: true, value: true }
  if (text === 'false') return { ok: true, value: false }
  if (text === 'null') return { ok: true, value: null }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return { ok: true, value: Number(text) }
  const quote = text[0]
  if ((quote === "'" || quote === '"') && text.endsWith(quote)) {
    const inner = text.slice(1, -1)
    return { ok: true, value: inner.replace(/\\(.)/g, '$1') }
  }
  return { ok: false }
}

/** The second parameter of a function's source: a name, or the names of a flat destructuring. */
function siblingParam(source: string): { name: string } | { names: string[] } | null {
  // Arrow functions, `function (…)` and method shorthand (`condition(…) { … }`).
  const match = /^\s*(?:async\s*)?(?:function\b[^(]*|[A-Za-z_$][\w$]*\s*)?\(([^)]*)\)/.exec(source)
  if (!match) return null
  const params: string[] = []
  let depth = 0
  let current = ''
  for (const char of match[1]) {
    if (char === '{' || char === '[') depth++
    if (char === '}' || char === ']') depth--
    if (char === ',' && depth === 0) {
      params.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  params.push(current.trim())
  const second = params[1]
  if (!second) return null
  if (new RegExp(`^${IDENT}$`).test(second)) return { name: second }
  const destructured = /^\{([^}]*)\}$/.exec(second)
  if (!destructured) return null
  const names = destructured[1].split(',').map((part) => part.trim()).filter(Boolean)
  return names.every((name) => new RegExp(`^${IDENT}$`).test(name)) ? { names } : null
}

/** The returned expression of an arrow function or a function with a single `return`. */
function bodyExpression(source: string): string | null {
  const arrow = source.indexOf('=>')
  let body = arrow >= 0 ? source.slice(arrow + 2).trim() : source.slice(source.indexOf('{')).trim()
  if (body.startsWith('{')) {
    const inner = body.slice(1, body.lastIndexOf('}')).trim()
    const ret = /^return\s+([\s\S]*?);?$/.exec(inner)
    if (!ret) return null
    body = ret[1]
  }
  body = body.replace(/;\s*$/, '').trim()
  while (body.startsWith('(') && body.endsWith(')')) body = body.slice(1, -1).trim()
  return body
}

/**
 * Turns a simple Payload `admin.condition` function into a JSON rule, or returns null.
 * Understands conditions on a sibling field, written with the second parameter (`siblingData`):
 * `(_, s) => s?.type === 'custom'`, `!==`, `==`, `!=`, the value on either side, `!!s?.text`,
 * `Boolean(s.text)`, `s?.enableLink`, `!s?.text`, and `(_, { type }) => type === 'x'`.
 * Minified code works too. Anything else (document data, user, several tests) returns null.
 */
export function conditionFromFunction(fn: unknown): BuilderCondition | null {
  if (typeof fn !== 'function') return null
  const source = Function.prototype.toString.call(fn)
  const param = siblingParam(source)
  const body = param ? bodyExpression(source) : null
  if (!param || !body) return null

  // The sibling field reference: `s?.x`, `s.x`, `s?.['x']`, `s && s.x`, or a destructured name.
  const access =
    'name' in param
      ? `(?:${escape(param.name)}\\s*&&\\s*)?${escape(param.name)}\\s*(?:\\?\\.\\s*(${IDENT})|\\.\\s*(${IDENT})|\\??\\.?\\s*\\[\\s*['"](${IDENT})['"]\\s*\\])`
      : `(${param.names.map(escape).join('|')})`
  const groups = 'name' in param ? 3 : 1

  const compare = new RegExp(`^${access}\\s*(===|!==|==|!=)\\s*(${LITERAL})$`).exec(body)
  if (compare) {
    const literal = parseLiteral(compare[groups + 2])
    if (!literal.ok) return null
    const field = fieldOf(compare, 1)
    return compare[groups + 1].startsWith('!') ? { field, notEquals: literal.value } : { field, equals: literal.value }
  }
  const reversed = new RegExp(`^(${LITERAL})\\s*(===|!==|==|!=)\\s*${access}$`).exec(body)
  if (reversed) {
    const literal = parseLiteral(reversed[1])
    if (!literal.ok) return null
    const field = fieldOf(reversed, 3)
    return reversed[2].startsWith('!') ? { field, notEquals: literal.value } : { field, equals: literal.value }
  }
  const truthy = new RegExp(`^(!!|!|Boolean\\()?\\s*${access}\\s*\\)?$`).exec(body)
  if (truthy) {
    const prefix = truthy[1] ?? ''
    if (prefix === 'Boolean(' !== body.endsWith(')')) return null
    return { field: fieldOf(truthy, 2), truthy: prefix !== '!' }
  }
  return null
}

/** The first non-empty capture group from `from` on (the sibling field name). */
function fieldOf(match: RegExpExecArray, from: number): string {
  return match.slice(from, from + 3).find(Boolean) ?? ''
}

function escape(text: string): string {
  return text.replace(/[$]/g, '\\$')
}

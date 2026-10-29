// Visibility conditions of a block (`Block.visibility`): rows of { field, operator, value } that
// show the block only when they match the current document (a template's document, a collection
// list item or a repeat row). Pure: no React, no Payload. `isVisible` in bindings.ts reads the
// values; this module holds the shape, the checks and the canonical form.

/**
 * The operators of a condition. The names and meanings follow Payload's `where` operators
 * (`equals`, `in`, `greater_than`, `like`, …), plus `is_set` and `is_empty`, which need no value.
 */
export const VISIBILITY_OPERATORS = [
  'is_set',
  'is_empty',
  'equals',
  'not_equals',
  'in',
  'not_in',
  'greater_than',
  'greater_than_equal',
  'less_than',
  'less_than_equal',
  'like',
  'contains',
] as const

export type VisibilityOperator = (typeof VISIBILITY_OPERATORS)[number]

/** A condition value: text, a number or a boolean; a list for `in` and `not_in`; none for `is_set` and `is_empty`. */
export type VisibilityValue = string | number | boolean | Array<string | number>

/** One condition row. */
export type VisibilityCondition = {
  /** A field path of the current document, or a virtual path (`$index`, `$item`, `$parent.name`, `$page.title`). */
  field: string
  operator: VisibilityOperator
  value?: VisibilityValue
  /**
   * Compare with the value of this field (the same paths as `field`) instead of `value`. A
   * condition has `value` or `valueField`, never both.
   */
  valueField?: string
  /** True: the condition tests the number of items of the field (an array or a hasMany field), not its value. */
  count?: true
}

/** Conditions that must all match: an entry of `conditions` when `match` is "any". */
export type VisibilityGroup = { all: VisibilityCondition[] }

/**
 * A block's visibility: shown when all conditions match, or any with `match: 'any'`. With "any"
 * an entry may be a group (`{ all: [...] }`) that matches when all its conditions match, so
 * "any" with groups is an "or" of "and" groups.
 */
export type BlockVisibility = {
  match?: 'any'
  conditions: Array<VisibilityCondition | VisibilityGroup>
}

/** Operators that take no value. */
export const VALUELESS_OPERATORS: ReadonlySet<VisibilityOperator> = new Set(['is_set', 'is_empty'])
/** Operators that take a list of values. */
export const LIST_OPERATORS: ReadonlySet<VisibilityOperator> = new Set(['in', 'not_in'])

// Local: tree.ts imports this module (normalizeLayout), so it cannot import tree.ts back.
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean'

const isOperator = (value: unknown): value is VisibilityOperator =>
  typeof value === 'string' && (VISIBILITY_OPERATORS as readonly string[]).includes(value)

/** True for a group entry (`{ all: [...] }`). */
export const isVisibilityGroup = (entry: VisibilityCondition | VisibilityGroup): entry is VisibilityGroup => 'all' in entry

/** One condition in canonical form, or the error message. */
function checkCondition(value: unknown, at: string): VisibilityCondition | string {
  if (!isPlainObject(value)) return `${at} must be an object`
  for (const key of Object.keys(value)) {
    if (!['field', 'operator', 'value', 'valueField', 'count'].includes(key)) {
      return `${at}: unknown key "${key}". Use field, operator, value (or valueField) and count.`
    }
  }
  const field = typeof value.field === 'string' ? value.field.trim() : ''
  if (!field) return `${at}.field must be a field path`
  if (!isOperator(value.operator)) return `${at}.operator must be one of ${VISIBILITY_OPERATORS.join(', ')}`
  const operator = value.operator
  const condition: VisibilityCondition = { field, operator }
  if (value.count !== undefined && typeof value.count !== 'boolean') return `${at}.count must be a boolean`
  if (value.count === true) condition.count = true
  if (VALUELESS_OPERATORS.has(operator)) return condition
  if (value.valueField !== undefined) {
    const valueField = typeof value.valueField === 'string' ? value.valueField.trim() : ''
    if (!valueField) return `${at}.valueField must be a field path`
    if (value.value !== undefined) return `${at}: use value or valueField, not both`
    condition.valueField = valueField
    return condition
  }
  if (LIST_OPERATORS.has(operator)) {
    const list = Array.isArray(value.value) ? value.value : isScalar(value.value) ? [value.value] : null
    if (!list || !list.every((item) => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)))) {
      return `${at}.value must be a list of texts or numbers`
    }
    condition.value = list as Array<string | number>
    return condition
  }
  if (!isScalar(value.value)) return `${at}.value must be a text, a number or a boolean`
  condition.value = value.value
  return condition
}

/**
 * One entry of `conditions`: a condition, or a group `{ all: [...] }` (a group of one condition
 * becomes that condition). `strict`: the first bad condition is the error; otherwise bad
 * conditions are dropped. Null: an empty group, which is dropped.
 */
function checkEntry(value: unknown, at: string, strict: boolean): VisibilityCondition | VisibilityGroup | null | string {
  if (!isPlainObject(value) || !('all' in value)) return checkCondition(value, at)
  if (Object.keys(value).length !== 1) return `${at}: a group has only the key "all"`
  if (!Array.isArray(value.all)) return `${at}.all must be a list of conditions`
  const all: VisibilityCondition[] = []
  for (const [i, raw] of value.all.entries()) {
    const checked = checkCondition(raw, `${at}.all[${i}]`)
    if (typeof checked !== 'string') all.push(checked)
    else if (strict) return checked
  }
  if (all.length === 0) return strict ? `${at}.all must hold a condition` : null
  return all.length === 1 ? all[0]! : { all }
}

/**
 * The canonical visibility of checked entries: `undefined` without conditions, `match` only when
 * "any". Without "any", groups are flattened into the conditions.
 */
function canonical(entries: Array<VisibilityCondition | VisibilityGroup>, match: unknown): BlockVisibility | undefined {
  if (entries.length === 0) return undefined
  if (match === 'any') return { match: 'any', conditions: entries }
  return { conditions: entries.flatMap((entry) => (isVisibilityGroup(entry) ? entry.all : [entry])) }
}

/**
 * Checks stored or inserted `visibility` and returns it in canonical form: trimmed field paths,
 * no value for `is_set`/`is_empty`, `match` only when "any", groups only under "any", `undefined`
 * without conditions. A string is the error message.
 */
export function checkVisibility(value: unknown): BlockVisibility | undefined | string {
  if (value === undefined || value === null) return undefined
  if (!isPlainObject(value)) return 'visibility must be an object: { match?, conditions }'
  for (const key of Object.keys(value)) {
    if (key !== 'match' && key !== 'conditions') return `Unknown visibility key "${key}". Use match and conditions.`
  }
  if (value.match !== undefined && value.match !== 'all' && value.match !== 'any') return 'visibility.match must be "all" or "any"'
  if (value.conditions === undefined) return undefined
  if (!Array.isArray(value.conditions)) return 'visibility.conditions must be a list'
  const entries: Array<VisibilityCondition | VisibilityGroup> = []
  for (const [i, raw] of value.conditions.entries()) {
    const checked = checkEntry(raw, `visibility.conditions[${i}]`, true)
    if (typeof checked === 'string') return checked
    if (checked) entries.push(checked)
  }
  return canonical(entries, value.match)
}

/** `visibility` as stored, with bad conditions dropped one by one: a stored layout never fails to load. */
export function normalizeVisibility(value: unknown): BlockVisibility | undefined {
  if (!isPlainObject(value) || !Array.isArray(value.conditions)) return undefined
  const entries = value.conditions.flatMap((raw, i) => {
    const checked = checkEntry(raw, `conditions[${i}]`, false)
    return checked && typeof checked !== 'string' ? [checked] : []
  })
  return canonical(entries, value.match)
}

/**
 * The conditions as "or" groups of "and" conditions: one group without "any", one group per
 * entry with "any". The block shows when every condition of one group matches.
 */
export function visibilityGroups(visibility: BlockVisibility | undefined): VisibilityCondition[][] {
  const entries = visibility?.conditions ?? []
  if (entries.length === 0) return []
  if (visibility?.match !== 'any') return [entries.flatMap((entry) => (isVisibilityGroup(entry) ? entry.all : [entry]))]
  return entries.map((entry) => (isVisibilityGroup(entry) ? entry.all : [entry]))
}

/**
 * The visibility of "or" groups of "and" conditions, in canonical form. One group: its
 * conditions. Several: `match: "any"`, with a group entry for each group of two or more.
 */
export function groupsVisibility(groups: readonly VisibilityCondition[][]): BlockVisibility | undefined {
  const filled = groups.filter((group) => group.length > 0)
  if (filled.length <= 1) return canonical(filled[0] ?? [], undefined)
  return canonical(
    filled.map((group) => (group.length === 1 ? group[0]! : { all: [...group] })),
    'any',
  )
}

/** Every condition, groups flattened: for readers that need only the fields or the number. */
export const visibilityConditions = (visibility: BlockVisibility | undefined): VisibilityCondition[] => visibilityGroups(visibility).flat()

/** JSON Schema of `visibility`, for the block schemas AI tools read. */
export function visibilityJsonSchema(): Record<string, unknown> {
  const scalar = [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }]
  const condition = {
    type: 'object',
    properties: {
      field: { type: 'string' },
      operator: { type: 'string', enum: [...VISIBILITY_OPERATORS] },
      value: { anyOf: [...scalar, { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } }] },
      valueField: { type: 'string' },
      count: { type: 'boolean' },
    },
    required: ['field', 'operator'],
    additionalProperties: false,
  }
  return {
    type: 'object',
    description:
      'Visibility conditions: the block shows only when they match the current document (a template\'s document, a collection list item or a repeat row). ' +
      'match "all" (default) or "any". Each condition: field (a field path, or $index, $item, $parent.<path>, $page.<path>), operator, and value or valueField ' +
      '(another field path to compare with). is_set and is_empty take no value; in and not_in take a list; greater_than, greater_than_equal, less_than and less_than_equal compare numbers or dates; ' +
      'like (every word, any case) and contains (any case) read text. count: true tests the number of items of an array or hasMany field. ' +
      'With match "any", an entry may be a group { all: [conditions] } that matches when all of them match ("or" of "and" groups). ' +
      'Without a current document (a normal page) the conditions are not checked.',
    properties: {
      match: { type: 'string', enum: ['all', 'any'] },
      conditions: {
        type: 'array',
        items: {
          anyOf: [
            condition,
            { type: 'object', properties: { all: { type: 'array', items: condition, minItems: 1 } }, required: ['all'], additionalProperties: false },
          ],
        },
      },
    },
    required: ['conditions'],
    additionalProperties: false,
  }
}

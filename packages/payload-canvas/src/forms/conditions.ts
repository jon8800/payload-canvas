// Display conditions for the fields of a form made with `@payloadcms/plugin-form-builder`.
// A form field may show only when other fields of the same form have some values:
//   conditions: { match: 'all' | 'any', rules: [{ field, operator, value }] }
// Pure and client-safe: the site's form renderer, the submission hook and the builder use it.

import type { Field } from 'payload'

export const FORM_CONDITION_OPERATORS = ['equals', 'notEquals', 'contains', 'isEmpty', 'isNotEmpty'] as const

export type FormConditionOperator = (typeof FORM_CONDITION_OPERATORS)[number]

/** One test: the value of the form field named `field` against `value`. */
export type FormConditionRule = {
  field?: string | null
  operator?: FormConditionOperator | null
  value?: string | null
}

/** `match: 'all'` (the default): every rule must hold. `'any'`: one rule is enough. */
export type FormFieldConditions = {
  match?: 'all' | 'any' | null
  rules?: FormConditionRule[] | null
}

/** A field of a form document, as the form-builder plugin stores it. */
export type FormFieldLike = {
  blockType?: string
  name?: string | null
  required?: boolean | null
  conditions?: FormFieldConditions | null
}

/** A value a visitor entered. Checkboxes give booleans, other fields text. */
export type FormValue = string | number | boolean | null | undefined

/** Name of the conditions field in every form field block. */
export const FORM_CONDITIONS_FIELD = 'conditions'

/** Operators that compare with a value. The others test only whether the field is empty. */
const NEEDS_VALUE = new Set<string>(['equals', 'notEquals', 'contains'])

const OPERATOR_LABELS: Record<FormConditionOperator, string> = {
  equals: 'equals',
  notEquals: 'does not equal',
  contains: 'contains',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
}

const text = (value: FormValue): string => (value === null || value === undefined ? '' : String(value).trim())

/** Empty: no value, blank text, or a checkbox that is not ticked. */
export function isEmptyFormValue(value: FormValue): boolean {
  return value === false || text(value) === ''
}

/** A rule that names a field and an operator (and a value, when the operator needs one). */
export function isCompleteRule(rule: FormConditionRule | null | undefined): rule is FormConditionRule & { field: string; operator: FormConditionOperator } {
  if (!rule || typeof rule.field !== 'string' || !rule.field.trim()) return false
  return typeof rule.operator === 'string' && (FORM_CONDITION_OPERATORS as readonly string[]).includes(rule.operator)
}

/**
 * True when the rule holds for `value`. Text compares without case and surrounding spaces; a
 * ticked checkbox equals "true" (also "yes", "on" or "1"), an unticked one "false".
 */
export function ruleMet(rule: FormConditionRule & { operator: FormConditionOperator }, value: FormValue): boolean {
  if (rule.operator === 'isEmpty') return isEmptyFormValue(value)
  if (rule.operator === 'isNotEmpty') return !isEmptyFormValue(value)
  const actual = typeof value === 'boolean' ? String(value) : text(value).toLowerCase()
  let expected = text(rule.value).toLowerCase()
  if (typeof value === 'boolean' && ['yes', 'on', '1', 'checked', 'ticked'].includes(expected)) expected = 'true'
  if (typeof value === 'boolean' && ['no', 'off', '0', 'unchecked'].includes(expected)) expected = 'false'
  if (rule.operator === 'contains') return expected === '' || actual.includes(expected)
  const equal = actual === expected
  return rule.operator === 'equals' ? equal : !equal
}

/** The complete rules of a field. A field without complete rules always shows. */
export function conditionRules(field: FormFieldLike): Array<FormConditionRule & { field: string; operator: FormConditionOperator }> {
  return (field.conditions?.rules ?? []).filter(isCompleteRule)
}

/** True when the field shows for these values (the values of hidden fields left out). */
export function conditionsMet(field: FormFieldLike, values: Record<string, FormValue>): boolean {
  const rules = conditionRules(field)
  if (rules.length === 0) return true
  const met = (rule: (typeof rules)[number]) => ruleMet(rule, values[rule.field.trim()])
  return field.conditions?.match === 'any' ? rules.some(met) : rules.every(met)
}

/**
 * The names of the fields their conditions hide. A rule that reads a hidden field sees it as
 * empty, so a chain (C depends on B, B on A) hides C when A hides B. Rules that form a loop
 * (A depends on B, B on A) read the entered values. Fields without a name (messages) are never
 * in the set.
 */
export function hiddenFormFields(fields: readonly FormFieldLike[] | null | undefined, values: Record<string, FormValue>): Set<string> {
  const byName = new Map<string, FormFieldLike>()
  for (const field of fields ?? []) if (typeof field?.name === 'string' && field.name !== '' && !byName.has(field.name)) byName.set(field.name, field)
  const shown = new Map<string, boolean>()
  const visiting = new Set<string>()
  const isShown = (name: string): boolean => {
    const known = shown.get(name)
    if (known !== undefined) return known
    const field = byName.get(name)
    // Not a field of the form, or a loop: the entered value counts.
    if (!field || visiting.has(name)) return true
    visiting.add(name)
    const seen: Record<string, FormValue> = {}
    for (const rule of conditionRules(field)) {
      const other = rule.field.trim()
      seen[other] = isShown(other) ? values[other] : undefined
    }
    visiting.delete(name)
    const result = conditionsMet(field, seen)
    shown.set(name, result)
    return result
  }
  return new Set([...byName.keys()].filter((name) => !isShown(name)))
}

/** True when the field shows: it has no name (a message) or no condition hides it. */
export function isFormFieldShown(field: FormFieldLike, hidden: ReadonlySet<string>): boolean {
  return !field.name || !hidden.has(field.name)
}

/** One line for editors: "Shows when Topic equals Sales and Email is not empty". */
export function describeConditions(field: FormFieldLike, labelOf: (name: string) => string = (name) => name): string | null {
  const rules = conditionRules(field)
  if (rules.length === 0) return null
  const parts = rules.map((rule) => {
    const head = `${labelOf(rule.field.trim())} ${OPERATOR_LABELS[rule.operator]}`
    return NEEDS_VALUE.has(rule.operator) ? `${head} “${text(rule.value)}”` : head
  })
  return `Shows when ${parts.join(field.conditions?.match === 'any' ? ' or ' : ' and ')}`
}

// ---------------------------------------------------------------------------
// The Payload field
// ---------------------------------------------------------------------------

/**
 * The `conditions` field for a form field block. Add it to the blocks of the form-builder
 * plugin's `fields` option with `withFormConditions`. The builder edits it in its right panel;
 * Payload's edit screen shows it as a group.
 *
 * `admin.custom.builderFormField` makes the builder show the rule's field as a list of the
 * form's other fields. `admin.custom.builderCondition` hides the value for "is empty" and
 * "is not empty" in the builder; `admin.condition` does the same in Payload's edit screen.
 */
export function formConditionsField(): Field {
  return {
    name: FORM_CONDITIONS_FIELD,
    type: 'group',
    label: 'Display conditions',
    admin: {
      description: 'Show this field only when other fields of the form have some values. Without rules it always shows.',
    },
    fields: [
      {
        name: 'match',
        type: 'select',
        label: 'Show when',
        defaultValue: 'all',
        options: [
          { label: 'All rules match', value: 'all' },
          { label: 'Any rule matches', value: 'any' },
        ],
      },
      {
        name: 'rules',
        type: 'array',
        label: 'Rules',
        labels: { singular: 'Rule', plural: 'Rules' },
        fields: [
          {
            // Not required: a rule without a field is ignored, and the form keeps saving while it is filled in.
            name: 'field',
            type: 'text',
            label: 'Field',
            admin: { description: 'The name of another field of this form.', custom: { builderFormField: true } },
          },
          {
            name: 'operator',
            type: 'select',
            label: 'Test',
            defaultValue: 'equals',
            options: FORM_CONDITION_OPERATORS.map((value) => ({ label: OPERATOR_LABELS[value], value })),
          },
          {
            name: 'value',
            type: 'text',
            label: 'Value',
            admin: {
              description: 'For a checkbox: "true" when ticked, "false" when not.',
              condition: (_: unknown, siblings: { operator?: unknown }) => siblings?.operator !== 'isEmpty' && siblings?.operator !== 'isNotEmpty',
              custom: { builderCondition: { field: 'operator', notEquals: ['isEmpty', 'isNotEmpty'] } },
            },
          },
        ],
      },
    ],
  } as Field
}

type BlockLike = { slug: string; fields: Field[] }

/**
 * The block with the `conditions` field added, for the form-builder plugin's `fields` option:
 * `formBuilderPlugin({ fields: { text: withFormConditions(fields.text) } })`, with `fields` from
 * `@payloadcms/plugin-form-builder`. A block that has the field already stays as it is.
 */
export function withFormConditions<T extends BlockLike>(block: T): T {
  if (block.fields.some((f) => 'name' in f && f.name === FORM_CONDITIONS_FIELD)) return block
  return { ...block, fields: [...block.fields, formConditionsField()] }
}

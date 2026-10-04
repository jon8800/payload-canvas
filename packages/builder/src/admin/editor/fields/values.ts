// Pure helpers for the block inspector: field visibility and value adapters for Payload's inputs.
// No React here, so they are unit tested.

import type { CollectionSlug, ValueWithRelation } from 'payload'

import { formatProblem as formatMessage } from '../../../core/formats'

/** `admin.custom.builderCondition`: show the field only when a sibling field equals a value (or one of a list). */
export type BuilderCondition = { field: string; equals: unknown }

type Id = number | string

export type FieldShape = {
  name?: string
  type: string
  defaultValue?: unknown
  virtual?: unknown
  admin?: { hidden?: boolean; disabled?: boolean; custom?: Record<string, unknown> }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function isId(value: unknown): value is Id {
  return (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value))
}

/** An ID, or the ID of a document that was stored by mistake. */
export function asId(value: unknown): Id | null {
  if (isId(value)) return value
  if (isRecord(value) && 'id' in value) return asId(value.id)
  return null
}

export function readCondition(field: FieldShape): BuilderCondition | null {
  const condition = field.admin?.custom?.builderCondition
  if (!isRecord(condition) || typeof condition.field !== 'string') return null
  return { field: condition.field, equals: condition.equals }
}

/**
 * False when the field must not show in the inspector: hidden, disabled, virtual, or its
 * `builderCondition` does not match. A missing sibling value counts as that sibling's default.
 */
export function isFieldVisible(
  field: FieldShape,
  siblingData: Record<string, unknown>,
  siblingFields: readonly FieldShape[],
): boolean {
  if (field.admin?.hidden || field.admin?.disabled || field.virtual) return false
  const condition = readCondition(field)
  if (!condition) return true
  let current = siblingData[condition.field]
  if (current === undefined || current === null) {
    current = siblingFields.find((f) => f.name === condition.field)?.defaultValue
  }
  return Array.isArray(condition.equals) ? condition.equals.includes(current) : current === condition.equals
}

/** True for values the inspector removes from the props instead of storing. */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0)
  )
}

/** Sets or removes one key. Returns `undefined` when the object ends up empty. */
export function setKey(data: unknown, key: string, value: unknown): Record<string, unknown> | undefined {
  const next = { ...(isRecord(data) ? data : {}) }
  if (isEmptyValue(value)) delete next[key]
  else next[key] = value
  return Object.keys(next).length > 0 ? next : undefined
}

// ---------------------------------------------------------------------------
// Relationship values. Storage follows Payload: a plain ID (or IDs) for one collection,
// `{ relationTo, value }` (or a list of them) when `relationTo` is a list.
// RelationshipInput always uses `{ relationTo, value }`.
// ---------------------------------------------------------------------------

function toPair(value: unknown, relationTo: string[], polymorphic: boolean): ValueWithRelation | null {
  if (polymorphic) {
    if (!isRecord(value) || typeof value.relationTo !== 'string') return null
    const id = asId(value.value)
    return id === null ? null : { relationTo: value.relationTo as CollectionSlug, value: id }
  }
  const id = asId(value)
  const collection = relationTo[0]
  return id === null || !collection ? null : { relationTo: collection as CollectionSlug, value: id }
}

/** Stored value -> RelationshipInput value. */
export function toRelationshipInput(
  stored: unknown,
  relationTo: string[],
  polymorphic: boolean,
  hasMany: boolean,
): ValueWithRelation | ValueWithRelation[] | null {
  if (!hasMany) return toPair(stored, relationTo, polymorphic)
  const list = Array.isArray(stored) ? stored : []
  return list.map((item) => toPair(item, relationTo, polymorphic)).filter((pair) => pair !== null)
}

function fromPair(pair: unknown, polymorphic: boolean): unknown {
  if (!isRecord(pair)) return null
  const id = asId(pair.value)
  if (id === null) return null
  return polymorphic ? { relationTo: pair.relationTo, value: id } : id
}

/** RelationshipInput value -> stored value. */
export function fromRelationshipInput(next: unknown, polymorphic: boolean): unknown {
  if (Array.isArray(next)) return next.map((pair) => fromPair(pair, polymorphic)).filter((v) => v !== null)
  return fromPair(next, polymorphic)
}

const LABEL_TYPES = new Set(['text', 'textarea', 'email', 'select', 'number'])

/** First non-empty text value of an array row, for the row's label. */
export function rowLabel(row: unknown, fields: readonly FieldShape[]): string | null {
  if (!isRecord(row)) return null
  for (const field of fields) {
    if (!field.name || !LABEL_TYPES.has(field.type)) continue
    const value = row[field.name]
    if ((typeof value === 'string' && value.trim()) || typeof value === 'number') return String(value).trim()
  }
  return null
}

/** JSON text for the json field's textarea. */
export function toJsonText(value: unknown): string {
  return value === undefined || value === null ? '' : JSON.stringify(value, null, 2)
}

/** Parses the json field's text. Empty text means "no value". */
export function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!text.trim()) return { ok: true, value: undefined }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// ---------------------------------------------------------------------------
// Checks the inspector shows while editing. Block field configs reach the editor as JSON, so a
// Payload `validate` function is lost on the way. These checks are data instead.
// ---------------------------------------------------------------------------

/** The message for a text value that does not match the field's `admin.custom.builderFormat` (core/formats.ts), else null. */
export function formatProblem(field: FieldShape, value: unknown): string | null {
  return formatMessage(field.admin?.custom?.builderFormat, value)
}

export type NumberLimits = { min?: number; max?: number; required?: boolean }

/** "Enter a number from 1 to 100." The same text for a wrong number and for text that is not a number. */
export function numberMessage({ min, max }: NumberLimits): string {
  if (min !== undefined && max !== undefined) return `Enter a number from ${min} to ${max}.`
  if (min !== undefined) return `Enter a number of ${min} or more.`
  if (max !== undefined) return `Enter a number of ${max} or less.`
  return 'Enter a number.'
}

const NUMBER_TEXT = /^[-+]?(?:\d+\.?\d*|\.\d+)$/

/**
 * Reads the text of a number input. Empty text means "no value" (the block default), unless the
 * field is required. `partial` marks text that may still become a number while the user types
 * ("", "-", "abc"): the inspector shows its message only after the input loses focus.
 */
export function parseNumberText(
  text: string,
  limits: NumberLimits,
): { ok: true; value: number | null } | { ok: false; error: string; partial: boolean } {
  const raw = text.trim()
  if (!raw) return limits.required ? { ok: false, error: numberMessage(limits), partial: true } : { ok: true, value: null }
  if (!NUMBER_TEXT.test(raw)) return { ok: false, error: numberMessage(limits), partial: true }
  const value = Number(raw)
  if (!Number.isFinite(value)) return { ok: false, error: numberMessage(limits), partial: false }
  if ((limits.min !== undefined && value < limits.min) || (limits.max !== undefined && value > limits.max)) {
    return { ok: false, error: numberMessage(limits), partial: false }
  }
  return { ok: true, value }
}

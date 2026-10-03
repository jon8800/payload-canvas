// Pure helpers for the block inspector: field visibility and value adapters for Payload's inputs.
// No React here, so they are unit tested.

import type { CollectionSlug, ValueWithRelation } from 'payload'

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

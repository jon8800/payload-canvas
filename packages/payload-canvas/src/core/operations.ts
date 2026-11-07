// Pure layout operations. No React, no Payload. Every edit goes through here.
// Functions never mutate their input: they copy the path to the changed list and share the rest.
//
// Canonical form (see tree.ts): no empty slot lists, no empty `slots`/`props`/`bindings` objects,
// `hidden` only when true. Operations keep this form. When a slot list becomes empty, its key is
// deleted. This is what makes every inverse restore the exact previous layout.

import { checkAttrs, htmlIdClash, htmlIdsOf, patchAttrs, withoutTakenHtmlIds } from './attrs'
import { placementError, slotFullError } from './blocks'
import { createId } from './ids'
import { checkMotion, motionInverse, patchMotion } from './motion'
import { checkSectionOrigin } from './sectionOrigin'
import { checkVisibility } from './visibility'
import { DEFAULT_SLOT, indexLayout, isPlainObject, subtreeIds, type IndexedBlock } from './tree'
import type { ApplyResult, Block, BlockDefinition, Layout, Operation, Position } from './types'

/**
 * With `blocks`, `insert` and `move` also check the slot rules (`allow`, `max`, and `disallow` of
 * every ancestor slot, for the whole placed subtree), and `duplicate` checks the slot's `max`.
 * Without it they check only the tree shape.
 */
export type ApplyOptions = { blocks?: readonly BlockDefinition[] }

type Ok = Extract<ApplyResult, { ok: true }>
type Fail = Extract<ApplyResult, { ok: false }>

const fail = (error: string): Fail => ({ ok: false, error })

/** Applies one operation. Never mutates the input. Returns the inverse operations for undo. */
export function applyOperation(layout: Layout, op: Operation, options?: ApplyOptions): ApplyResult {
  if (!isPlainObject(op)) return fail('Operation must be an object')
  switch (op.type) {
    case 'insert':
      return insert(layout, op.block, op.to, options?.blocks)
    case 'move':
      return move(layout, op.id, op.to, options?.blocks)
    case 'remove':
      return remove(layout, op.id)
    case 'duplicate':
      return duplicate(layout, op.id, op.newId, options?.blocks)
    case 'update':
      return update(layout, op)
    default:
      return fail(`Unknown operation type "${String((op as { type?: unknown }).type)}"`)
  }
}

/** Applies operations in order. Fails as a whole if any fails. `inverse` undoes all of them. */
export function applyOperations(layout: Layout, ops: Operation[], options?: ApplyOptions): ApplyResult {
  if (!Array.isArray(ops)) return fail('Operations must be an array')
  let current = layout
  let inverse: Operation[] = []
  for (let i = 0; i < ops.length; i++) {
    const result = applyOperation(current, ops[i], options)
    if (!result.ok) return fail(`Operation ${i} (${describe(ops[i])}): ${result.error}`)
    current = result.layout
    inverse = [...result.inverse, ...inverse]
  }
  return { ok: true, layout: current, inverse }
}

function describe(op: unknown): string {
  return isPlainObject(op) && typeof op.type === 'string' ? op.type : 'invalid'
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function insert(layout: Layout, rawBlock: unknown, rawTo: unknown, blocks?: readonly BlockDefinition[]): ApplyResult {
  const index = indexLayout(layout)
  const checked = checkBlock(rawBlock, new Set(index.keys()))
  if (typeof checked === 'string') return fail(checked)
  const to = checkPosition(rawTo, index)
  if (typeof to === 'string') return fail(to)
  const length = listOf(layout, index, to.parentId, to.slot).length
  if (to.index > length) return fail(`Index ${to.index} is out of range (0-${length})`)
  const refused = blocks ? placementError(blocks, layout, to.parentId, to.slot, checked, index) : null
  if (refused) return fail(refused)
  const clash = htmlIdClash(layout, checked)
  if (clash) return fail(clash)

  const next = mapList(layout, to.parentId, to.slot, (list) => insertAt(list, to.index, checked))
  return ok(next, [{ type: 'remove', id: checked.id }])
}

function remove(layout: Layout, id: unknown): ApplyResult {
  const index = indexLayout(layout)
  const entry = getEntry(index, id)
  if (typeof entry === 'string') return fail(entry)
  const next = mapList(layout, entry.parentId, entry.slot, (list) => removeAt(list, entry.index))
  return ok(next, [{ type: 'insert', block: entry.block, to: locationOf(entry) }])
}

function move(layout: Layout, id: unknown, rawTo: unknown, blocks?: readonly BlockDefinition[]): ApplyResult {
  const index = indexLayout(layout)
  const entry = getEntry(index, id)
  if (typeof entry === 'string') return fail(entry)
  const to = checkPosition(rawTo, index)
  if (typeof to === 'string') return fail(to)
  if (to.parentId !== null && subtreeIds(entry.block).includes(to.parentId)) {
    return fail('Cannot move a block into itself or its own descendants')
  }
  const refused = blocks ? placementError(blocks, layout, to.parentId, to.slot, entry.block, index) : null
  if (refused) return fail(refused)

  const sameList = to.parentId === entry.parentId && to.slot === entry.slot
  const targetLength = listOf(layout, index, to.parentId, to.slot).length - (sameList ? 1 : 0)
  if (to.index > targetLength) return fail(`Index ${to.index} is out of range (0-${targetLength})`)

  const removed = mapList(layout, entry.parentId, entry.slot, (list) => removeAt(list, entry.index))
  const next = mapList(removed, to.parentId, to.slot, (list) => insertAt(list, to.index, entry.block))
  return ok(next, [{ type: 'move', id: entry.block.id, to: locationOf(entry) }])
}

function duplicate(layout: Layout, id: unknown, newId: unknown, blocks?: readonly BlockDefinition[]): ApplyResult {
  const index = indexLayout(layout)
  const entry = getEntry(index, id)
  if (typeof entry === 'string') return fail(entry)
  if (typeof newId !== 'string' || newId === '') return fail('`newId` must be a non-empty string')
  if (index.has(newId)) return fail(`Block id "${newId}" already exists`)
  const parent = entry.parentId === null ? undefined : index.get(entry.parentId)?.block
  const full = blocks && parent ? slotFullError(blocks, parent, entry.slot) : null
  if (full) return fail(full)

  const used = new Set(index.keys())
  used.add(newId)
  // The copy leaves out the HTML ids: each id is unique in the layout.
  const copy = withoutTakenHtmlIds(cloneWithNewIds(entry.block, newId, used), htmlIdsOf(layout.blocks))
  const next = mapList(layout, entry.parentId, entry.slot, (list) => insertAt(list, entry.index + 1, copy))
  return ok(next, [{ type: 'remove', id: newId }])
}

function update(layout: Layout, op: Extract<Operation, { type: 'update' }>): ApplyResult {
  const index = indexLayout(layout)
  const entry = getEntry(index, op.id)
  if (typeof entry === 'string') return fail(entry)
  const before = entry.block
  const next: Block = { ...before }
  const inverse: Extract<Operation, { type: 'update' }> = { type: 'update', id: before.id }

  if (op.locale !== undefined && (typeof op.locale !== 'string' || op.locale === '')) return fail('`locale` must be a locale code')
  if (op.props !== undefined || op.unsetProps !== undefined) {
    if (op.props !== undefined && !isPlainObject(op.props)) return fail('`props` must be an object')
    if (op.unsetProps !== undefined && !isStringArray(op.unsetProps)) return fail('`unsetProps` must be an array of strings')
    // With a locale, the values are that locale's own values (`block.locales[locale]`).
    const locale = op.locale
    if (locale !== undefined) inverse.locale = locale
    const oldProps = (locale === undefined ? before.props : before.locales?.[locale]) ?? {}
    const props: Record<string, unknown> = { ...oldProps }
    const touched = new Set<string>()
    for (const [key, value] of Object.entries(op.props ?? {})) {
      if (value === undefined) continue
      setOwn(props, key, value)
      touched.add(key)
    }
    for (const key of op.unsetProps ?? []) {
      delete props[key]
      touched.add(key)
    }
    const invProps: Record<string, unknown> = {}
    const invUnset: string[] = []
    for (const key of touched) {
      if (Object.hasOwn(oldProps, key)) setOwn(invProps, key, oldProps[key])
      else if (Object.hasOwn(props, key)) invUnset.push(key)
    }
    if (Object.keys(invProps).length > 0) inverse.props = invProps
    if (invUnset.length > 0) inverse.unsetProps = invUnset
    if (locale === undefined) {
      if (Object.keys(props).length > 0) next.props = props
      else delete next.props
    } else {
      const locales: Record<string, Record<string, unknown>> = { ...before.locales }
      if (Object.keys(props).length > 0) setOwn(locales, locale, props)
      else delete locales[locale]
      if (Object.keys(locales).length > 0) next.locales = locales
      else delete next.locales
    }
  }

  if (op.className !== undefined || op.addClassName !== undefined || op.removeClassName !== undefined) {
    if (op.className !== undefined && op.className !== null && typeof op.className !== 'string') return fail('`className` must be a string or null')
    if (op.addClassName !== undefined && typeof op.addClassName !== 'string') return fail('`addClassName` must be a string of classes separated by spaces')
    if (op.removeClassName !== undefined && typeof op.removeClassName !== 'string') return fail('`removeClassName` must be a string of classes separated by spaces')
    // The inverse sets the whole old list, so undo restores the exact string (order and spaces).
    inverse.className = before.className ?? null
    const className = patchClassName(op.className === undefined ? before.className : op.className, op.addClassName, op.removeClassName)
    if (className === null) delete next.className
    else next.className = className
  }

  if (op.hidden !== undefined) {
    if (typeof op.hidden !== 'boolean') return fail('`hidden` must be a boolean')
    inverse.hidden = before.hidden === true
    if (op.hidden) next.hidden = true
    else delete next.hidden
  }

  if (op.editableItems !== undefined) {
    if (typeof op.editableItems !== 'boolean') return fail('`editableItems` must be a boolean')
    inverse.editableItems = before.editableItems === true
    if (op.editableItems) next.editableItems = true
    else delete next.editableItems
  }

  if (op.label !== undefined) {
    if (op.label !== null && typeof op.label !== 'string') return fail('`label` must be a string or null')
    inverse.label = before.label ?? null
    const label = op.label?.trim() ?? ''
    if (label) next.label = label
    else delete next.label
  }

  if (op.bindings !== undefined) {
    if (!isPlainObject(op.bindings)) return fail('`bindings` must be an object')
    const oldBindings = before.bindings ?? {}
    const bindings: Record<string, string> = { ...oldBindings }
    const invBindings: Record<string, string | null> = {}
    for (const [key, path] of Object.entries(op.bindings)) {
      if (path !== null && typeof path !== 'string') return fail(`Binding "${key}" must be a string or null`)
      setOwn(invBindings, key, Object.hasOwn(oldBindings, key) ? oldBindings[key] : null)
      if (path === null) delete bindings[key]
      else setOwn(bindings, key, path)
    }
    inverse.bindings = invBindings
    if (Object.keys(bindings).length > 0) next.bindings = bindings
    else delete next.bindings
  }

  if (op.visibility !== undefined) {
    const visibility = checkVisibility(op.visibility)
    if (typeof visibility === 'string') return fail(visibility)
    inverse.visibility = before.visibility ? structuredClone(before.visibility) : null
    if (visibility) next.visibility = visibility
    else delete next.visibility
  }

  if (op.motion !== undefined) {
    const motion = patchMotion(before.motion, op.motion)
    if (typeof motion === 'string') return fail(motion)
    inverse.motion = motionInverse(before.motion, op.motion as Record<string, unknown> | null)
    if (motion) next.motion = motion
    else delete next.motion
  }

  if (op.partClassName !== undefined) {
    if (!isPlainObject(op.partClassName)) return fail('`partClassName` must be an object of part name -> classes')
    const old = before.partClassName ?? {}
    const merged: Record<string, string> = { ...old }
    const inv: Record<string, string | null> = {}
    for (const [part, value] of Object.entries(op.partClassName)) {
      if (value !== null && typeof value !== 'string') return fail(`partClassName.${part} must be a string or null`)
      setOwn(inv, part, Object.hasOwn(old, part) ? old[part] : null)
      if (value?.trim()) setOwn(merged, part, value)
      else delete merged[part]
    }
    inverse.partClassName = inv
    if (Object.keys(merged).length > 0) next.partClassName = merged
    else delete next.partClassName
  }

  if (op.attrs !== undefined) {
    const patched = patchAttrs(before.attrs, op.attrs)
    if (typeof patched === 'string') return fail(patched)
    inverse.attrs = patched.inverse
    if (patched.attrs) next.attrs = patched.attrs
    else delete next.attrs
    const id = patched.attrs?.id
    const owner = id && id !== before.attrs?.id ? htmlIdsOf(layout.blocks).get(id) : undefined
    if (owner) return fail(`The HTML id "${id}" is already used by block "${owner}". Every id is unique in a layout.`)
  }

  const result = mapList(layout, entry.parentId, entry.slot, (list) => replaceAt(list, entry.index, next))
  return ok(result, [inverse])
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The class list after `update`: `base` (the new `className`, else the old one), minus the classes
 * in `drop`, plus the classes in `add` that are not there yet (at the end). Without `add` and
 * `drop`, `base` as it is. An empty result is null (no className).
 */
export function patchClassName(base: string | null | undefined, add?: string, drop?: string): string | null {
  if (add === undefined && drop === undefined) return base ?? null
  const removed = new Set(splitClasses(drop))
  const tokens = splitClasses(base).filter((token) => !removed.has(token))
  for (const token of splitClasses(add)) if (!tokens.includes(token)) tokens.push(token)
  return tokens.length > 0 ? tokens.join(' ') : null
}

const splitClasses = (value: string | null | undefined): string[] => (value ?? '').split(/\s+/).filter(Boolean)

function ok(layout: Layout, inverse: Operation[]): Ok {
  return { ok: true, layout, inverse }
}

function getEntry(index: Map<string, IndexedBlock>, id: unknown): IndexedBlock | string {
  if (typeof id !== 'string') return '`id` must be a string'
  return index.get(id) ?? `Block "${id}" not found`
}

function locationOf(entry: IndexedBlock): Position {
  return { parentId: entry.parentId, slot: entry.slot, index: entry.index }
}

type CheckedPosition = { parentId: string | null; slot: string; index: number }

function checkPosition(value: unknown, index: Map<string, IndexedBlock>): CheckedPosition | string {
  if (!isPlainObject(value)) return 'Position `to` must be an object'
  const { parentId, slot = DEFAULT_SLOT, index: at } = value
  if (parentId !== null && typeof parentId !== 'string') return '`to.parentId` must be a string or null'
  if (typeof slot !== 'string' || slot === '') return '`to.slot` must be a non-empty string'
  if (typeof at !== 'number' || !Number.isInteger(at) || at < 0) return '`to.index` must be an integer >= 0'
  if (parentId === null && slot !== DEFAULT_SLOT) return `The root list has only the "${DEFAULT_SLOT}" slot`
  if (parentId !== null && !index.has(parentId)) return `Parent block "${parentId}" not found`
  return { parentId, slot, index: at }
}

function listOf(layout: Layout, index: Map<string, IndexedBlock>, parentId: string | null, slot: string): Block[] {
  if (parentId === null) return layout.blocks
  return index.get(parentId)?.block.slots?.[slot] ?? []
}

/**
 * Replaces the list at (parentId, slot) with `fn(list)`, copying only the path to it.
 * The caller has already checked that the parent exists.
 */
function mapList(layout: Layout, parentId: string | null, slot: string, fn: (list: Block[]) => Block[]): Layout {
  if (parentId === null) return { ...layout, blocks: fn(layout.blocks) }
  const blocks = mapBlock(layout.blocks, parentId, (block) => withSlot(block, slot, fn(block.slots?.[slot] ?? [])))
  if (!blocks) throw new Error(`Internal error: parent "${parentId}" vanished`)
  return { ...layout, blocks }
}

function mapBlock(blocks: Block[], id: string, fn: (block: Block) => Block): Block[] | null {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.id === id) return replaceAt(blocks, i, fn(block))
    if (!block.slots) continue
    for (const [name, children] of Object.entries(block.slots)) {
      const updated = mapBlock(children, id, fn)
      if (updated) return replaceAt(blocks, i, { ...block, slots: { ...block.slots, [name]: updated } })
    }
  }
  return null
}

/** Sets a slot list, deleting the key when the list is empty and `slots` when no keys are left. */
function withSlot(block: Block, slot: string, list: Block[]): Block {
  const slots = { ...block.slots }
  if (list.length > 0) setOwn(slots, slot, list)
  else delete slots[slot]
  const next = { ...block }
  if (Object.keys(slots).length > 0) next.slots = slots
  else delete next.slots
  return next
}

function insertAt<T>(list: T[], index: number, item: T): T[] {
  return [...list.slice(0, index), item, ...list.slice(index)]
}

function removeAt<T>(list: T[], index: number): T[] {
  return [...list.slice(0, index), ...list.slice(index + 1)]
}

function replaceAt<T>(list: T[], index: number, item: T): T[] {
  const copy = list.slice()
  copy[index] = item
  return copy
}

/** Defines an own property, so a key like "__proto__" cannot change the object's prototype. */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function cloneWithNewIds(block: Block, id: string, used: Set<string>): Block {
  const clone: Block = { ...block, id }
  if (block.props) clone.props = structuredClone(block.props)
  if (block.locales) clone.locales = structuredClone(block.locales)
  if (block.bindings) clone.bindings = { ...block.bindings }
  if (block.attrs) clone.attrs = { ...block.attrs }
  if (block.visibility) clone.visibility = structuredClone(block.visibility)
  if (block.partClassName) clone.partClassName = { ...block.partClassName }
  if (block.slots) {
    clone.slots = Object.fromEntries(
      Object.entries(block.slots).map(([name, children]) => [
        name,
        children.map((child) => cloneWithNewIds(child, freshId(used), used)),
      ]),
    )
  }
  return clone
}

function freshId(used: Set<string>): string {
  let id = createId()
  while (used.has(id)) id = createId()
  used.add(id)
  return id
}

/**
 * Checks a block that is about to be inserted and returns it in canonical form.
 * Returns an error message when the shape is wrong or an id is already used.
 */
function checkBlock(value: unknown, used: Set<string>, path = 'block'): Block | string {
  if (!isPlainObject(value)) return `${path} must be an object`
  const { id, type, props, className, slots, bindings, hidden, label, locales, motion, attrs, visibility, partClassName, section, editableItems } = value
  if (typeof id !== 'string' || id === '') return `${path}.id must be a non-empty string`
  if (used.has(id)) return `Block id "${id}" already exists`
  used.add(id)
  if (typeof type !== 'string' || type === '') return `${path}.type must be a non-empty string`
  const block: Block = { id, type }

  if (props !== undefined) {
    if (!isPlainObject(props)) return `${path}.props must be an object`
    const clean = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined))
    if (Object.keys(clean).length > 0) block.props = clean
  }
  if (className !== undefined) {
    if (typeof className !== 'string') return `${path}.className must be a string`
    block.className = className
  }
  if (slots !== undefined) {
    if (!isPlainObject(slots)) return `${path}.slots must be an object`
    const clean: Record<string, Block[]> = {}
    for (const [name, children] of Object.entries(slots)) {
      if (!Array.isArray(children)) return `${path}.slots.${name} must be an array`
      const list: Block[] = []
      for (let i = 0; i < children.length; i++) {
        const child = checkBlock(children[i], used, `${path}.slots.${name}[${i}]`)
        if (typeof child === 'string') return child
        list.push(child)
      }
      if (list.length > 0) setOwn(clean, name, list)
    }
    if (Object.keys(clean).length > 0) block.slots = clean
  }
  if (bindings !== undefined) {
    if (!isPlainObject(bindings) || !Object.values(bindings).every((v) => typeof v === 'string')) {
      return `${path}.bindings must be an object of strings`
    }
    if (Object.keys(bindings).length > 0) block.bindings = { ...(bindings as Record<string, string>) }
  }
  if (hidden !== undefined) {
    if (typeof hidden !== 'boolean') return `${path}.hidden must be a boolean`
    if (hidden) block.hidden = true
  }
  if (editableItems !== undefined) {
    if (typeof editableItems !== 'boolean') return `${path}.editableItems must be a boolean`
    if (editableItems) block.editableItems = true
  }
  if (label !== undefined && label !== null) {
    if (typeof label !== 'string') return `${path}.label must be a string`
    if (label.trim()) block.label = label.trim()
  }
  if (locales !== undefined) {
    if (!isPlainObject(locales)) return `${path}.locales must be an object of props per locale`
    const clean: Record<string, Record<string, unknown>> = {}
    for (const [code, values] of Object.entries(locales)) {
      if (!isPlainObject(values)) return `${path}.locales.${code} must be an object`
      const kept = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
      if (Object.keys(kept).length > 0) setOwn(clean, code, kept)
    }
    if (Object.keys(clean).length > 0) block.locales = clean
  }
  if (motion !== undefined && motion !== null) {
    const checked = checkMotion(motion)
    if (typeof checked === 'string') return `${path}.${checked}`
    if (checked) block.motion = checked
  }
  if (partClassName !== undefined) {
    if (!isPlainObject(partClassName) || !Object.values(partClassName).every((v) => typeof v === 'string')) {
      return `${path}.partClassName must be an object of part name -> classes`
    }
    const kept = Object.fromEntries(Object.entries(partClassName as Record<string, string>).filter(([, v]) => v.trim()))
    if (Object.keys(kept).length > 0) block.partClassName = kept
  }
  const checkedAttrs = checkAttrs(attrs)
  if (typeof checkedAttrs === 'string') return `${path}.${checkedAttrs}`
  if (checkedAttrs) block.attrs = checkedAttrs
  const checkedVisibility = checkVisibility(visibility)
  if (typeof checkedVisibility === 'string') return `${path}.${checkedVisibility}`
  if (checkedVisibility) block.visibility = checkedVisibility
  const origin = checkSectionOrigin(section)
  if (typeof origin === 'string') return `${path}.${origin}`
  if (origin) block.section = origin
  return block
}

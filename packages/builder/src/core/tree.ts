import { createId } from './ids'
import type { Block, Layout } from './types'

/** Slot name used when a position or a location does not name one. The root list uses it too. */
export const DEFAULT_SLOT = 'children'

/** Where a block sits. `parentId: null` means the root list. */
export type BlockLocation = { parentId: string | null; slot: string; index: number; depth: number }

/** A block plus its location. Internal helper type for the core modules. */
export type IndexedBlock = BlockLocation & { block: Block }

export function findBlock(layout: Layout, id: string): Block | null {
  return findEntry(layout, id)?.block ?? null
}

export function findLocation(layout: Layout, id: string): BlockLocation | null {
  const entry = findEntry(layout, id)
  if (!entry) return null
  return { parentId: entry.parentId, slot: entry.slot, index: entry.index, depth: entry.depth }
}

/** Depth-first walk. Return `false` from `fn` to skip a block's children. */
export function walkBlocks(
  layout: Layout,
  fn: (block: Block, location: BlockLocation) => void | false,
): void {
  const visit = (blocks: Block[], parentId: string | null, slot: string, depth: number) => {
    blocks.forEach((block, index) => {
      if (fn(block, { parentId, slot, index, depth }) === false) return
      for (const [name, children] of Object.entries(block.slots ?? {})) {
        visit(children, block.id, name, depth + 1)
      }
    })
  }
  visit(layout.blocks, null, DEFAULT_SLOT, 0)
}

/** Every block id mapped to its block and location. */
export function indexLayout(layout: Layout): Map<string, IndexedBlock> {
  const map = new Map<string, IndexedBlock>()
  walkBlocks(layout, (block, location) => {
    map.set(block.id, { ...location, block })
  })
  return map
}

function findEntry(layout: Layout, id: string): IndexedBlock | null {
  let found: IndexedBlock | null = null
  walkBlocks(layout, (block, location) => {
    if (found) return false
    if (block.id === id) found = { ...location, block }
  })
  return found
}

/** True when `id` is `ancestorId` itself or sits anywhere inside it. */
export function isSelfOrDescendant(layout: Layout, ancestorId: string, id: string | null): boolean {
  if (id === null) return false
  if (id === ancestorId) return true
  const ancestor = findBlock(layout, ancestorId)
  if (!ancestor) return false
  return subtreeIds(ancestor).includes(id)
}

/** Ids of a block and all its descendants, depth first. */
export function subtreeIds(block: Block, out: string[] = []): string[] {
  out.push(block.id)
  for (const children of Object.values(block.slots ?? {})) {
    for (const child of children) subtreeIds(child, out)
  }
  return out
}

// ---------------------------------------------------------------------------
// normalizeLayout
// ---------------------------------------------------------------------------

// Canonical form (produced here and kept by every operation):
// - no empty `props`, `bindings` or `slots` objects, and no empty slot lists
// - `hidden` is stored only when true, `label` only when non-empty (trimmed)
// - every id is a non-empty string, unique in the layout
// The operations module relies on this form for exact undo.

const BLOCK_KEYS = new Set(['id', 'type', 'blockType', 'blockName', 'props', 'className', 'slots', 'children', 'bindings', 'hidden', 'label'])

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Turns any stored value (null, old shapes, garbage) into a valid Layout. Never throws. */
export function normalizeLayout(value: unknown): Layout {
  try {
    return { version: 1, blocks: normalizeList(blocksOf(value), new Set()) }
  } catch {
    return { version: 1, blocks: [] }
  }
}

function blocksOf(value: unknown): unknown[] {
  let data = value
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return []
    }
  }
  if (Array.isArray(data)) return data
  if (isPlainObject(data) && Array.isArray(data.blocks)) return data.blocks
  return []
}

function normalizeList(list: unknown[], seen: Set<string>): Block[] {
  const out: Block[] = []
  for (const item of list) {
    const block = normalizeBlock(item, seen)
    if (block) out.push(block)
  }
  return out
}

function normalizeBlock(value: unknown, seen: Set<string>): Block | null {
  if (!isPlainObject(value)) return null
  const rawType = typeof value.type === 'string' && value.type ? value.type : value.blockType
  if (typeof rawType !== 'string' || rawType.trim() === '') return null

  const block: Block = { id: uniqueId(value.id, seen), type: rawType }

  const props = normalizeProps(value)
  if (props) block.props = props

  if (typeof value.className === 'string' && value.className.trim() !== '') block.className = value.className

  const rawSlots = isPlainObject(value.slots)
    ? value.slots
    : Array.isArray(value.children)
      ? { [DEFAULT_SLOT]: value.children }
      : null
  if (rawSlots) {
    const slots: Record<string, Block[]> = {}
    for (const [name, children] of Object.entries(rawSlots)) {
      if (!Array.isArray(children)) continue
      const list = normalizeList(children, seen)
      if (list.length > 0) slots[name] = list
    }
    if (Object.keys(slots).length > 0) block.slots = slots
  }

  if (isPlainObject(value.bindings)) {
    const bindings: Record<string, string> = {}
    for (const [key, path] of Object.entries(value.bindings)) {
      if (typeof path === 'string' && path !== '') bindings[key] = path
    }
    if (Object.keys(bindings).length > 0) block.bindings = bindings
  }

  if (value.hidden === true) block.hidden = true
  if (typeof value.label === 'string' && value.label.trim() !== '') block.label = value.label.trim()
  return block
}

function normalizeProps(value: Record<string, unknown>): Record<string, unknown> | null {
  let source: Record<string, unknown> | null = null
  if (isPlainObject(value.props)) {
    source = value.props
  } else if (value.props === undefined && typeof value.blockType === 'string') {
    // Old Payload `blocks` field shape: field values sit next to `blockType`.
    source = Object.fromEntries(Object.entries(value).filter(([key]) => !BLOCK_KEYS.has(key)))
  }
  if (!source) return null
  const props = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined))
  return Object.keys(props).length > 0 ? props : null
}

function uniqueId(raw: unknown, seen: Set<string>): string {
  let id = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'string' ? raw : ''
  if (id.trim() === '' || seen.has(id)) {
    do id = createId()
    while (seen.has(id))
  }
  seen.add(id)
  return id
}

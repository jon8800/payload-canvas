// Presence helpers: cursor mapping, initials, changed blocks. Pure TypeScript, unit-tested.

import { deepestBlockAt } from '../../../core'
import type { CanvasMeasurement, Layout, Operation, Point } from '../../../core/types'
import type { Awareness, CollaboratorCursor } from '../../../live/types'

/** Color for changes whose author is not a known collaborator (e.g. an AI that already left). */
export const FALLBACK_COLOR = '#8b5cf6'

/** Ids of the blocks an operation adds or changes. Removed blocks have nothing left to flash. */
export function changedIds(ops: Operation[]): string[] {
  const ids = new Set<string>()
  for (const op of ops) {
    if (op.type === 'insert') ids.add(op.block.id)
    else if (op.type === 'move' || op.type === 'update') ids.add(op.id)
    else if (op.type === 'duplicate') ids.add(op.newId)
  }
  return [...ids]
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Where the pointer is, relative to the deepest block under it, so it maps to the same spot on
 * another editor's canvas (another width, another scroll). Over no block: relative to the page
 * (x as a share of the viewport width, y as a share of the document height).
 * `p` is in iframe viewport coordinates.
 */
export function cursorAt(layout: Layout, measurement: CanvasMeasurement, p: Point): CollaboratorCursor {
  const id = deepestBlockAt(layout, measurement, p)
  const rect = id ? measurement.blocks.find((b) => b.id === id)?.rect : undefined
  if (id && rect && rect.width > 0 && rect.height > 0) {
    return { blockId: id, x: clamp01((p.x - rect.x) / rect.width), y: clamp01((p.y - rect.y) / rect.height) }
  }
  const width = measurement.viewport.width || 1
  const height = measurement.documentHeight || measurement.viewport.height || 1
  return { blockId: null, x: clamp01(p.x / width), y: clamp01((p.y + measurement.scroll.y) / height) }
}

/** The point (iframe viewport coordinates) of a collaborator's cursor on this canvas, or null. */
export function cursorPoint(measurement: CanvasMeasurement, cursor: CollaboratorCursor): Point | null {
  if (cursor.blockId === null) {
    const height = measurement.documentHeight || measurement.viewport.height
    return { x: cursor.x * measurement.viewport.width, y: cursor.y * height - measurement.scroll.y }
  }
  const rect = measurement.blocks.find((b) => b.id === cursor.blockId)?.rect
  if (!rect) return null
  return { x: rect.x + cursor.x * rect.width, y: rect.y + cursor.y * rect.height }
}

/** "Ana Lima" -> "AL", "builder-dev2@local.test" -> "BD". */
export function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** A short display name: the part before "@" for emails. */
export function shortName(name: string): string {
  return name.includes('@') ? name.replace(/@.*/, '') : name
}

const allDifferent = (list: string[]) => new Set(list).size === list.length

/**
 * Initials that differ between people. Names that give the same two letters ("builder-dev" and
 * "builder-dev2" are both "BD") get more: first the trailing digits ("BD" and "BD2"), then the
 * first and last character ("BV" and "B2"), then a counter. Returns a map from each name to its
 * initials. A name that appears twice (two tabs of one person) keeps one entry.
 */
export function distinctInitials(names: string[]): Map<string, string> {
  const groups = new Map<string, string[]>()
  for (const name of new Set(names)) {
    const base = initials(name)
    groups.set(base, [...(groups.get(base) ?? []), name])
  }

  const strategies: Array<(name: string, base: string) => string> = [
    (name, base) => base + (/\d+$/.exec(shortName(name).trim())?.[0] ?? ''),
    (name) => {
      const flat = shortName(name).trim()
      return ((flat[0] ?? '?') + (flat.length > 1 ? flat.at(-1)! : '')).toUpperCase()
    },
  ]

  const result = new Map<string, string>()
  for (const [base, group] of groups) {
    if (group.length === 1) {
      result.set(group[0]!, base)
      continue
    }
    let chosen: string[] | null = null
    for (const strategy of strategies) {
      const candidates = group.map((name) => strategy(name, base))
      if (!allDifferent(candidates)) continue
      chosen = candidates
      break
    }
    chosen ??= group.map((_, i) => `${base}${i + 1}`)
    group.forEach((name, i) => result.set(name, chosen[i]!))
  }

  // Last guard: a generated value (like "BD2") may equal another person's plain initials.
  const taken = new Set<string>()
  for (const [name, value] of result) {
    let next = value
    for (let n = 2; taken.has(next); n++) next = `${value}${n}`
    taken.add(next)
    result.set(name, next)
  }
  return result
}

export const EMPTY_AWARENESS: Awareness = { selectedId: null, hoveredId: null, cursor: null, canvasWidth: null }

function sameCursor(a: CollaboratorCursor | null, b: CollaboratorCursor | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.blockId === b.blockId && Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001
}

export function sameAwareness(a: Awareness | null, b: Awareness | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.selectedId === b.selectedId &&
    a.hoveredId === b.hoveredId &&
    a.canvasWidth === b.canvasWidth &&
    (a.locale ?? null) === (b.locale ?? null) &&
    sameCursor(a.cursor, b.cursor)
  )
}

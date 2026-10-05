// Which field an inspector edit changed, for undo grouping. Typing in one field merges into one
// undo step; an edit of another field (another array row's label, a sibling in a group) starts a
// new one. Pure: no React, no DOM.

const MAX_DEPTH = 8

const isContainer = (value: unknown): value is Record<string, unknown> | unknown[] => typeof value === 'object' && value !== null

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!isContainer(a) || !isContainer(b)) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * The path inside a prop value from `before` to `after` where the only change is, e.g.
 * `["2", "label"]` when only the label of the third row changed. Stops where more than one child
 * changed, where the shape changed (rows added or removed), or at a plain value. `[]`: the value as a whole.
 */
export function changedPath(before: unknown, after: unknown, depth = 0): string[] {
  // A group that does not exist yet (the first letter typed into `link.url`) counts as empty, so
  // its first edit has the same path as the next ones.
  if (before == null && isContainer(after) && !Array.isArray(after)) before = {}
  if (after == null && isContainer(before) && !Array.isArray(before)) after = {}
  if (depth >= MAX_DEPTH || !isContainer(before) || !isContainer(after)) return []
  if (Array.isArray(before) !== Array.isArray(after)) return []
  let keys: string[]
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) return []
    keys = after.map((_, i) => String(i))
  } else {
    keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  }
  const b = before as Record<string, unknown>
  const a = after as Record<string, unknown>
  let found: string | null = null
  for (const key of keys) {
    if (same(b[key], a[key])) continue
    if (found !== null) return []
    found = key
  }
  if (found === null) return []
  return [found, ...changedPath(b[found], a[found], depth + 1)]
}

/** The undo merge key of an inspector edit of one prop: one key per field. */
export function fieldMergeKey(blockId: string, key: string, before: unknown, after: unknown): string {
  return `props:${blockId}:${[key, ...changedPath(before, after)].join('.')}`
}

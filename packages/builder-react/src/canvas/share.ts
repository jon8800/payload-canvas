// Structural sharing for the canvas. Every layout from the admin arrives as a fresh copy
// (`postMessage` clones it), and data loading copies blocks too. `shareStructure` gives back the
// previous object for every part that did not change, so memoized block components skip the
// blocks the edit did not touch.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Returns `next`, with every subtree that deep-equals the same place in `prev` replaced by the
 * `prev` object. Plain objects and arrays are compared; other values by `Object.is`. Never mutates.
 * When nothing changed, returns `prev` itself.
 */
export function shareStructure<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return next
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length
    const out = next.map((item: unknown, i) => {
      const value = shareStructure(prev[i], item)
      if (value !== prev[i]) same = false
      return value
    })
    return (same ? prev : out) as T
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const keys = Object.keys(next)
    let same = keys.length === Object.keys(prev).length
    const out: Record<string, unknown> = {}
    for (const key of keys) {
      const value = shareStructure(prev[key], next[key])
      if (value !== prev[key] || !(key in prev)) same = false
      out[key] = value
    }
    return (same ? prev : out) as T
  }
  return next
}

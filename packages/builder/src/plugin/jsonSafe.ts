/**
 * Deep-clones a value, keeping only what survives JSON: primitives, arrays and plain objects.
 * Functions (validate, hooks, filterOptions, access), class instances, symbols and `undefined`
 * are dropped. Cycles are cut.
 */
export function toJsonSafe<T>(value: T): T {
  return clone(value, new WeakSet()) as T
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function clone(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) return null
  const type = typeof value
  if (type === 'string' || type === 'boolean') return value
  if (type === 'number') return Number.isFinite(value) ? value : undefined
  if (type !== 'object') return undefined

  const obj = value as object
  if (seen.has(obj)) return undefined
  seen.add(obj)

  try {
    if (Array.isArray(obj)) {
      return obj.map((item) => clone(item, seen)).filter((item) => item !== undefined)
    }
    if (!isPlainObject(obj)) return undefined

    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(obj)) {
      const cloned = clone(item, seen)
      if (cloned !== undefined) out[key] = cloned
    }
    return out
  } finally {
    seen.delete(obj)
  }
}

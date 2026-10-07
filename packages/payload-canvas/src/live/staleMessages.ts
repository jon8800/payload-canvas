// The field error a rejected stale save puts on each field someone else changed (see
// fieldsGuard.ts), and the label of a top-level field. Pure, with no imports: the settings drawer
// reads these messages back from the form state to show its "Not saved" banner.

const PREFIX = 'Not saved. '
const SUFFIX = ' changed this after you opened the form.'

/** The field error on a field that `who` changed after the form was loaded. */
export function staleFieldMessage(who: string): string {
  return `${PREFIX}${who}${SUFFIX}`
}

/** Who changed the field, when `message` is a stale-save field error. Else null. */
export function staleFieldAuthor(message: unknown): string | null {
  if (typeof message !== 'string' || !message.startsWith(PREFIX) || !message.endsWith(SUFFIX)) return null
  const who = message.slice(PREFIX.length, -SUFFIX.length).trim()
  return who || null
}

type FieldLike = { name?: unknown; label?: unknown; fields?: unknown; tabs?: unknown }

/** The label of a top-level field (also inside rows, collapsibles and unnamed tabs), else its name in words. */
export function topFieldLabel(fields: unknown, name: string): string {
  const walk = (list: unknown): FieldLike | undefined => {
    if (!Array.isArray(list)) return undefined
    for (const item of list as FieldLike[]) {
      if (!item || typeof item !== 'object') continue
      if (item.name === name) return item
      if (typeof item.name === 'string') continue
      const nested = Array.isArray(item.tabs) ? walk(item.tabs) : walk(item.fields)
      if (nested) return nested
    }
    return undefined
  }
  const label = walk(fields)?.label
  if (typeof label === 'string' && label) return label
  if (label && typeof label === 'object') {
    const first = (label as Record<string, unknown>).en ?? Object.values(label)[0]
    if (typeof first === 'string' && first) return first
  }
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

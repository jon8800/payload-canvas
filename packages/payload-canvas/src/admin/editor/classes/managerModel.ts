// The class manager's pure helpers: usage per class (with former names) and search.

import type { BuilderClass, ClassUsage } from '../../../classes/shared'

/** Usage of a class under its name and its former names, one entry per document. */
export function usageOf(item: BuilderClass, usage: Record<string, ClassUsage> | null): ClassUsage | null {
  if (!usage) return null
  const documents = new Map<string, ClassUsage['documents'][number]>()
  let blocks = 0
  for (const name of [item.name, ...(item.previousNames ?? [])]) {
    const entry = usage[name]
    if (!entry) continue
    blocks += entry.blocks
    for (const doc of entry.documents) {
      const key = `${doc.collection}:${doc.id}`
      const known = documents.get(key)
      documents.set(key, known ? { ...known, blocks: known.blocks + doc.blocks } : doc)
    }
  }
  return { blocks, documents: [...documents.values()] }
}

/** Classes whose name, label or group contains the query. */
export function filterClasses(list: readonly BuilderClass[], query: string): BuilderClass[] {
  const q = query.trim().toLowerCase().replace(/^\./, '')
  if (!q) return [...list]
  return list.filter((c) => [c.name, c.label, c.group].some((text) => text?.toLowerCase().includes(q)))
}

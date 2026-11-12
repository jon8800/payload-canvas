/**
 * The admin search (Ctrl+K): the shapes the search endpoint returns, and the pure helpers
 * both sides share. Free of React and Payload, so it runs on either side and in tests.
 */

/** One document the search can open. */
export type AdminSearchHit = {
  id: number | string
  title: string
  /** The second line: the other field that matched, such as an email or a slug. */
  subtitle?: string
  href: string
}

/** The hits from one collection, in the order the search shows them. */
export type AdminSearchGroup = {
  slug: string
  label: string
  hits: AdminSearchHit[]
}

export type AdminSearchResponse = { query: string; groups: AdminSearchGroup[] }

/** A query shorter than this returns no documents: one letter matches half of every list. */
export const MIN_QUERY_LENGTH = 2
/** Longer than any title anyone types. Stops a pasted essay reaching the database. */
export const MAX_QUERY_LENGTH = 80
/** Hits per collection. More than this and the right row is below the fold anyway. */
export const HITS_PER_GROUP = 5

/** Trims, collapses inner whitespace and caps the length. Empty when there is nothing to search. */
export function normaliseQuery(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH)
}

/**
 * How well a document answers the query, lower is better: the whole title, then the title's
 * start, then any word's start, then another field's start (an email), then anywhere.
 * Typing "jess" puts "Jess Black" above "Amy Jessup".
 */
export function matchRank(query: string, title: string, fields: Array<string | undefined>): number {
  const q = query.toLowerCase()
  const t = title.toLowerCase()
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  if (t.split(/[\s\-–·,()/._]+/).some((word) => word.startsWith(q))) return 2
  if (fields.some((value) => value?.toLowerCase().startsWith(q))) return 3
  return 4
}

/** A page or action in the search: every collection and global, the dashboard, and "New <thing>". */
export type AdminPageEntry = {
  label: string
  href: string
  /** The sidebar group it sits under. Also searched, so "design" finds "Theme settings". */
  section?: string
}

/**
 * Entries where every word of the query starts a word of their label or section, so "new te"
 * finds "New template" but not "New category" (whose section, "Content", only contains "te").
 * Matches in the label rank first, the label's first word highest.
 */
export function matchPages<T extends AdminPageEntry>(entries: T[], query: string, limit: number): T[] {
  const words = query.toLowerCase().split(' ').filter(Boolean)
  if (!words.length) return []

  const scored: Array<{ entry: T; score: number; index: number }> = []
  entries.forEach((entry, index) => {
    const label = entry.label.toLowerCase()
    const labelWords = label.split(/[\s\-/]+/)
    const sectionWords = (entry.section ?? '').toLowerCase().split(/[\s\-/]+/)
    if (!words.every((word) => [...labelWords, ...sectionWords].some((part) => part.startsWith(word)))) return
    let score = 0
    for (const word of words) {
      if (label.startsWith(word)) score += 3
      else if (labelWords.some((part) => part.startsWith(word))) score += 2
    }
    scored.push({ entry, score, index })
  })

  return scored
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => entry)
}

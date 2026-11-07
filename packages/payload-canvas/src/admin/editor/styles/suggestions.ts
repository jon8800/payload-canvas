// Suggestions of the Classes box: the site's own `@utility` classes (StyleTokens.siteClasses) with
// their labels, then Tailwind's utilities. Pure, so it is tested without React.

import type { SiteClass, StyleTokens } from '../../../core/types'
import type { Suggestion } from './popover'

/** The site classes by group, in CSS order. Classes without a group go under "Other" (or no group when no class has one). */
export function groupSiteClasses(list: readonly SiteClass[]): Array<{ group: string | null; classes: SiteClass[] }> {
  const groups = new Map<string | null, SiteClass[]>()
  const anyGroup = list.some((c) => c.group)
  for (const item of list) {
    const key = item.group ?? (anyGroup ? 'Other' : null)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups].map(([group, classes]) => ({ group, classes }))
}

/** How well a site class matches the query: 0 = name or label starts with it, 1 = contains it, -1 = no match. */
function siteMatch(item: SiteClass, q: string): number {
  const texts = [item.name.toLowerCase(), item.label?.toLowerCase() ?? '']
  if (texts.some((text) => text.startsWith(q) || text.split(/\s+/).some((word) => word.startsWith(q)))) return 0
  return texts.some((text) => text.includes(q)) ? 1 : -1
}

const tailwindCache = new WeakMap<StyleTokens, Suggestion[]>()

/** Tailwind's utilities without the site classes (those come first, with their labels). */
function tailwindSuggestions(tokens: StyleTokens): Suggestion[] {
  let list = tailwindCache.get(tokens)
  if (list) return list
  const site = new Set((tokens.siteClasses ?? []).map((c) => c.name))
  list = tokens.classList.filter((value) => !site.has(value)).map((value) => ({ value }))
  tailwindCache.set(tokens, list)
  return list
}

/** Prefix matches first, then substring matches. */
function filterTailwind(items: Suggestion[], q: string, limit: number): Suggestion[] {
  const starts: Suggestion[] = []
  const contains: Suggestion[] = []
  for (const item of items) {
    if (starts.length >= limit) break
    if (item.value.startsWith(q)) starts.push(item)
    else if (item.value.includes(q)) contains.push(item)
  }
  return [...starts, ...contains].slice(0, limit)
}

/**
 * The suggestions for the word being typed (without its variant prefix). Site classes come first:
 * matched on the class name or the label, grouped by their `@canvas` group in CSS order, each with
 * its label. Tailwind's utilities follow. With an empty query: only the site classes, without the
 * ones in `exclude` (the block has them already).
 */
export function classSuggestions(tokens: StyleTokens, query: string, limit = 60, exclude: ReadonlySet<string> = new Set()): Suggestion[] {
  const q = query.trim().toLowerCase()
  const site = tokens.siteClasses ?? []
  const matched = q ? site.filter((item) => siteMatch(item, q) >= 0) : site.filter((item) => !exclude.has(item.name))
  // Groups stay together; inside the list, groups with a prefix match go first.
  const groups = groupSiteClasses(matched).map(({ group, classes }) => ({
    group,
    classes: q ? classes.toSorted((a, b) => siteMatch(a, q) - siteMatch(b, q)) : classes,
  }))
  const ordered = q ? groups.toSorted((a, b) => siteMatch(a.classes[0]!, q) - siteMatch(b.classes[0]!, q)) : groups
  const own: Suggestion[] = ordered.flatMap(({ group, classes }) =>
    classes.map((item) => ({ value: item.name, ...(item.label ? { label: item.label } : {}), group: group ?? 'Site classes' })),
  )
  if (!q) return own
  return [...own, ...filterTailwind(tailwindSuggestions(tokens), q, Math.max(0, limit - own.length))]
}

/**
 * The site class a class on the block uses, and the variant prefix in front of it: "md:btn-primary"
 * gives `{ prefix: 'md:', site: btn-primary }`. Null for any other class.
 */
export function siteClassOf(name: string, list: readonly SiteClass[] | undefined): { prefix: string; site: SiteClass } | null {
  if (!list?.length) return null
  const prefix = /^(?:[^\s:[\]]+:|!)*/.exec(name)?.[0] ?? ''
  const bare = name.slice(prefix.length).replace(/!$/, '')
  const site = list.find((item) => item.name === bare)
  return site ? { prefix, site } : null
}

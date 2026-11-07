export type NavEntity = {
  slug: string
  type: 'collections' | 'globals'
  label: string
  /** The group Payload gives the entity (its `admin.group`, or "Collections" / "Globals"). */
  group: string
}

export type NavSection = { label: string; entities: NavEntity[] }

/**
 * Puts the entities into the configured groups, in the configured order.
 * Entities that no group lists keep their Payload group, after the configured groups.
 * Empty groups are left out.
 */
export function groupEntities(entities: NavEntity[], groups: Array<{ label: string; slugs: string[] }>): NavSection[] {
  const bySlug = new Map(entities.map((entity) => [entity.slug, entity]))
  const placed = new Set<string>()
  const sections: NavSection[] = []

  for (const group of groups) {
    const list = group.slugs.flatMap((slug) => {
      const entity = bySlug.get(slug)
      if (!entity || placed.has(slug)) return []
      placed.add(slug)
      return [entity]
    })
    if (list.length) sections.push({ label: group.label, entities: list })
  }

  for (const entity of entities) {
    if (placed.has(entity.slug)) continue
    const section = sections.find((item) => item.label === entity.group)
    if (section) section.entities.push(entity)
    else sections.push({ label: entity.group, entities: [entity] })
  }
  return sections
}

/** True when `pathname` is `href` or a page below it (`/admin/collections/pages/12`). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname.startsWith(href) && (pathname.length === href.length || pathname[href.length] === '/')
}

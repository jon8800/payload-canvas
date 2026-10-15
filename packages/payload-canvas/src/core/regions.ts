// Page regions: fixed parts of a page that show ordinary document fields outside the layout.
// Pure helpers shared by the plugin (config check, endpoints), the editor and the canvas.
// See docs/architecture.md section 7, "Page frame and regions".

import { textOf } from './fields'
import { isPlainObject } from './tree'
import type { BlockDefinition, RegionConfig, RegionField } from './types'

/** What a collection's `regions` option names. */
export type RegionOption = {
  /** Unique name. The app's frame marks the region with it: `region('header', …)`. */
  name: string
  /** Shown in the editor. Default: the name, in words. */
  label?: string
  /** Dot paths of the document fields the region shows, e.g. `['title', 'header.image']`. */
  fields: string[]
}

/** Fields the plugin or Payload owns. A region never edits them. */
const SYSTEM_FIELDS = new Set(['id', '_status', 'createdAt', 'updatedAt', 'deletedAt'])

const NAME = /^[A-Za-z][\w-]{0,63}$/
const PATH = /^[A-Za-z_$][\w$-]*(\.[A-Za-z_$][\w$-]*)*$/

type Loose = Record<string, unknown> & { type?: unknown; name?: unknown; fields?: unknown; tabs?: unknown; label?: unknown }

const humanize = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())

/** The fields one level down, with the tab labels on the way. Rows, collapsibles, unnamed groups and unnamed tabs are flattened. */
function levelFields(fields: unknown, tabs: string[] = []): Array<{ field: Loose; tabs: string[] }> {
  const out: Array<{ field: Loose; tabs: string[] }> = []
  for (const raw of Array.isArray(fields) ? fields : []) {
    if (!isPlainObject(raw) || typeof raw.type !== 'string') continue
    const field = raw as Loose
    if (field.type === 'row' || field.type === 'collapsible' || (field.type === 'group' && !field.name)) {
      out.push(...levelFields(field.fields, tabs))
      continue
    }
    if (field.type === 'tabs') {
      for (const tab of Array.isArray(field.tabs) ? field.tabs : []) {
        if (!isPlainObject(tab)) continue
        const name = typeof tab.name === 'string' && tab.name ? tab.name : null
        const label = textOf(tab.label) ?? (name ? humanize(name) : '')
        const inside = label ? [...tabs, label] : tabs
        // A named tab holds its fields under its name, like a group.
        if (name) out.push({ field: { ...tab, type: 'group', name, fields: tab.fields } as Loose, tabs: inside })
        else out.push(...levelFields(tab.fields, inside))
      }
      continue
    }
    if (typeof field.name === 'string' && field.name) out.push({ field, tabs })
  }
  return out
}

/**
 * The region's fields, read from the collection's field configs. Throws a readable error for a
 * name or path the region cannot use. `reserved`: the layout field and the plugin's own fields.
 */
export function resolveRegions(
  collection: string,
  fields: readonly unknown[],
  options: readonly RegionOption[],
  reserved: { fields: ReadonlySet<string>; legacy?: ReadonlySet<string> },
): RegionConfig[] {
  const where = `[websiteBuilder] \`regions\` of "${collection}"`
  const names = new Set<string>()
  const paths = new Map<string, string>()
  return options.map((option) => {
    if (!option || typeof option.name !== 'string' || !NAME.test(option.name)) {
      throw new Error(`${where}: a region needs a \`name\` of letters, digits, "-" or "_" that starts with a letter.`)
    }
    if (names.has(option.name)) throw new Error(`${where}: two regions are named "${option.name}". Region names must be unique.`)
    names.add(option.name)
    if (!Array.isArray(option.fields)) throw new Error(`${where}: region "${option.name}" needs a \`fields\` list (it may be empty).`)
    const resolved = option.fields.map((path): RegionField => {
      const fail = (why: string): never => {
        throw new Error(`${where}: region "${option.name}" names "${String(path)}", ${why}`)
      }
      if (typeof path !== 'string' || !PATH.test(path)) fail('which is not a dot path of field names (for example "title" or "header.title").')
      const segments = path.split('.')
      if (reserved.fields.has(segments[0])) fail('which the builder owns. Regions show other document fields.')
      if (SYSTEM_FIELDS.has(segments[0])) fail('which Payload owns. Regions show fields the editors write.')
      if (reserved.legacy?.has(segments[0])) fail('which is listed in `legacyFields`. Publish keeps the published value of those fields, so region edits would never go live.')
      for (const [other, region] of paths) {
        if (other === path || other.startsWith(`${path}.`) || path.startsWith(`${other}.`)) {
          fail(`which ${region === option.name ? 'the region' : `region "${region}"`} already shows (as "${other}"). Each field belongs to one region.`)
        }
      }
      let level: unknown = fields
      let found: { field: Loose; tabs: string[] } | undefined
      let tabs: string[] = []
      for (let i = 0; i < segments.length; i++) {
        found = levelFields(level, tabs).find((entry) => entry.field.name === segments[i])
        if (!found) fail('which is not a field of the collection.')
        const field = found!.field
        tabs = found!.tabs
        if (field.type === 'ui' || field.type === 'join' || field.virtual) fail(`which is a ${field.virtual ? 'virtual' : String(field.type)} field and stores nothing.`)
        if (i < segments.length - 1) {
          if (field.type !== 'group') fail(`which goes inside a "${String(field.type)}" field. A path may go through groups and named tabs only; name the array or blocks field itself.`)
          level = field.fields
        }
      }
      const field = found!.field
      paths.set(path, option.name)
      return {
        path,
        field: field as RegionField['field'],
        label: textOf(field.label) ?? humanize(String(field.name)),
        tabs,
      }
    })
    return { name: option.name, label: option.label?.trim() || humanize(option.name), fields: resolved }
  })
}

const isIndex = (segment: string) => /^\d+$/.test(segment)

/** A path without its array row numbers: "links.2.label" -> "links.label". */
export const pathWithoutIndexes = (path: string) =>
  path
    .split('.')
    .filter((segment) => !isIndex(segment))
    .join('.')

/**
 * The region and its field that hold a document path: the field's own path, or a path inside it
 * ("links.0.label" inside the "links" array). Null when no region shows it.
 */
export function regionFieldOf(regions: readonly RegionConfig[] | undefined, path: string): { region: RegionConfig; field: RegionField } | null {
  for (const region of regions ?? []) {
    for (const field of region.fields) {
      if (path === field.path || path.startsWith(`${field.path}.`)) return { region, field }
    }
  }
  return null
}

/** The value at a dot path of a document; number segments step into array rows. */
export function valueAtDocPath(doc: unknown, path: string): unknown {
  let current: unknown = doc
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && isIndex(segment)) current = current[Number(segment)]
    else if (isPlainObject(current)) current = current[segment]
    else return undefined
  }
  return current
}

/**
 * Sets the value at a dot path and returns the changed copy (objects and rows on the way are
 * copied). Missing groups are made; a missing array row fails: the path is gone (someone removed
 * the row). Returns `{ ok: false }` then.
 */
export function setDocPath(doc: unknown, path: string, value: unknown): { ok: true; value: Record<string, unknown> } | { ok: false } {
  const set = (current: unknown, segments: string[]): { ok: boolean; value?: unknown } => {
    const [segment, ...rest] = segments
    if (segment === undefined) return { ok: true, value }
    if (Array.isArray(current)) {
      if (!isIndex(segment) || Number(segment) >= current.length) return { ok: false }
      const child = set(current[Number(segment)], rest)
      if (!child.ok) return child
      const next = current.slice()
      next[Number(segment)] = child.value
      return { ok: true, value: next }
    }
    if (isIndex(segment)) return { ok: false }
    const record = isPlainObject(current) ? current : {}
    const child = set(record[segment], rest)
    return child.ok ? { ok: true, value: { ...record, [segment]: child.value } } : child
  }
  const result = set(isPlainObject(doc) ? doc : {}, path.split('.'))
  return result.ok && isPlainObject(result.value) ? { ok: true, value: result.value } : { ok: false }
}

/** The document's values at the regions' paths, as one object of the document's shape. */
export function regionValues(doc: unknown, regions: readonly RegionConfig[] | undefined): Record<string, unknown> {
  let out: Record<string, unknown> = {}
  for (const region of regions ?? []) {
    for (const field of region.fields) {
      const value = valueAtDocPath(doc, field.path)
      if (value === undefined) continue
      const next = setDocPath(out, field.path, value)
      if (next.ok) out = next.value
    }
  }
  return out
}

/** Payload's `select` for the regions' fields (with `updatedAt`), so a read loads nothing else. */
export function regionSelect(regions: readonly RegionConfig[] | undefined): Record<string, unknown> {
  let select: Record<string, unknown> = { updatedAt: true }
  for (const region of regions ?? []) {
    for (const field of region.fields) {
      const next = setDocPath(select, field.path, true)
      if (next.ok) select = next.value
    }
  }
  return select
}

/** The block type the editor and the canvas use for a region's fields. Never stored in a layout. */
export const regionType = (name: string) => `$region:${name}`

/**
 * A region's fields as a block definition, with groups along nested paths, so the inline editor,
 * the automatic mapping and the image editor read the fields as they read block props. The
 * definition never enters a layout and has no slots or styles.
 */
export function regionDefinition(region: RegionConfig): BlockDefinition {
  type Node = { field?: Record<string, unknown>; children: Map<string, Node> }
  const root: Node = { children: new Map() }
  for (const { path, field } of region.fields) {
    let node = root
    const segments = path.split('.')
    for (const segment of segments.slice(0, -1)) {
      let child = node.children.get(segment)
      if (!child) {
        child = { children: new Map() }
        node.children.set(segment, child)
      }
      node = child
    }
    node.children.set(segments.at(-1) as string, { field, children: new Map() })
  }
  const build = (node: Node): unknown[] =>
    [...node.children].map(([name, child]) => child.field ?? { name, type: 'group', fields: build(child) })
  return { type: regionType(region.name), label: region.label, fields: build(root) as BlockDefinition['fields'], styles: false }
}

/** The region names a list of changed top-level fields touches. */
export function regionsTouched(regions: readonly RegionConfig[] | undefined, fields: readonly string[]): string[] {
  const changed = new Set(fields)
  return (regions ?? []).filter((region) => region.fields.some((field) => changed.has(field.path.split('.')[0]))).map((region) => region.name)
}

/** The rights at a document path: its own entry, else the nearest path above it. */
export function regionAccessAt(access: Record<string, { read: boolean; update: boolean }> | null | undefined, path: string): { read: boolean; update: boolean } {
  if (!access) return { read: true, update: true }
  const segments = pathWithoutIndexes(path).split('.')
  for (let i = segments.length; i > 0; i--) {
    const entry = access[segments.slice(0, i).join('.')]
    if (entry) return entry
  }
  return { read: false, update: false }
}

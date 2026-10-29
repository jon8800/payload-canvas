// Section versions: a ready-made section and its variants (`SectionDefinition.variants`).
// Pure: the editor's library and variant switch, the MCP tools and the assistant use it.
//
// - The section itself is the first version, its variants follow.
// - An inserted app section with one root block remembers where it came from in `block.section`.
// - Switching an inserted section to another version replaces its blocks in place (one remove and
//   one insert, so one undo step) and carries over the content the user changed.

import { htmlIdsOf, withoutTakenHtmlIds } from './attrs'
import { createId } from './ids'
import { findBlock, findLocation, walkBlocks } from './tree'
import type { Block, Layout, Operation, SectionDefinition, SectionOrigin } from './types'

/** The name of a section's own version when it sets no `variantLabel`. */
export const DEFAULT_VARIANT_LABEL = 'Default'

/** One version of a section: the section itself (`variant` undefined) or one of its variants. */
export type SectionVersion = {
  variant: string | undefined
  label: string
  description?: string
  blocks: Block[]
}

/**
 * The versions of a section: the section itself first, then its variants. Saved sections have no
 * variants.
 */
export function sectionVersions(section: SectionDefinition): SectionVersion[] {
  const own: SectionVersion = { variant: undefined, label: section.variantLabel?.trim() || DEFAULT_VARIANT_LABEL, blocks: section.blocks }
  if (section.description) own.description = section.description
  const variants = section.savedId === undefined ? (section.variants ?? []) : []
  return [
    own,
    ...variants.map((v) => {
      const version: SectionVersion = { variant: v.id, label: v.label, blocks: v.blocks }
      const description = v.description ?? section.description
      if (description) version.description = description
      return version
    }),
  ]
}

/** The index of a version in `sectionVersions`: 0 for the section itself, -1 for an unknown variant. */
export function versionIndex(section: SectionDefinition, variant?: string | null): number {
  const name = variant?.trim()
  if (!name) return 0
  if (section.savedId !== undefined) return -1
  const i = (section.variants ?? []).findIndex((v) => v.id === name)
  return i < 0 ? -1 : i + 1
}

/** True when the section has variants to switch between. */
export function hasVariants(section: SectionDefinition): boolean {
  return section.savedId === undefined && (section.variants?.length ?? 0) > 0
}

/**
 * The blocks with `section` set on the root block. Only a list with one root block gets it: a
 * section of several top-level blocks has no single block to switch.
 */
export function withSectionOrigin(blocks: readonly Block[], origin: SectionOrigin): Block[] {
  if (blocks.length !== 1) return [...blocks]
  return [{ ...blocks[0]!, section: origin.variant ? { id: origin.id, variant: origin.variant } : { id: origin.id } }]
}

/** The block without `section`, at the root of the tree only (where it is set). */
export function withoutSectionOrigin(block: Block): Block {
  if (!block.section) return block
  const { section: _section, ...rest } = block
  return rest
}

/**
 * One version of a section as a section of its own, ready to insert: the version's blocks (an app
 * section's root block gets `section`), the label `<label> (<variant label>)` for a variant, and no
 * `variants`. Null when the section has no such variant.
 */
export function sectionVersion(section: SectionDefinition, variant?: string | null): SectionDefinition | null {
  const index = versionIndex(section, variant)
  if (index < 0) return null
  const version = sectionVersions(section)[index]!
  const { variants: _variants, variantLabel: _variantLabel, description: _description, ...rest } = section
  const out: SectionDefinition = {
    ...rest,
    label: version.variant ? `${section.label} (${version.label})` : section.label,
    blocks: section.savedId === undefined ? withSectionOrigin(version.blocks, { id: section.id, variant: version.variant }) : version.blocks,
  }
  if (version.description) out.description = version.description
  return out
}

/**
 * Finds a section by its id (`hero`, `saved:12`), by a saved section's document id (`12`) or by
 * its name (case-insensitive, the first match). Ids win over names.
 */
export function findSection(sections: readonly SectionDefinition[], ref: string): SectionDefinition | undefined {
  const value = ref.trim()
  if (!value) return undefined
  const byId = sections.find((s) => s.id === value)
  if (byId) return byId
  const bySavedId = sections.find((s) => s.savedId !== undefined && String(s.savedId) === value)
  if (bySavedId) return bySavedId
  const name = value.toLowerCase()
  return sections.find((s) => s.label.trim().toLowerCase() === name)
}

/**
 * The version to insert for `ref` (see `findSection`) and `variant` (see `sectionVersion`). The old
 * variant ids `<section id>/<variant id>` still work. Undefined when no section matches; an error
 * message when the section has no such variant.
 */
export function findSectionVersion(sections: readonly SectionDefinition[], ref: string, variant?: string | null): SectionDefinition | string | undefined {
  let section = findSection(sections, ref)
  let name = variant?.trim() || undefined
  if (!section) {
    const slash = ref.lastIndexOf('/')
    const base = slash > 0 ? findSection(sections, ref.slice(0, slash)) : undefined
    const old = ref.slice(slash + 1).trim()
    if (!base || (name && name !== old) || versionIndex(base, old) <= 0) return undefined
    section = base
    name = old
  }
  const version = sectionVersion(section, name)
  if (version) return version
  if (section.savedId !== undefined) return `Saved sections have no variants. Leave out variant to insert "${section.label}".`
  const known = (section.variants ?? []).map((v) => v.id)
  return `The section "${section.id}" has no variant "${name}". ${known.length > 0 ? `Its variants: ${known.join(', ')}.` : 'It has no variants.'}`
}

/**
 * The variants of a section for a listing (MCP and assistant `listSections`): id, label,
 * description and what `show` returns for the blocks (an outline or the full JSON). Undefined
 * when the section has none.
 */
export function listedVariants(
  section: SectionDefinition,
  show: (blocks: Block[]) => Record<string, unknown>,
): Record<string, unknown>[] | undefined {
  if (!hasVariants(section)) return undefined
  return sectionVersions(section)
    .slice(1)
    .map((v) => ({ id: v.variant, label: v.label, ...(v.description && v.description !== section.description ? { description: v.description } : {}), ...show(v.blocks) }))
}

// ---------------------------------------------------------------------------
// Switching an inserted section to another version
// ---------------------------------------------------------------------------

/** The operations that switch a section in place, and the new root block. */
export type VariantSwitch = { ops: Operation[]; block: Block; label: string }

/**
 * Replaces the section whose root block is `blockId` with another version of it (`variant`
 * undefined: the section itself): a `remove` and an `insert` at the same place, so applied as one
 * batch they are one undo step. Content the user changed carries over (see `carryContent`). The
 * new blocks get new ids; HTML ids that other blocks use are left out. An error message when the
 * block is no inserted app section, or the version does not exist.
 */
export function switchSectionVariant(
  layout: Layout,
  blockId: string,
  sections: readonly SectionDefinition[],
  variant: string | undefined,
  newId: () => string = createId,
): VariantSwitch | string {
  const block = findBlock(layout, blockId)
  const location = findLocation(layout, blockId)
  if (!block || !location) return 'The section is no longer on the page.'
  const origin = block.section
  if (!origin) return 'This block is not a ready-made section.'
  const section = sections.find((s) => s.id === origin.id && s.savedId === undefined)
  if (!section) return `The section "${origin.id}" is no longer available.`
  const versions = sectionVersions(section)
  const target = versions[versionIndex(section, variant)]
  if (!target) return `The section "${section.label}" has no variant "${variant}".`
  const [targetRoot] = target.blocks
  if (!targetRoot || target.blocks.length !== 1) return `"${section.label} (${target.label})" does not have one root block, so it cannot replace this one.`
  const from = versions[versionIndex(section, origin.variant)]?.blocks
  const source = from?.length === 1 ? from[0] : undefined

  const carried = source ? carryContent(block, source, targetRoot) : targetRoot
  const used = new Set<string>()
  walkBlocks(layout, (b) => void used.add(b.id))
  let fresh = withFreshIds(carried, used, newId)
  fresh.section = target.variant ? { id: section.id, variant: target.variant } : { id: section.id }
  // HTML ids of other blocks stay theirs; the replaced blocks give theirs up.
  const own = new Set(htmlIdsOf([block]).keys())
  const taken = new Set([...htmlIdsOf(layout.blocks).keys()].filter((id) => !own.has(id)))
  fresh = withoutTakenHtmlIds(fresh, taken)
  const to = location.parentId === null ? { parentId: null, index: location.index } : { parentId: location.parentId, slot: location.slot, index: location.index }
  return {
    ops: [
      { type: 'remove', id: blockId },
      { type: 'insert', block: fresh, to },
    ],
    block: fresh,
    label: target.label,
  }
}

/** The block and its children, depth first (each block before its slots, slots in their order). */
function walkTree(block: Block, out: Block[] = []): Block[] {
  out.push(block)
  for (const children of Object.values(block.slots ?? {})) for (const child of children) walkTree(child, out)
  return out
}

/**
 * The blocks of `current` paired with the blocks of `source` (the version it was inserted from):
 * both trees walked side by side, by slot name and index, while the types match. Blocks the user
 * added, removed or moved break the pairing from there on in that list. Source id -> current block.
 */
function pairWithSource(current: Block, source: Block, out = new Map<string, Block>()): Map<string, Block> {
  if (current.type !== source.type) return out
  out.set(source.id, current)
  for (const [name, children] of Object.entries(source.slots ?? {})) {
    const mine = current.slots?.[name] ?? []
    children.forEach((child, i) => {
      if (mine[i]) pairWithSource(mine[i]!, child, out)
    })
  }
  return out
}

/**
 * Target id -> source block: the root blocks (the section's name and anchor live there, whatever
 * their types), then blocks with the same `id` and type in both versions (authors give a block
 * one id in each version to pair it exactly), then the remaining blocks of each type in order (the
 * first heading with the first heading, and so on).
 */
function matchVersions(source: Block, target: Block): Map<string, Block> {
  const sourceList = walkTree(source)
  const targetList = walkTree(target)
  const matched = new Map<string, Block>([[target.id, source]])
  const taken = new Set<string>([source.id])
  for (const t of targetList) {
    if (matched.has(t.id)) continue
    const s = sourceList.find((b) => b.id === t.id && b.type === t.type)
    if (s && !taken.has(s.id)) {
      matched.set(t.id, s)
      taken.add(s.id)
    }
  }
  const queues = new Map<string, Block[]>()
  for (const s of sourceList) if (!taken.has(s.id)) queues.set(s.type, [...(queues.get(s.type) ?? []), s])
  for (const t of targetList) {
    if (matched.has(t.id)) continue
    const s = queues.get(t.type)?.shift()
    if (s) matched.set(t.id, s)
  }
  return matched
}

const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).toSorted().map((k) => [k, sorted((value as Record<string, unknown>)[k])]))
  }
  return value
}

/** Block keys whose edits carry over to the matching block of the new version. */
const CARRIED_KEYS = ['label', 'hidden', 'attrs', 'bindings'] as const

/**
 * `target` with the content the user changed in `current` since it was inserted from `source`:
 * per matching block (see `matchVersions` and `pairWithSource`), every prop whose value differs
 * from the source version (a cleared or removed prop too), and the name, hidden flag, HTML
 * attributes and bindings when they differ. Classes, animations and the structure come from the
 * new version. A translation stays when the new block's default-locale value is the one it
 * translates. Blocks the user added inside the section are not carried over.
 */
export function carryContent(current: Block, source: Block, target: Block): Block {
  const paired = pairWithSource(current, source)
  const matched = matchVersions(source, target)
  const visit = (block: Block): Block => {
    const s = matched.get(block.id)
    const c = s ? paired.get(s.id) : undefined
    let next: Block = c && s ? applyChanges(block, s, c) : { ...block }
    if (block.slots) {
      next = { ...next, slots: Object.fromEntries(Object.entries(block.slots).map(([name, children]) => [name, children.map(visit)])) }
    }
    return next
  }
  return visit(target)
}

function applyChanges(target: Block, source: Block, current: Block): Block {
  const next: Block = { ...target }
  // Root blocks of other types share only the name, the hidden flag and the HTML attributes.
  if (target.type !== source.type) return carryKeys(next, source, current, ['label', 'hidden', 'attrs'])
  const props: Record<string, unknown> = { ...target.props }
  const keys = new Set([...Object.keys(source.props ?? {}), ...Object.keys(current.props ?? {})])
  for (const key of keys) {
    const mine = current.props?.[key]
    if (same(mine, source.props?.[key])) continue
    if (current.props && Object.hasOwn(current.props, key)) props[key] = structuredClone(mine)
    else delete props[key]
  }
  if (Object.keys(props).length > 0) next.props = props
  else delete next.props
  // A translation is right only while the default-locale value it translates stays the same.
  const locales: Record<string, Record<string, unknown>> = {}
  for (const [code, values] of Object.entries(current.locales ?? {})) {
    const kept = Object.fromEntries(Object.entries(values).filter(([key]) => same(props[key], current.props?.[key])))
    if (Object.keys(kept).length > 0) locales[code] = structuredClone(kept)
  }
  if (Object.keys(locales).length > 0) next.locales = locales
  else delete next.locales
  return carryKeys(next, source, current, CARRIED_KEYS)
}

/** `next` with each of `keys` that the user changed (current differs from source) taken from current. */
function carryKeys(next: Block, source: Block, current: Block, keys: readonly (typeof CARRIED_KEYS)[number][]): Block {
  for (const key of keys) {
    if (same(current[key], source[key])) continue
    if (current[key] === undefined) delete next[key]
    else (next as Record<string, unknown>)[key] = structuredClone(current[key])
  }
  return next
}

/** A deep copy with new ids that are not in `used` (each new id joins it). */
function withFreshIds(block: Block, used: Set<string>, newId: () => string): Block {
  let id = newId()
  while (used.has(id)) id = newId()
  used.add(id)
  const copy: Block = { ...structuredClone(block), id }
  if (block.slots) {
    copy.slots = Object.fromEntries(Object.entries(block.slots).map(([name, list]) => [name, list.map((child) => withFreshIds(child, used, newId))]))
  }
  return copy
}

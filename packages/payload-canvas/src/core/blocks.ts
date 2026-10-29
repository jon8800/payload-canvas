import { defaultPartClassNames } from './classes'
import { indexLayout, subtreeIds, type IndexedBlock } from './tree'
import type { Block, BlockDefinition, Layout, SectionDefinition, SectionVariant, SlotDefinition } from './types'

/**
 * True when the slot accepts the block type as a direct child: `allow` undefined or containing "*"
 * accepts any type, and `disallow` must not list it. Ancestor slots are not checked here; use
 * `placementError` / `slotAcceptsAt` for a position in a layout.
 */
export function slotAccepts(slot: SlotDefinition, type: string): boolean {
  if (slot.disallow?.includes(type)) return false
  return !slot.allow || slot.allow.includes('*') || slot.allow.includes(type)
}

/**
 * True when a block of `type` may sit directly in a block of `parentType` (`null`: the root list),
 * by the block's own `parents` rule. Slot rules are separate (`slotAccepts`).
 */
export function fitsParent(blocks: readonly BlockDefinition[], type: string, parentType: string | null): boolean {
  const parents = getBlockDefinition(blocks, type)?.parents
  return !parents || (parentType !== null && parents.includes(parentType))
}

/** "List item can only go inside List", or "… inside List or Menu". */
function parentsMessage(blocks: readonly BlockDefinition[], type: string): string {
  const label = (t: string) => getBlockDefinition(blocks, t)?.label ?? t
  const parents = getBlockDefinition(blocks, type)?.parents ?? []
  return `${label(type)} can only go inside ${parents.map(label).join(' or ')}`
}

/**
 * The children a new block of `type` starts with: one child in each slot that accepts exactly one
 * type made for this block (its `parents` names `type`). A new list starts with one list item.
 * Null when there are none. The children get the child type's default classes (`withDefaultClasses`).
 */
export function starterSlots(blocks: readonly BlockDefinition[], type: string, makeId: () => string): Record<string, Block[]> | null {
  const slots: Record<string, Block[]> = {}
  for (const [name, slot] of Object.entries(getBlockDefinition(blocks, type)?.slots ?? {})) {
    if (slot.allow?.length !== 1) continue
    const child = getBlockDefinition(blocks, slot.allow[0])
    if (!child?.parents?.includes(type)) continue
    slots[name] = [withDefaultClasses({ id: makeId(), type: child.type }, child)]
  }
  return Object.keys(slots).length > 0 ? slots : null
}

/**
 * The new block with the definition's default classes: `defaultClassName` where it has no
 * `className` key, and each part's `defaultClassName` where `partClassName` has no key for it.
 */
export function withDefaultClasses(block: Block, def: BlockDefinition | undefined): Block {
  const next: Block = { ...block }
  if (next.className === undefined && def?.defaultClassName) next.className = def.defaultClassName
  const parts = defaultPartClassNames(def)
  if (parts) next.partClassName = { ...parts, ...next.partClassName }
  return next
}

export function defineBlock<T extends BlockDefinition>(def: T): T {
  return def
}

/** A block in `defineSection` input: like `Block`, but `id` may be left out (here and in every slot). */
export type SectionBlockInput = Omit<Block, 'id' | 'slots'> & { id?: string; slots?: Record<string, SectionBlockInput[]> }

/** `defineSection` input: a `SectionDefinition` whose blocks (and its variants' blocks) may leave out `id`. */
export type SectionInput = Omit<SectionDefinition, 'blocks' | 'variants'> & {
  blocks: SectionBlockInput[]
  variants?: (Omit<SectionVariant, 'blocks'> & { blocks: SectionBlockInput[] })[]
}

/** The blocks with every missing id filled as `<prefix>_1`, `_2`, … (see `defineSection`). */
function fillBlockIds(owner: string, prefix: string, blocks: SectionBlockInput[]): Block[] {
  const given = new Set<string>()
  const collect = (list: SectionBlockInput[]) => {
    for (const block of list) {
      if (block.id) {
        if (given.has(block.id)) throw new Error(`defineSection("${owner}"): two blocks have the id "${block.id}".`)
        given.add(block.id)
      }
      for (const children of Object.values(block.slots ?? {})) collect(children)
    }
  }
  collect(blocks)
  let count = 0
  const nextId = () => {
    let id: string
    do id = `${prefix}_${++count}`
    while (given.has(id))
    return id
  }
  const fill = (list: SectionBlockInput[]): Block[] =>
    list.map(({ slots, ...rest }) => {
      const block: Block = { ...rest, id: rest.id || nextId() }
      if (slots) block.slots = Object.fromEntries(Object.entries(slots).map(([name, children]) => [name, fill(children)]))
      return block
    })
  return fill(blocks)
}

/**
 * A section with every missing block id filled: `<section id>_1`, `_2`, … in walk order (each
 * block before its slots, slots in their order), skipping ids that are given. A variant's blocks
 * get `<section id>_<variant id>_1`, … The same input always gives the same ids. Throws when `id`
 * or `label` is missing (also on a variant), two variants share an id, or two blocks of one tree
 * share an id.
 */
export function defineSection(input: SectionInput): SectionDefinition {
  if (typeof input.id !== 'string' || !input.id.trim()) throw new Error('defineSection: the section needs an "id".')
  if (typeof input.label !== 'string' || !input.label.trim()) throw new Error(`defineSection("${input.id}"): the section needs a "label".`)
  const { variants, ...rest } = input
  const section: SectionDefinition = { ...rest, blocks: fillBlockIds(input.id, input.id, input.blocks) }
  if (variants) {
    checkVariants(input.id, variants)
    section.variants = variants.map((variant) => ({ ...variant, blocks: fillBlockIds(input.id, `${input.id}_${variant.id}`, variant.blocks) }))
  }
  return section
}

function checkVariants(section: string, variants: readonly { id: string; label: string }[]) {
  const seen = new Set<string>()
  for (const variant of variants) {
    if (typeof variant.id !== 'string' || !variant.id.trim()) throw new Error(`Section "${section}": a variant needs an "id".`)
    if (typeof variant.label !== 'string' || !variant.label.trim()) throw new Error(`Section "${section}": variant "${variant.id}" needs a "label".`)
    if (seen.has(variant.id)) throw new Error(`Section "${section}": two variants have the id "${variant.id}".`)
    seen.add(variant.id)
  }
}

/**
 * Throws on a variant without id or label, or two variants of one section with one id. The plugin
 * and `builderMcpTools` run it on the app's `sections`.
 */
export function checkSectionVariants(sections: readonly SectionDefinition[]): void {
  for (const section of sections) if (section.variants?.length) checkVariants(section.id, section.variants)
}

/**
 * The old flat list: each variant as a section of its own, right after its section: id
 * `<section id>/<variant id>`, label `<section label> (<variant label>)`, the section's category,
 * its description unless the variant has one, and `variantOf` set to the section id. The section
 * itself stays the first version and loses its `variants` key. The plugin no longer uses it: the
 * editor, MCP and the assistant keep variants under their section (`core/sections.ts`), and
 * `insertSection` still accepts the `<section id>/<variant id>` ids. Throws like
 * `checkSectionVariants`.
 */
export function sectionsWithVariants(sections: readonly SectionDefinition[]): SectionDefinition[] {
  return sections.flatMap(({ variants, ...section }) => {
    if (!variants?.length) return [section]
    checkVariants(section.id, variants)
    return [
      section,
      ...variants.map((variant) => ({
        id: `${section.id}/${variant.id}`,
        label: `${section.label} (${variant.label})`,
        ...(variant.description ?? section.description ? { description: variant.description ?? section.description } : {}),
        ...(section.category ? { category: section.category } : {}),
        blocks: variant.blocks,
        variantOf: section.id,
      })),
    ]
  })
}

/**
 * The blocks with each block's `defaultClassName` filled where the block has no `className` key, at
 * any depth, and each part's default classes where `partClassName` has no key for the part
 * (`withDefaultClasses`). A `className` of `''` stays empty. Blocks of unknown types stay as they are. The
 * plugin and `builderMcpTools` run it on the app's `sections`, so a section tree may leave out a
 * block's default classes. Seeds that build layouts by hand can run it too.
 */
export function withDefaultClassNames(list: readonly Block[], definitions: readonly BlockDefinition[]): Block[] {
  return list.map((block) => {
    const next = withDefaultClasses(block, getBlockDefinition(definitions, block.type))
    if (block.slots) {
      next.slots = Object.fromEntries(Object.entries(block.slots).map(([name, children]) => [name, withDefaultClassNames(children, definitions)]))
    }
    return next
  })
}

/** `withDefaultClassNames` on the blocks of every section and its variants. */
export function sectionsWithDefaultClassNames(sections: readonly SectionDefinition[], definitions: readonly BlockDefinition[]): SectionDefinition[] {
  return sections.map((section) => ({
    ...section,
    blocks: withDefaultClassNames(section.blocks, definitions),
    ...(section.variants ? { variants: section.variants.map((v) => ({ ...v, blocks: withDefaultClassNames(v.blocks, definitions) })) } : {}),
  }))
}

/**
 * The blocks with every `allowInline` slot accepting the block types marked `inline: true`: they
 * join the slot's `allow` list. The plugin and `builderMcpTools` run it on their block list, so
 * the editor, the checks and the AI tools all see the same rule. Returns the same list when no
 * block is inline.
 */
export function withInlineBlocks(blocks: BlockDefinition[]): BlockDefinition[] {
  const inline = blocks.filter((b) => b.inline).map((b) => b.type)
  if (inline.length === 0) return blocks
  return blocks.map((def) => {
    const slots = def.slots
    if (!slots || !Object.values(slots).some((slot) => slot.allowInline && slot.allow)) return def
    const next = Object.fromEntries(
      Object.entries(slots).map(([name, slot]) => [
        name,
        slot.allowInline && slot.allow ? { ...slot, allow: [...new Set([...slot.allow, ...inline.filter((t) => !slot.disallow?.includes(t))])] } : slot,
      ]),
    )
    return { ...def, slots: next }
  })
}

export function getBlockDefinition(blocks: readonly BlockDefinition[], type: string): BlockDefinition | undefined {
  return blocks.find((b) => b.type === type)
}

/** Slot names of a block type, in declared order. */
export function slotNames(def: BlockDefinition | undefined): string[] {
  return def?.slots ? Object.keys(def.slots) : []
}

/** The block's name for people: its own `label`, else the block type's label, else the type. */
export function blockName(block: Pick<Block, 'type' | 'label'>, blocks: readonly BlockDefinition[]): string {
  return block.label?.trim() || getBlockDefinition(blocks, block.type)?.label || block.type
}

/** Every block type in a subtree (the block itself included). */
function subtreeTypes(block: Block, out = new Set<string>()): Set<string> {
  out.add(block.type)
  for (const children of Object.values(block.slots ?? {})) for (const child of children) subtreeTypes(child, out)
  return out
}

/**
 * Why `block` (a type, or a whole block with its children) cannot go into `slot` of `parentId`,
 * or `null` when it can. Checks the direct slot's `allow` and `disallow`, and the `disallow` of
 * every ancestor slot up to the root, against every type in the placed subtree, the placed
 * block's own `parents` rule, and the direct slot's `max` (a block already in that slot, being
 * moved within it, does not count as one more). The root list accepts every type without a `parents` rule. The
 * message is readable, e.g. `Button cannot go inside Link`.
 */
export function placementError(
  blocks: readonly BlockDefinition[],
  layout: Layout,
  parentId: string | null,
  slot: string,
  block: string | Block,
  index: Map<string, IndexedBlock> = indexLayout(layout),
): string | null {
  const rootType = typeof block === 'string' ? block : block.type
  if (parentId === null) return fitsParent(blocks, rootType, null) ? null : parentsMessage(blocks, rootType)
  const types = typeof block === 'string' ? new Set([block]) : subtreeTypes(block)
  const label = (type: string) => getBlockDefinition(blocks, type)?.label ?? type
  const skip = typeof block === 'string' ? new Set<string>() : new Set(subtreeIds(block))

  let ownerId: string | null = parentId
  let slotName = slot
  let direct = true
  while (ownerId !== null) {
    const owner = index.get(ownerId)
    if (!owner) return `Block "${ownerId}" not found`
    // A block moved into its own subtree is caught by the operations; do not loop here.
    if (skip.has(owner.block.id)) return null
    const definition = getBlockDefinition(blocks, owner.block.type)
    const slotDef = definition?.slots?.[slotName]
    const ownerLabel = blockName(owner.block, blocks)
    if (direct) {
      if (definition && !slotDef) return `"${ownerLabel}" has no slot "${slotName}"`
      if (slotDef?.allow && !slotDef.allow.includes('*') && !slotDef.allow.includes(rootType)) {
        return `${label(rootType)} cannot go inside ${ownerLabel}`
      }
      if (!fitsParent(blocks, rootType, owner.block.type)) return parentsMessage(blocks, rootType)
      // A block that already sits in this slot (a move within the list) does not add one.
      const children = owner.block.slots?.[slotName] ?? []
      const already = typeof block !== 'string' && children.some((child) => child.id === block.id)
      if (!already) {
        const full = slotFullError(blocks, owner.block, slotName)
        if (full) return full
      }
    }
    const refused = slotDef?.disallow?.find((type) => types.has(type))
    if (refused) {
      return refused === rootType
        ? `${label(refused)} cannot go inside ${ownerLabel}`
        : `${label(rootType)} contains ${label(refused)}, which cannot go inside ${ownerLabel}`
    }
    direct = false
    slotName = owner.slot
    ownerId = owner.parentId
  }
  return null
}

/** The slot's name for people: its `label`, else its name. */
export function slotLabel(def: BlockDefinition | undefined, slot: string): string {
  return def?.slots?.[slot]?.label?.trim() || slot
}

/** "takes at most 1 block" / "takes at least 2 blocks". */
export function slotLimitText(kind: 'max' | 'min', count: number): string {
  return `takes at ${kind === 'max' ? 'most' : 'least'} ${count} ${count === 1 ? 'block' : 'blocks'}`
}

/**
 * Why one more block cannot go into `slot` of `owner`: the slot holds its `max` already. Null
 * when it has room or no limit. E.g. `"Heading" in CTA contact takes at most 1 block`.
 */
export function slotFullError(blocks: readonly BlockDefinition[], owner: Block, slot: string): string | null {
  const def = getBlockDefinition(blocks, owner.type)
  const max = def?.slots?.[slot]?.max
  if (typeof max !== 'number') return null
  if ((owner.slots?.[slot]?.length ?? 0) < max) return null
  return `"${slotLabel(def, slot)}" in ${blockName(owner, blocks)} ${slotLimitText('max', max)}`
}

/**
 * How many more blocks fit into `slot` of `parentId` by its `max`. `Infinity` for the root list,
 * a slot without a limit, or an unknown parent.
 */
export function slotRoom(blocks: readonly BlockDefinition[], layout: Layout, parentId: string | null, slot: string): number {
  if (parentId === null) return Infinity
  const owner = indexLayout(layout).get(parentId)?.block
  const max = owner ? getBlockDefinition(blocks, owner.type)?.slots?.[slot]?.max : undefined
  if (!owner || typeof max !== 'number') return Infinity
  return Math.max(0, max - (owner.slots?.[slot]?.length ?? 0))
}

/** True when `block` (a type or a whole block) may go into `slot` of `parentId`. See `placementError`. */
export function slotAcceptsAt(
  blocks: readonly BlockDefinition[],
  layout: Layout,
  parentId: string | null,
  slot: string,
  block: string | Block,
): boolean {
  return placementError(blocks, layout, parentId, slot, block) === null
}

/**
 * Name of the hidden, virtual richText field the plugin adds next to a layout field. The block
 * inspector points Payload's Lexical editor (`RenderLexical`) at it, so rich text props use the
 * app's own editor config. It stores nothing.
 */
export function richTextFieldName(layoutField: string): string {
  return `${layoutField}RichText`
}

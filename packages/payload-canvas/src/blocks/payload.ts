// Turns Payload `Block` configs (the blocks of a `blocks` field) into builder block definitions.
// Client-safe: plain data in, plain data out. Type-only Payload imports.

import type { Block as PayloadBlockConfig, Field } from 'payload'

import { conditionFromFunction } from '../core/conditions'
import { textOf } from '../core/fields'
import { isPlainObject } from '../core/tree'
import type { BlockDefinition, SlotDefinition } from '../core/types'

/** Per-block settings that win over what `fromPayloadBlocks` derives from the Payload config. */
export type PayloadBlockOverride = Partial<
  Pick<BlockDefinition, 'label' | 'category' | 'icon' | 'styles' | 'defaultClassName' | 'classes' | 'ai' | 'parents'>
> & {
  /** Merged into each slot (a nested blocks field), e.g. `{ content: { allow: ['*'] } }`. */
  slots?: Record<string, Partial<SlotDefinition>>
}

export type FromPayloadBlocksOptions = {
  /**
   * Your top-level `config.blocks`. `blockReferences` are looked up here by slug. Blocks found
   * only here become definitions too. Default: the blocks you pass.
   */
  references?: readonly PayloadBlockConfig[]
  /**
   * Slugs that may go in the page's root list: the blocks of the page's own `blocks` field, e.g.
   * `['fullWidth', 'twoColumn']`. Every other block then goes only inside the blocks whose nested
   * blocks fields take it (its `parents`), as in Payload. Default: every block may go anywhere.
   */
  root?: readonly string[]
  /**
   * Prefix for the builder `type` of every block: `prefix: 'site'` turns `heading` into
   * `siteHeading`. Use it when a slug clashes with another block, such as the default `heading`.
   * Payload data keeps its `blockType`; the conversion and the component adapter map it.
   */
  prefix?: string
  /** Library group for blocks without `admin.group`. Default "Site sections" (blocks with slots) or "Site blocks". */
  category?: string
  /**
   * Adds `className` and the Styles panel. Default false: components written for Payload data
   * style themselves. With true, `fromPayloadComponent` wraps the component in a `div` with the classes.
   */
  styles?: boolean
  /** Settings per Payload slug. */
  overrides?: Record<string, PayloadBlockOverride>
  /**
   * Receives what does not carry over (custom admin components, conditions it cannot read,
   * nested blocks fields that stay props). Default: `console.warn` once per message, outside production.
   * `false` turns the messages off.
   */
  onWarning?: ((message: string) => void) | false
}

type Config = PayloadBlockConfig
type LooseField = Record<string, unknown> & { type?: string; name?: string }

const ICONS: Array<[RegExp, string]> = [
  [/head|title/i, 'heading'],
  [/video/i, 'video'],
  [/image|photo|picture|gallery|media/i, 'image'],
  [/button|cta/i, 'button'],
  [/link|anchor/i, 'link'],
  [/faq|accordion|list|steps|glossary/i, 'list'],
  [/quote|testimonial|review/i, 'quote'],
  [/form|contact/i, 'form'],
  [/grid|card|column|bento/i, 'grid'],
  [/divider|separator/i, 'divider'],
  [/spacer/i, 'spacer'],
  [/rich|content|text|prose|copy|intro/i, 'richText'],
]

const seenWarnings = new Set<string>()

function defaultWarn(message: string): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return
  if (seenWarnings.has(message)) return
  seenWarnings.add(message)
  console.warn(message)
}

/** `{ max: 1 }` from `maxRows: 1`; nothing for a missing or invalid row count. */
function rowLimit(key: 'max' | 'min', rows: unknown): Partial<Record<'max' | 'min', number>> {
  return typeof rows === 'number' && Number.isInteger(rows) && rows >= 0 ? { [key]: rows } : {}
}

/** "fullWidth" -> "Full width", "experiences-grid" -> "Experiences grid". */
function words(slug: string): string {
  const text = slug.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const ADMIN_COMPONENT_KEYS = ['Field', 'Label', 'Description', 'Error', 'beforeInput', 'afterInput', 'RowLabel', 'Cell', 'Filter']

/**
 * Builder block definitions from Payload block configs, so a site keeps its own blocks.
 *
 * - Every field stays a Payload field config: the inspector renders it like Payload does.
 * - A nested `blocks` field at the block's own data level (also inside rows, collapsibles and
 *   unnamed tabs) becomes a slot with the same name. Its `allow` lists the blocks of that field
 *   (inline `blocks` and `blockReferences`). Inline blocks become definitions too. `maxRows` and
 *   `minRows` become the slot's `max` and `min`.
 * - `labels.singular` gives the label, `admin.group` the library category. `interfaceName`,
 *   `dbName`, `imageURL` and the block's admin components are not used.
 * - `admin.condition` functions that test one sibling field (`(_, s) => s?.type === 'custom'`)
 *   become JSON conditions the inspector understands. Other conditions are reported, and the
 *   field always shows.
 * - Custom admin components on fields (a custom `Field`) cannot run without Payload's form: the
 *   inspector uses Payload's default input for the field type, and the field is reported.
 *
 * Validate functions and field hooks of block fields do not run in the builder.
 */
export function fromPayloadBlocks(blocks: readonly Config[], options: FromPayloadBlocksOptions = {}): BlockDefinition[] {
  const warn = options.onWarning === false ? () => {} : (options.onWarning ?? defaultWarn)
  const references = new Map<string, Config>()
  for (const block of [...(options.references ?? []), ...blocks]) {
    if (block && typeof block.slug === 'string' && !references.has(block.slug)) references.set(block.slug, block)
  }
  const typeOf = (slug: string) => (options.prefix ? `${options.prefix}${slug.charAt(0).toUpperCase()}${slug.slice(1)}` : slug)

  const definitions = new Map<string, BlockDefinition>()
  const queue: Config[] = [...blocks]
  const enqueue = (block: Config) => {
    if (!definitions.has(block.slug) && !queue.some((b) => b.slug === block.slug)) queue.push(block)
  }
  while (queue.length > 0) {
    const block = queue.shift() as Config
    if (!block || typeof block.slug !== 'string' || definitions.has(block.slug)) continue
    definitions.set(block.slug, definitionOf(block))
  }

  function definitionOf(block: Config): BlockDefinition {
    const notes: string[] = []
    const slots: Record<string, SlotDefinition> = {}
    const fields = adaptFields(block.fields as Field[], true, '')
    const override = options.overrides?.[block.slug] ?? {}
    const label = override.label ?? textOf(block.labels?.singular) ?? words(block.slug)
    const hasSlots = Object.keys(slots).length > 0
    for (const [name, patch] of Object.entries(override.slots ?? {})) {
      if (slots[name]) slots[name] = { ...slots[name], ...patch }
      else notes.push(`overrides.slots.${name}: the block has no nested blocks field "${name}"`)
    }
    if (notes.length > 0) warn(`[fromPayloadBlocks] "${block.slug}": ${notes.join('; ')}.`)

    const slotText = hasSlots ? ` Child blocks go in: ${Object.keys(slots).join(', ')}.` : ''
    const def: BlockDefinition = {
      type: typeOf(block.slug),
      label,
      fields,
      ...(hasSlots ? { slots } : {}),
      styles: override.styles ?? options.styles ?? false,
      icon: override.icon ?? (hasSlots ? 'section' : (ICONS.find(([test]) => test.test(block.slug))?.[1] ?? 'block')),
      category: override.category ?? textOf((block.admin as { group?: unknown } | undefined)?.group) ?? options.category ?? (hasSlots ? 'Site sections' : 'Site blocks'),
      ai: override.ai ?? { description: `${label}: a block of the site's own design.${slotText}` },
      payload: { slug: block.slug },
    }
    if (override.defaultClassName) def.defaultClassName = override.defaultClassName
    if (override.classes) def.classes = override.classes
    if (override.parents) def.parents = override.parents
    return def

    /** `top`: the fields share the block's own data object (a blocks field here becomes a slot). */
    function adaptFields(list: readonly Field[] | undefined, top: boolean, path: string): Field[] {
      const out: Field[] = []
      for (const raw of list ?? []) {
        const field = adaptField(raw as unknown as LooseField, top, path)
        if (field) out.push(field as unknown as Field)
      }
      return out
    }

    function adaptField(source: LooseField, top: boolean, path: string): LooseField | null {
      if (!isPlainObject(source) || typeof source.type !== 'string') return null
      const field: LooseField = { ...source }
      const name = typeof field.name === 'string' ? field.name : ''
      const at = name ? `${path}${name}` : path
      readAdmin(field, at)

      switch (field.type) {
        case 'blocks': {
          const allowed = blocksOfField(field)
          if (top && name) {
            const slotLabel = textOf(field.label)
            slots[name] = {
              ...(slotLabel ? { label: slotLabel } : {}),
              allow: allowed.map((b) => typeOf(b.slug)),
              ...rowLimit('max', field.maxRows),
              ...rowLimit('min', field.minRows),
            }
            for (const b of allowed) enqueue(b)
            return null
          }
          // A blocks field inside a named group, a named tab or an array stays a prop.
          notes.push(`${at}: a blocks field inside a group or array stays a prop (edited as JSON in the builder)`)
          const rest: LooseField = { ...field, blocks: allowed }
          delete rest.blockReferences
          return rest
        }
        case 'row':
        case 'collapsible': {
          const kept = adaptFields(field.fields as Field[], top, path)
          return kept.length > 0 ? { ...field, fields: kept } : null
        }
        case 'group': {
          const kept = adaptFields(field.fields as Field[], top && !name, name ? `${at}.` : path)
          return kept.length > 0 || name ? { ...field, fields: kept } : null
        }
        case 'array':
          return { ...field, fields: adaptFields(field.fields as Field[], false, `${at}[].`) }
        case 'tabs': {
          const tabs: Record<string, unknown>[] = []
          for (const tab of (Array.isArray(field.tabs) ? field.tabs : []) as Record<string, unknown>[]) {
            const tabName = typeof tab.name === 'string' ? tab.name : ''
            const kept = adaptFields(tab.fields as Field[], top && !tabName, tabName ? `${path}${tabName}.` : path)
            if (kept.length > 0 || tabName) tabs.push({ ...tab, fields: kept })
          }
          return tabs.length > 0 ? { ...field, tabs } : null
        }
        default:
          return field
      }
    }

    /** Reads `admin.condition` into a JSON condition and notes custom admin components. */
    function readAdmin(field: LooseField, at: string): void {
      const admin = isPlainObject(field.admin) ? field.admin : null
      if (!admin) return
      const next: Record<string, unknown> = { ...admin }
      if (admin.condition !== undefined) {
        const condition = conditionFromFunction(admin.condition)
        delete next.condition
        if (condition) next.custom = { ...(isPlainObject(admin.custom) ? admin.custom : {}), builderCondition: condition }
        else notes.push(`${at || field.type}: admin.condition is not supported here, so the field always shows`)
      }
      const components = isPlainObject(admin.components) ? admin.components : null
      const custom = components ? ADMIN_COMPONENT_KEYS.filter((key) => components[key]) : []
      if (custom.length > 0) notes.push(`${at || field.type}: custom admin ${custom.join(', ')} not used (the default input shows)`)
      field.admin = next
    }
  }

  /** The block configs a blocks field allows: inline `blocks` plus `blockReferences`. */
  function blocksOfField(field: LooseField): Config[] {
    const out: Config[] = []
    const add = (entry: unknown) => {
      const block = typeof entry === 'string' ? references.get(entry) : isPlainObject(entry) ? (entry as unknown as Config) : undefined
      if (typeof entry === 'string' && !block) warn(`[fromPayloadBlocks] Block "${entry}" is referenced but not found. Pass your config.blocks as \`references\`.`)
      if (block && typeof block.slug === 'string' && !out.some((b) => b.slug === block.slug)) out.push(block)
    }
    for (const entry of Array.isArray(field.blocks) ? field.blocks : []) add(entry)
    for (const entry of Array.isArray(field.blockReferences) ? field.blockReferences : []) add(entry)
    return out
  }

  const result = [...definitions.values()]
  if (options.root) {
    const rootTypes = new Set(options.root.map(typeOf))
    for (const def of result) {
      if (def.parents || rootTypes.has(def.type) || options.overrides?.[def.payload?.slug ?? '']?.parents) continue
      const parents = result.filter((owner) => Object.values(owner.slots ?? {}).some((slot) => slot.allow?.includes(def.type))).map((owner) => owner.type)
      if (parents.length > 0) def.parents = parents
    }
  }
  return result
}

import type { Block, Config, Field } from 'payload'

export type FieldOwner = { kind: 'collection' | 'global' | 'block'; slug: string }

/**
 * Calls `visit` for every field of the config: collections, globals and shared blocks, at any
 * depth (groups, rows, collapsibles, tabs, arrays, and the blocks of blocks fields). Block
 * references (slugs) are visited once, through `config.blocks`.
 *
 * Plugins that use it change the field objects in place. Copies would break plugins that know
 * fields by object identity (the website builder keeps the functions of block fields that way).
 */
export function walkFields(config: Config, visit: (field: Field, owner: FieldOwner) => void) {
  const seen = new WeakSet<object>()
  const walk = (fields: readonly Field[] | undefined, owner: FieldOwner) => {
    for (const field of fields ?? []) {
      if (seen.has(field)) continue
      seen.add(field)
      visit(field, owner)
      if ('fields' in field && Array.isArray(field.fields)) walk(field.fields, owner)
      if (field.type === 'tabs') for (const tab of field.tabs) walk(tab.fields, owner)
      if (field.type === 'blocks') {
        for (const block of field.blocks ?? []) walkBlock(block)
      }
    }
  }
  const walkBlock = (block: Block | string) => {
    if (typeof block === 'string' || seen.has(block)) return
    seen.add(block)
    walk(block.fields, { kind: 'block', slug: block.slug })
  }
  for (const collection of config.collections ?? []) walk(collection.fields, { kind: 'collection', slug: collection.slug })
  for (const global of config.globals ?? []) walk(global.fields, { kind: 'global', slug: global.slug })
  for (const block of config.blocks ?? []) walkBlock(block)
}

/** Sets one admin component of a field, unless the field has its own. */
export function setAdminComponent(field: Field, key: 'Cell' | 'RowLabel', path: string): boolean {
  const admin = (field.admin ?? {}) as { components?: Record<string, unknown> }
  if (admin.components?.[key]) return false
  // Mutating on purpose: see walkFields.
  ;(field as { admin?: unknown }).admin = { ...admin, components: { ...admin.components, [key]: path } }
  return true
}

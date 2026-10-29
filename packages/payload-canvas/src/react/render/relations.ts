// `<path>.$url` bindings need to know which collection a relationship field points to
// (`bindingRelations`). `loadLayoutData` reads that from the Payload config and puts it on every
// collection list and repeat as the runtime-only `$relations` prop, because their items resolve
// their bindings later, in `RenderLayout`. So a site passes it nowhere.

import type { Payload } from 'payload'
import { bindingRelations, COLLECTION_LIST_BLOCK, REPEAT_BLOCK, type BindingRelations, type Block, type Layout } from '../../core'
import { isRecord } from './fields'

/** Runtime-only prop of collection lists and repeats: the `bindingRelations` their items use. Never stored. */
export const RELATIONS_PROP = '$relations'

const byConfig = new WeakMap<object, BindingRelations>()

/** The `bindingRelations` of the Payload config's collections, computed once per config. */
export function relationsOf(payload: Payload): BindingRelations {
  const config = payload.config as unknown as { collections?: ReadonlyArray<{ slug: string; fields: readonly unknown[] }> } | undefined
  if (!config) return {}
  let relations = byConfig.get(config)
  if (!relations) {
    relations = bindingRelations(config.collections ?? [])
    byConfig.set(config, relations)
  }
  return relations
}

/** Puts `relations` on every collection list and repeat (`$relations`). Same layout when there are none. Never mutates. */
export function withRelations(layout: Layout, relations: BindingRelations): Layout {
  if (Object.keys(relations).length === 0) return layout
  const visit = (blocks: Block[]): Block[] =>
    blocks.map((block) => {
      const repeats = block.type === COLLECTION_LIST_BLOCK || block.type === REPEAT_BLOCK
      const next: Block = repeats ? { ...block, props: { ...block.props, [RELATIONS_PROP]: relations } } : block
      if (!next.slots) return next
      return { ...next, slots: Object.fromEntries(Object.entries(next.slots).map(([name, children]) => [name, visit(children)])) }
    })
  return { ...layout, blocks: visit(layout.blocks) }
}

/** The `$relations` a list block carries, if any. */
export function relationsIn(props: Record<string, unknown> | undefined): BindingRelations | undefined {
  const value = props?.[RELATIONS_PROP]
  return isRecord(value) ? (value as BindingRelations) : undefined
}

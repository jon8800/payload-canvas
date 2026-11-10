// What a new block starts with when the editor adds it (`BlockDefinition.starter`), for example a
// Form block that starts as a ready contact form. Pure.

import { getBlockDefinition, starterSlots, withDefaultClasses } from './blocks'
import { withFieldDefaults } from './convertPayload'
import type { Block, BlockDefinition, StarterBlock } from './types'

/** One starter child as a real block: a new id, the type's default classes and field defaults, then its own data. */
function fromStarter(blocks: readonly BlockDefinition[], child: StarterBlock, makeId: () => string): Block {
  const def = getBlockDefinition(blocks, child.type)
  const { slots, props, ...rest } = child
  const block = withDefaultClasses({ ...rest, id: makeId() }, def)
  const merged = { ...withFieldDefaults({}, def?.fields ?? []), ...props }
  if (Object.keys(merged).length > 0) block.props = merged
  if (slots) block.slots = Object.fromEntries(Object.entries(slots).map(([name, list]) => [name, list.map((c) => fromStarter(blocks, c, makeId))]))
  return block
}

/**
 * A new block of `type` as the editor adds it: the type's default classes, its field defaults,
 * then its `starter` (props over the defaults, children per slot), else its `starterSlots` (a new
 * list starts with one list item). `classes: false`: no default classes (a Payload blocks field
 * without class storage).
 */
export function newBlockOf(blocks: readonly BlockDefinition[], type: string, makeId: () => string, options: { classes?: boolean } = {}): Block | null {
  const def = getBlockDefinition(blocks, type)
  if (!def) return null
  const id = makeId()
  const block: Block = options.classes === false ? { id, type } : withDefaultClasses({ id, type }, def)
  // Field defaults that are plain data, inside groups, rows and tabs too (function defaults were
  // stripped from the client config). From now on the block stores its own values.
  const props = { ...withFieldDefaults({}, def.fields), ...def.starter?.props }
  if (Object.keys(props).length > 0) block.props = props
  const slots = def.starter?.slots
    ? Object.fromEntries(Object.entries(def.starter.slots).map(([name, list]) => [name, list.map((child) => fromStarter(blocks, child, makeId))]))
    : starterSlots(blocks, type, makeId)
  if (slots && Object.keys(slots).length > 0) block.slots = slots
  return block
}

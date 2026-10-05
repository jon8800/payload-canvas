// Field access checks of the editor that need no React: inline editing uses them.

import { getBlockDefinition } from '../../../core'
import { accessPath, propAccessAt, propAccessRuleOf } from '../../../core/fieldAccess'
import type { Block } from '../../../core/types'
import type { Runtime } from '../runtime'

export const LOCKED_HINT = 'Read-only. You do not have permission to change this field.'

/** What the user may do with a prop of a block, from the latest answer of the server. */
export function propAccessNow(runtime: Runtime, block: Block, propPath: string): { read: boolean; update: boolean } {
  return propAccessAt(propAccessRuleOf(runtime.doc.meta.get().fieldAccess, block.id, block.type), propPath)
}

/**
 * The text that refuses inline editing of `propPath`, or null when the user may change it.
 * Names the field by its label when it is a top-level prop.
 */
export function lockedMessage(runtime: Runtime, block: Block, propPath: string): string | null {
  const access = propAccessNow(runtime, block, propPath)
  if (access.update) return null
  const top = accessPath(propPath).split('.')[0] ?? ''
  const field = getBlockDefinition(runtime.config.blocks, block.type)?.fields.find((f) => 'name' in f && f.name === top)
  const label = field && 'label' in field && typeof field.label === 'string' && field.label ? field.label : 'this text'
  return access.read
    ? `You cannot change ${label}. You do not have permission to edit it.`
    : 'You cannot edit this text. You do not have permission to see it.'
}

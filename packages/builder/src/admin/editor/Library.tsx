'use client'

import { useDraggable } from '@dnd-kit/core'

import { findBlock, findLocation, getBlockDefinition, slotNames } from '../../core'
import type { BlockDefinition, Position } from '../../core/types'
import { useRuntime, type DragData } from './runtime'

/**
 * Drag an item onto the canvas or the outline to insert a new block.
 * Click inserts it after the selected block, or at the end of the page.
 */
export function Library() {
  const { config } = useRuntime()
  return (
    <div className="builder-editor__panel">
      <h3 className="builder-editor__panel-title">Blocks</h3>
      <div className="builder-editor__library">
        {config.blocks.map((def) => (
          <LibraryItem key={def.type} def={def} />
        ))}
      </div>
    </div>
  )
}

function LibraryItem({ def }: { def: BlockDefinition }) {
  const runtime = useRuntime()
  const data: DragData = { source: { kind: 'new', blockType: def.type }, label: def.label }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `library:${def.type}`, data })

  const insert = () => {
    const block = runtime.createBlock(def.type)
    if (!block) return
    runtime.store.apply({ type: 'insert', block, to: clickPosition(runtime, def.type) }, { select: block.id })
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="builder-editor__library-item"
      title={def.ai?.description ?? def.label}
      onClick={insert}
      {...listeners}
      {...attributes}
    >
      {def.label}
    </button>
  )
}

/** True when `slot` of a block with type `ownerType` accepts `type`. The root list accepts all. */
function accepts(blocks: BlockDefinition[], ownerType: string | null, slot: string, type: string): boolean {
  if (ownerType === null) return true
  const allow = getBlockDefinition(blocks, ownerType)?.slots?.[slot]?.allow
  return !allow || allow.includes(type) || allow.includes('*')
}

/**
 * Into the selected container's first slot, else after the selected block, else at the end of
 * the page. Each choice must pass the slot's `allow` rule.
 */
function clickPosition(runtime: ReturnType<typeof useRuntime>, type: string): Position {
  const { blocks } = runtime.config
  const { layout, selectedId } = runtime.store.getState()
  const end: Position = { parentId: null, index: layout.blocks.length }
  const selected = selectedId ? findBlock(layout, selectedId) : null
  if (!selected) return end
  const slot = slotNames(getBlockDefinition(blocks, selected.type))[0]
  if (slot && accepts(blocks, selected.type, slot, type)) {
    return { parentId: selected.id, slot, index: selected.slots?.[slot]?.length ?? 0 }
  }
  const location = findLocation(layout, selected.id)
  if (!location) return end
  const parentType = location.parentId ? (findBlock(layout, location.parentId)?.type ?? null) : null
  if (!accepts(blocks, parentType, location.slot, type)) return end
  return { parentId: location.parentId, slot: location.slot, index: location.index + 1 }
}

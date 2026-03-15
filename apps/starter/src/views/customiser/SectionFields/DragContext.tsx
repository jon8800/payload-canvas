'use client'
import type { ClientBlock } from 'payload'
import React, { createContext, useCallback, useContext, useMemo, useState, useId } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { createPortal } from 'react-dom'
import { useForm } from '@payloadcms/ui'

export type BlockItem = {
  id: string
  blockType: string
  path: string
  rowIndex: number
  parentPath: string | null
  allowedBlocks: ClientBlock[]
  depth: number
}

type DragContextType = {
  activeItem: BlockItem | null
  overItem: BlockItem | null
  dropPosition: 'before' | 'after' | 'inside' | null
  registerBlock: (item: BlockItem) => void
  unregisterBlock: (id: string) => void
  blocks: Map<string, BlockItem>
  isDragging: boolean
}

const DragContext = createContext<DragContextType | undefined>(undefined)

export function useDragContext() {
  const context = useContext(DragContext)
  if (!context) {
    throw new Error('useDragContext must be used within a DragProvider')
  }
  return context
}

type DragProviderProps = {
  children: React.ReactNode
  onMoveBlock?: (
    sourceId: string,
    sourcePath: string,
    sourceIndex: number,
    targetPath: string,
    targetIndex: number,
  ) => void
}

export function DragProvider({ children, onMoveBlock }: DragProviderProps) {
  const { dispatchFields, setModified } = useForm()
  const [blocks, setBlocks] = useState<Map<string, BlockItem>>(new Map())
  const [activeItem, setActiveItem] = useState<BlockItem | null>(null)
  const [overItem, setOverItem] = useState<BlockItem | null>(null)
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const contextId = useId()

  const registerBlock = useCallback((item: BlockItem) => {
    setBlocks((prev) => {
      const next = new Map(prev)
      next.set(item.id, item)
      return next
    })
  }, [])

  const unregisterBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event
      const item = blocks.get(active.id as string)
      if (item) {
        setActiveItem(item)
        setIsDragging(true)
      }
    },
    [blocks]
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over, active, delta } = event

      if (!over || !active) {
        setOverItem(null)
        setDropPosition(null)
        return
      }

      const overId = over.id as string
      const overBlock = blocks.get(overId)
      const activeBlock = blocks.get(active.id as string)

      if (!overBlock || !activeBlock) {
        setOverItem(null)
        setDropPosition(null)
        return
      }

      const canDrop = overBlock.allowedBlocks.some(
        (block) => block.slug === activeBlock.blockType
      )

      if (!canDrop) {
        setOverItem(null)
        setDropPosition(null)
        return
      }

      setOverItem(overBlock)

      if (over.rect) {
        const overRect = over.rect
        const mouseY = overRect.top + overRect.height / 2 + delta.y
        const threshold = overRect.top + overRect.height / 2

        if (mouseY < threshold) {
          setDropPosition('before')
        } else {
          setDropPosition('after')
        }
      }
    },
    [blocks]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      const currentDropPosition = dropPosition

      setActiveItem(null)
      setOverItem(null)
      setDropPosition(null)
      setIsDragging(false)

      if (!over || !active || active.id === over.id) {
        return
      }

      const activeBlock = blocks.get(active.id as string)
      const overBlock = blocks.get(over.id as string)

      if (!activeBlock || !overBlock) return

      const canDrop = overBlock.allowedBlocks.some(
        (block) => block.slug === activeBlock.blockType
      )

      if (!canDrop) return

      let targetIndex = overBlock.rowIndex
      if (currentDropPosition === 'after') {
        targetIndex += 1
      }

      if (activeBlock.path === overBlock.path) {
        if (activeBlock.rowIndex < targetIndex) {
          targetIndex -= 1
        }

        if (activeBlock.rowIndex !== targetIndex) {
          dispatchFields({
            type: 'MOVE_ROW',
            moveFromIndex: activeBlock.rowIndex,
            moveToIndex: targetIndex,
            path: activeBlock.path,
          })
          setModified(true)
        }
      } else {
        if (onMoveBlock) {
          onMoveBlock(
            activeBlock.id,
            activeBlock.path,
            activeBlock.rowIndex,
            overBlock.path,
            targetIndex,
          )
        }
      }
    },
    [blocks, dropPosition, dispatchFields, setModified, onMoveBlock]
  )

  const handleDragCancel = useCallback(() => {
    setActiveItem(null)
    setOverItem(null)
    setDropPosition(null)
    setIsDragging(false)
  }, [])

  const blockIds = useMemo(() => Array.from(blocks.keys()), [blocks])

  const contextValue = useMemo(
    () => ({
      activeItem,
      overItem,
      dropPosition,
      registerBlock,
      unregisterBlock,
      blocks,
      isDragging,
    }),
    [activeItem, overItem, dropPosition, registerBlock, unregisterBlock, blocks, isDragging]
  )

  return (
    <DragContext.Provider value={contextValue}>
      <DndContext
        id={contextId}
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
      >
        <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
        {typeof document !== 'undefined' && createPortal(
          <DragOverlay dropAnimation={null}>
            {activeItem && (
              <div className="section-fields__drag-overlay">
                {activeItem.blockType}
              </div>
            )}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </DragContext.Provider>
  )
}

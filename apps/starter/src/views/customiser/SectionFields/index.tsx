// @ts-nocheck -- Ported from payload-customiser plugin
'use client'
import type {
  BlocksFieldClient,
  ClientBlock,
  ClientField,
  Row,
  SanitizedDocumentPermissions,
} from 'payload'

import {
  useField,
  useFormInitializing,
  useFormProcessing,
  useFormSubmitted,
  useTranslation,
  useConfig,
  BlocksDrawer,
  DrawerToggler,
  useForm,
  useDrawerSlug,
  ErrorPill,
} from '@payloadcms/ui'
import { createPortal } from 'react-dom'
import { useSortable } from '@dnd-kit/sortable'
import { getFieldPaths } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTranslation } from '@payloadcms/translations'
import { useSelectedSection } from '../context/SelectedSectionContext'
import { DragProvider, useDragContext, type BlockItem } from './DragContext'
import { InlineBlockAdder } from './InlineBlockAdder'
import './index.scss'

const baseClass = 'section-fields'

type Args = {
  readonly docPermissions: SanitizedDocumentPermissions
  readonly field: ClientField
  readonly readOnly?: boolean
  readonly schemaPathSegments: string[]
}

function ChevronIcon({ collapsed }: { collapsed?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

type ContextMenuItem = {
  label: string
  onClick: () => void
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      className={`${baseClass}__context-menu`}
      style={{ top: y, left: x }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`${baseClass}__context-menu-item`}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function DragHandleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  )
}

const SortableBlock: React.FC<{
  blocks: ClientBlock[]
  path: string
  row: Row
  rowIndex: number
  level?: number
  readOnly?: boolean
  schemaPath?: string
  errorPaths?: string[]
  hasSubmitted?: boolean
}> = ({ blocks, path, row, rowIndex, level = 0, readOnly, schemaPath, errorPaths = [], hasSubmitted }) => {
  const { i18n } = useTranslation()
  const { selectedSection, setSelectedSection } = useSelectedSection()
  const { dispatchFields, setModified } = useForm()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { activeItem, overItem, dropPosition, registerBlock, unregisterBlock, isDragging: isGlobalDragging } = useDragContext()

  const blockConfig = blocks.find((block) => block.slug === row.blockType)

  const rowPath = `${path}.${rowIndex}`

  const { value: blockName, setValue: setBlockName } = useField<string>({ path: `${rowPath}.blockName` })
  const { value: isHidden, setValue: setIsHidden } = useField<boolean>({ path: `${rowPath}._hidden` })
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isSelected = selectedSection === rowPath
  const nestedBlocksFields = blockConfig?.fields?.filter((field) => field.type === 'blocks') || []

  useEffect(() => {
    const item: BlockItem = {
      id: row.id,
      blockType: row.blockType,
      path,
      rowIndex,
      parentPath: level === 0 ? null : path,
      allowedBlocks: blocks,
      depth: level,
    }
    registerBlock(item)
    return () => unregisterBlock(row.id)
  }, [row.id, row.blockType, path, rowIndex, level, blocks, registerBlock, unregisterBlock])

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging: isSortableDragging,
  } = useSortable({
    id: row.id,
    disabled: readOnly,
    data: {
      type: 'block',
      blockType: row.blockType,
      path,
      rowIndex,
    },
  })

  const style: React.CSSProperties = {
    opacity: isSortableDragging ? 0.4 : 1,
    position: 'relative' as const,
  }

  const rowErrorCount = errorPaths.filter((errorPath) =>
    errorPath.startsWith(rowPath + '.')
  ).length
  const fieldHasErrors = hasSubmitted && rowErrorCount > 0

  const [nestedRowsState, setNestedRowsState] = useState<Record<string, boolean>>({})

  const handleNestedRowsChange = useCallback((fieldName: string, hasRows: boolean) => {
    setNestedRowsState(prev => {
      if (prev[fieldName] === hasRows) return prev
      return { ...prev, [fieldName]: hasRows }
    })
  }, [])

  const handleDuplicate = useCallback(() => {
    dispatchFields({ type: 'DUPLICATE_ROW', path, rowIndex })
    setModified(true)
  }, [dispatchFields, path, rowIndex, setModified])

  const handleRemove = useCallback(() => {
    dispatchFields({
      type: 'REMOVE_ROW',
      path,
      rowIndex,
    })
    setModified(true)
  }, [dispatchFields, path, rowIndex, setModified])

  const handleToggleHidden = useCallback(() => {
    setIsHidden(!isHidden)
    setModified(true)
  }, [isHidden, setIsHidden, setModified])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleSectionSelect = () => {
    setSelectedSection(rowPath)
  }

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  const handleStartEditing = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (readOnly) return
    setEditValue(blockName || '')
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSaveEdit = () => {
    const trimmedValue = editValue.trim()
    setBlockName(trimmedValue || null)
    setModified(true)
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  if (!blockConfig) return null

  const isOver = overItem?.id === row.id
  const showDropIndicatorBefore = isOver && dropPosition === 'before'
  const showDropIndicatorAfter = isOver && dropPosition === 'after'

  const canReceiveDrop = activeItem && activeItem.id !== row.id &&
    blocks.some((block) => block.slug === activeItem.blockType)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${baseClass}__block-wrapper`}
      data-block-depth={level}
    >
      {showDropIndicatorBefore && canReceiveDrop && (
        <div className={`${baseClass}__drop-indicator ${baseClass}__drop-indicator--before`} />
      )}
      <div
        className={[
          `${baseClass}__block-row`,
          isSelected && `${baseClass}__block-row--selected`,
          fieldHasErrors && `${baseClass}__block-row--has-errors`,
          isSortableDragging && `${baseClass}__block-row--dragging`,
          isHidden && `${baseClass}__block-row--hidden`,
        ].filter(Boolean).join(' ')}
        style={{ marginLeft: level > 0 ? `${level * 16}px` : undefined }}
        onContextMenu={handleContextMenu}
      >
        <div className={`${baseClass}__block-header`}>
          {!readOnly && (
            <div
              className={`${baseClass}__drag-handle`}
              {...attributes}
              {...listeners}
            >
              <DragHandleIcon />
            </div>
          )}
          {nestedBlocksFields.length > 0 && (
            <button
              type="button"
              className={[
                `${baseClass}__collapse-trigger`,
                isCollapsed && `${baseClass}__collapse-trigger--collapsed`,
              ].filter(Boolean).join(' ')}
              onClick={handleToggleCollapse}
              aria-expanded={!isCollapsed}
            >
              <ChevronIcon collapsed={isCollapsed} />
            </button>
          )}
          <div className={`${baseClass}__block-label`} onClick={handleSectionSelect}>
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                className={`${baseClass}__block-name-input`}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                placeholder={getTranslation(blockConfig.labels.singular, i18n)}
              />
            ) : (
              <>
                <span
                  className={`${baseClass}__block-name`}
                  onDoubleClick={handleStartEditing}
                  title="Double-click to rename"
                >
                  {blockName || getTranslation(blockConfig.labels.singular, i18n)}
                </span>
                {blockName && (
                  <span className={`${baseClass}__block-type`}>
                    {getTranslation(blockConfig.labels.singular, i18n)}
                  </span>
                )}
              </>
            )}
          </div>
          {fieldHasErrors && (
            <ErrorPill count={rowErrorCount} i18n={i18n} withMessage />
          )}
          <div className={`${baseClass}__block-actions`}>
            <button
              type="button"
              className={`${baseClass}__action-btn ${baseClass}__action-btn--danger`}
              onClick={handleRemove}
              title="Remove block"
            >
              <TrashIcon />
            </button>
            <button
              type="button"
              className={`${baseClass}__action-btn`}
              onClick={handleToggleHidden}
              title={isHidden ? 'Show block' : 'Hide block'}
            >
              {isHidden ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
      </div>
      {showDropIndicatorAfter && canReceiveDrop && (
        <div className={`${baseClass}__drop-indicator ${baseClass}__drop-indicator--after`} />
      )}
      {nestedBlocksFields.length > 0 && (
        <div className={`${baseClass}__nested-blocks`} style={{ display: isCollapsed ? 'none' : undefined }}>
          {nestedBlocksFields.map((nestedField) => {
            const nestedPath = `${rowPath}.${nestedField.name}`
            const nestedSchemaPath = schemaPath
              ? `${schemaPath}.${row.blockType}.${nestedField.name}`
              : `${row.blockType}.${nestedField.name}`

            return (
              <NestedBlocks
                key={nestedPath}
                nestedField={nestedField}
                nestedPath={nestedPath}
                level={level + 1}
                onRowsChange={(hasRows) => handleNestedRowsChange(nestedField.name, hasRows)}
                readOnly={readOnly}
                schemaPath={nestedSchemaPath}
                parentErrorPaths={errorPaths}
                hasSubmitted={hasSubmitted}
              />
            )
          })}
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          items={[
            { label: 'Duplicate', onClick: handleDuplicate },
            { label: 'Remove', onClick: handleRemove },
          ]}
        />
      )}
    </div>
  )
}

const NestedBlockAdder: React.FC<{
  blocks: ClientBlock[]
  path: string
  schemaPath: string
  level: number
  disabled?: boolean
}> = ({ blocks, path, schemaPath, level, disabled }) => {
  const { t } = useTranslation()
  const { addFieldRow } = useForm()
  const { setSelectedSection } = useSelectedSection()
  const drawerSlug = useDrawerSlug('nested-blocks-drawer')

  const labels = {
    plural: t('fields:blocks'),
    singular: t('fields:block'),
  }

  const handleAddRow = useCallback(
    (index: number, blockType?: string) => {
      if (blockType) {
        addFieldRow({
          blockType,
          path,
          rowIndex: index,
          schemaPath,
        })
        setSelectedSection(`${path}.${index}`)
      }
    },
    [addFieldRow, path, schemaPath, setSelectedSection],
  )

  if (disabled) return null

  return (
    <div className={`${baseClass}__nested-add-block`} style={{ marginLeft: `${level * 16}px` }}>
      <DrawerToggler
        className={`${baseClass}__nested-add-block-btn`}
        slug={drawerSlug}
      >
        <PlusIcon />
        Add block
      </DrawerToggler>
      <BlocksDrawer
        addRow={handleAddRow}
        addRowIndex={0}
        blocks={blocks}
        drawerSlug={drawerSlug}
        labels={labels}
      />
    </div>
  )
}

const NestedBlocks: React.FC<{
  nestedField: BlocksFieldClient
  nestedPath: string
  level: number
  onRowsChange?: (hasRows: boolean) => void
  readOnly?: boolean
  schemaPath: string
  parentErrorPaths?: string[]
  hasSubmitted?: boolean
}> = ({ nestedField, nestedPath, level, onRowsChange, readOnly, schemaPath, parentErrorPaths = [], hasSubmitted }) => {
  const { config } = useConfig()
  const { rows = [], errorPaths = [] } = useField<number>({
    hasRows: true,
    path: nestedPath,
  })
  const combinedErrorPaths = [...parentErrorPaths, ...errorPaths]

  useEffect(() => {
    onRowsChange?.(rows.length > 0)
  }, [rows.length, onRowsChange])

  const { maxRows } = nestedField
  const hasMaxRows = maxRows !== undefined && rows.length >= maxRows

  const nestedBlocks: ClientBlock[] = useMemo(() => {
    const raw = (nestedField as BlocksFieldClient & { blockReferences?: ClientBlock[] | string[] }).blockReferences ?? nestedField.blocks ?? []
    return raw.map((block) =>
      typeof block === 'string' ? config.blocksMap[block] : block
    ).filter(Boolean) as ClientBlock[]
  }, [nestedField, config.blocksMap])

  return (
    <div className={`${baseClass}__nested-container`}>
      {rows.map((nestedRow, nestedIndex) => (
        <React.Fragment key={nestedRow.id}>
          <InlineBlockAdder
            blocks={nestedBlocks}
            path={nestedPath}
            insertIndex={nestedIndex}
            schemaPath={schemaPath}
            disabled={hasMaxRows || readOnly}
          />
          <SortableBlock
            blocks={nestedBlocks}
            path={nestedPath}
            row={nestedRow}
            rowIndex={nestedIndex}
            level={level}
            readOnly={readOnly}
            schemaPath={schemaPath}
            errorPaths={combinedErrorPaths}
            hasSubmitted={hasSubmitted}
          />
        </React.Fragment>
      ))}
      <NestedBlockAdder
        blocks={nestedBlocks}
        path={nestedPath}
        schemaPath={schemaPath}
        level={level}
        disabled={hasMaxRows || readOnly}
      />
    </div>
  )
}

const AddBlockButton: React.FC<{
  blocks: ClientBlock[]
  path: string
  rowIndex: number
  schemaPath: string
  disabled?: boolean
}> = ({ blocks, path, rowIndex, schemaPath, disabled }) => {
  const { t } = useTranslation()
  const { addFieldRow } = useForm()
  const { setSelectedSection } = useSelectedSection()
  const drawerSlug = useDrawerSlug('blocks-drawer')

  const labels = {
    plural: t('fields:blocks'),
    singular: t('fields:block'),
  }

  const handleAddRow = useCallback(
    (index: number, blockType?: string) => {
      if (blockType) {
        addFieldRow({
          blockType,
          path,
          rowIndex: index,
          schemaPath,
        })
        setSelectedSection(`${path}.${index}`)
      }
    },
    [addFieldRow, path, schemaPath, setSelectedSection],
  )

  if (disabled) return null

  return (
    <div className={`${baseClass}__add-block`}>
      <DrawerToggler
        className={`${baseClass}__add-block-btn btn btn--style-secondary btn--size-small`}
        disabled={disabled}
        slug={drawerSlug}
      >
        <PlusIcon />
        Add Block
      </DrawerToggler>

      <BlocksDrawer
        addRow={handleAddRow}
        addRowIndex={rowIndex}
        blocks={blocks}
        drawerSlug={drawerSlug}
        labels={labels}
      />
    </div>
  )
}

function SectionFieldsContent({
  docPermissions,
  field,
  readOnly: readOnlyProp,
  schemaPathSegments,
}: Args) {
  const formInitializing = useFormInitializing()
  const formProcessing = useFormProcessing()
  const { i18n } = useTranslation()

  const readOnly = readOnlyProp || formInitializing || formProcessing

  const { path, schemaPath } = getFieldPaths({
    field,
    index: 0,
    parentIndexPath: '',
    parentPath: '',
    parentSchemaPath: schemaPathSegments.join('.'),
  })

  const { config } = useConfig()
  const { label, blocks: fieldBlocks, blockReferences, maxRows } = field as BlocksFieldClient & { blockReferences?: ClientBlock[] | string[] }
  const blocks: ClientBlock[] = useMemo(() => {
    const raw = fieldBlocks ?? blockReferences ?? []
    return raw.map((block) =>
      typeof block === 'string' ? config.blocksMap[block] : block
    ).filter(Boolean) as ClientBlock[]
  }, [fieldBlocks, blockReferences, config.blocksMap])

  const { rows = [], errorPaths = [] } = useField<number>({
    hasRows: true,
    path,
  })
  const hasSubmitted = useFormSubmitted()

  const hasMaxRows = maxRows !== undefined && rows.length >= maxRows

  return (
    <div className={[baseClass, 'document-fields', 'document-fields__sections'].filter(Boolean).join(' ')}>
      <div className={`${baseClass}__container`}>
        <header className={`${baseClass}__header`}>
          <h3 className={`${baseClass}__title`}>{getTranslation(label, i18n)}</h3>
        </header>
        <div className={`${baseClass}__blocks-list`}>
          {rows.map((row, i) => (
            <React.Fragment key={row.id}>
              <InlineBlockAdder
                blocks={blocks}
                path={path}
                insertIndex={i}
                schemaPath={schemaPath}
                disabled={hasMaxRows || readOnly}
              />
              <SortableBlock
                blocks={blocks}
                path={path}
                row={row}
                rowIndex={i}
                readOnly={readOnly}
                schemaPath={schemaPath}
                errorPaths={errorPaths}
                hasSubmitted={hasSubmitted}
              />
            </React.Fragment>
          ))}
          <AddBlockButton
            blocks={blocks}
            path={path}
            rowIndex={rows.length}
            schemaPath={schemaPath}
            disabled={hasMaxRows || readOnly}
          />
        </div>
      </div>
    </div>
  )
}

export function SectionFields(props: Args) {
  const { dispatchFields, setModified, getData } = useForm()

  const handleMoveBlock = useCallback(
    (
      sourceId: string,
      sourcePath: string,
      sourceIndex: number,
      targetPath: string,
      targetIndex: number,
    ) => {
      const formData = getData()
      const sourcePathParts = sourcePath.split('.')
      let sourceArray: unknown = formData

      for (const part of sourcePathParts) {
        const index = parseInt(part, 10)
        if (!isNaN(index)) {
          sourceArray = (sourceArray as unknown[])[index]
        } else {
          sourceArray = (sourceArray as Record<string, unknown>)[part]
        }
      }

      if (!Array.isArray(sourceArray)) return

      const rowData = sourceArray[sourceIndex]
      if (!rowData) return

      if (sourcePath === targetPath) {
        dispatchFields({
          type: 'MOVE_ROW',
          moveFromIndex: sourceIndex,
          moveToIndex: targetIndex,
          path: sourcePath,
        })
      } else {
        dispatchFields({
          type: 'REMOVE_ROW',
          path: sourcePath,
          rowIndex: sourceIndex,
        })

        dispatchFields({
          type: 'ADD_ROW',
          path: targetPath,
          rowIndex: targetIndex,
          blockType: (rowData as { blockType: string }).blockType,
        })
      }

      setModified(true)
    },
    [dispatchFields, setModified, getData]
  )

  return (
    <DragProvider onMoveBlock={handleMoveBlock}>
      <SectionFieldsContent {...props} />
    </DragProvider>
  )
}

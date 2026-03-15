// @ts-nocheck -- Ported from payload-customiser plugin
'use client'
import type { useDraggableSortable } from '@payloadcms/ui/elements/DraggableSortable/useDraggableSortable'
import type { ClientBlock, ClientField, Labels, Row, SanitizedFieldPermissions } from 'payload'

import { getTranslation } from '@payloadcms/translations'
import {
  Collapsible,
  ErrorPill,
  Pill,
  RenderFields,
  SectionTitle,
  ShimmerEffect,
  useFormSubmitted,
  useTranslation,
} from '@payloadcms/ui'
import { useThrottledValue } from '@payloadcms/ui/hooks/useThrottledValue'
import React from 'react'

import { RowActions } from './RowActions'

type UseDraggableSortableReturn = ReturnType<typeof useDraggableSortable>
type RenderFieldsProps = Parameters<typeof RenderFields>[0]
const baseClass = 'blocks-field'

type BlocksFieldProps = {
  addRow: (rowIndex: number, blockType: string) => Promise<void> | void
  block: ClientBlock
  blocks: ClientBlock[]
  duplicateRow: (rowIndex: number) => void
  errorCount: number
  fields: ClientField[]
  hasMaxRows?: boolean
  isLoading?: boolean
  isSortable?: boolean
  Label?: React.ReactNode
  labels: Labels
  moveRow: (fromIndex: number, toIndex: number) => void
  parentPath: string
  path: string
  permissions: SanitizedFieldPermissions
  readOnly: boolean
  removeRow: (rowIndex: number) => void
  row: Row
  rowCount: number
  rowIndex: number
  schemaPath: string
  setCollapse: (id: string, collapsed: boolean) => void
} & UseDraggableSortableReturn

export const BlockRow: React.FC<BlocksFieldProps> = ({
  addRow,
  attributes,
  block,
  blocks,
  duplicateRow,
  errorCount,
  fields,
  hasMaxRows,
  isLoading: isLoadingFromProps,
  isSortable,
  Label,
  labels,
  listeners,
  moveRow,
  parentPath,
  path,
  permissions,
  readOnly,
  removeRow,
  row,
  rowCount,
  rowIndex,
  schemaPath,
  setCollapse,
  setNodeRef,
  transform,
}) => {
  const isLoading = useThrottledValue(isLoadingFromProps, 500)

  const { i18n } = useTranslation()
  const hasSubmitted = useFormSubmitted()

  const fieldHasErrors = hasSubmitted && errorCount > 0

  const classNames = [
    `${baseClass}__row`,
    fieldHasErrors ? `${baseClass}__row--has-errors` : `${baseClass}__row--no-errors`,
  ]
    .filter(Boolean)
    .join(' ')

  let blockPermissions: RenderFieldsProps['permissions'] = undefined

  if (permissions === true) {
    blockPermissions = true
  } else {
    const permissionsBlockSpecific = permissions?.blocks?.[block.slug]
    if (permissionsBlockSpecific === true) {
      blockPermissions = true
    } else {
      blockPermissions = permissionsBlockSpecific?.fields
    }
  }

  return (
    <div
      id={`${parentPath?.split('.').join('-')}-row-${rowIndex}`}
      key={`${parentPath}-row-${rowIndex}`}
      ref={setNodeRef}
      style={{
        transform,
      }}
    >
      <RenderFields
        className={`${baseClass}__fields`}
        fields={fields.filter((field) => field.type !== 'blocks')}
        margins="small"
        parentIndexPath=""
        parentPath={path}
        parentSchemaPath={schemaPath}
        permissions={blockPermissions}
        readOnly={readOnly}
      />
    </div>
  )
}

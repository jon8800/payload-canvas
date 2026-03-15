'use client'
import React, { useState, useCallback } from 'react'
import { DrawerToggler, BlocksDrawer, useDrawerSlug, useForm } from '@payloadcms/ui'
import { useTranslation } from '@payloadcms/ui'
import type { ClientBlock } from 'payload'
import { useSelectedSection } from '../context/SelectedSectionContext'
import './InlineBlockAdder.scss'

const baseClass = 'inline-block-adder'

function PlusIcon() {
  return (
    <svg
      width="12"
      height="12"
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

type Props = {
  blocks: ClientBlock[]
  path: string
  insertIndex: number
  schemaPath: string
  disabled?: boolean
}

export function InlineBlockAdder({ blocks, path, insertIndex, schemaPath, disabled }: Props) {
  const [isHovered, setIsHovered] = useState(false)
  const { t } = useTranslation()
  const { addFieldRow } = useForm()
  const { setSelectedSection } = useSelectedSection()
  const drawerSlug = useDrawerSlug(`inline-blocks-drawer-${path}-${insertIndex}`)

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
    <div
      className={baseClass}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={[
        `${baseClass}__trigger`,
        isHovered && `${baseClass}__trigger--visible`
      ].filter(Boolean).join(' ')}>
        <div className={`${baseClass}__line`} />
        <DrawerToggler
          className={`${baseClass}__button`}
          slug={drawerSlug}
        >
          <PlusIcon />
        </DrawerToggler>
        <div className={`${baseClass}__line`} />
      </div>

      <BlocksDrawer
        addRow={handleAddRow}
        addRowIndex={insertIndex}
        blocks={blocks}
        drawerSlug={drawerSlug}
        labels={labels}
      />
    </div>
  )
}

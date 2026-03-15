'use client'

import type { UseDraggableArguments } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'

import { DragHandleIcon, useTranslation } from '@payloadcms/ui'
import React from 'react'

const baseClass = 'section-row-button'

type DragHandleProps = {
  attributes: UseDraggableArguments['attributes']
  listeners: SyntheticListenerMap
} & UseDraggableArguments

export type Props = {
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
  dragHandleProps?: DragHandleProps
  header?: React.ReactNode
  onClick?: () => void
  path?: string
}

export const SectionRowButton: React.FC<Props> = ({
  actions,
  children,
  className,
  dragHandleProps,
  header,
  onClick,
  path,
}) => {
  const { t } = useTranslation()

  return (
    <div
      className={[baseClass, className, dragHandleProps && `${baseClass}--has-drag-handle`]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={`${baseClass}__toggle-wrap`}>
        <button onClick={onClick} type="button">
          <span>{t('fields:toggleBlock')}</span>
        </button>
        {dragHandleProps && (
          <div
            className={`${baseClass}__drag`}
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
          >
            <DragHandleIcon />
          </div>
        )}
        {header ? (
          <div
            className={[
              `${baseClass}__header-wrap`,
              dragHandleProps && `${baseClass}__header-wrap--has-drag-handle`,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {header}
          </div>
        ) : null}
      </div>
    </div>
  )
}

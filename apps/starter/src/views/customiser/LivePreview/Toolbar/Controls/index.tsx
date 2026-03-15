// @ts-nocheck -- Ported from payload-customiser plugin
'use client'

import type { EditViewProps } from 'payload'

import { ChevronIcon, LinkIcon, Popup, PopupList, useTranslation, XIcon } from '@payloadcms/ui'
import React from 'react'

import { useLivePreviewContext } from '../../Context/context'
import { PreviewFrameSizeInput } from '../SizeInput/index'
import './index.scss'

const baseClass = 'live-preview-toolbar-controls'

export const ToolbarControls: React.FC<EditViewProps> = () => {
  const { breakpoint, breakpoints, setBreakpoint, setPreviewWindowType, url } =
    useLivePreviewContext()
  const { t } = useTranslation()

  const customOption = {
    label: t('general:custom'),
    value: 'custom',
  }

  return (
    <div className={baseClass}>
      {breakpoints?.length > 0 && (
        <Popup
          button={
            <React.Fragment>
              <span>
                {breakpoints.find((bp) => bp.name == breakpoint)?.label ?? customOption.label}
              </span>
              &nbsp;
              <ChevronIcon className={`${baseClass}__chevron`} />
            </React.Fragment>
          }
          className={`${baseClass}__breakpoint`}
          horizontalAlign="right"
          render={({ close }) => (
            <PopupList.ButtonGroup>
              <React.Fragment>
                {breakpoints.map((bp) => (
                  <PopupList.Button
                    active={bp.name == breakpoint}
                    key={bp.name}
                    onClick={() => {
                      setBreakpoint(bp.name)
                      close()
                    }}
                  >
                    {bp.label}
                  </PopupList.Button>
                ))}
                {breakpoint === 'custom' && (
                  <PopupList.Button
                    active={breakpoint == customOption.value}
                    onClick={() => {
                      setBreakpoint(customOption.value)
                      close()
                    }}
                  >
                    {customOption.label}
                  </PopupList.Button>
                )}
              </React.Fragment>
            </PopupList.ButtonGroup>
          )}
          showScrollbar
          verticalAlign="bottom"
        />
      )}
      <div className={`${baseClass}__device-size`}>
        <PreviewFrameSizeInput axis="x" />
        <span className={`${baseClass}__size-divider`}>
          <XIcon />
        </span>
        <PreviewFrameSizeInput axis="y" />
      </div>
      <a
        className={`${baseClass}__external`}
        href={url}
        onClick={(e) => {
          e.preventDefault()
          setPreviewWindowType('popup')
        }}
        type="button"
      >
        <LinkIcon />
      </a>
    </div>
  )
}

// @ts-nocheck -- Ported from payload-customiser plugin
'use client'

import type { EditViewProps } from 'payload'

import React from 'react'

import { useLivePreviewContext } from '../Context/context'
import { DeviceContainer } from '../DeviceContainer/index'
import { IFrame } from '../IFrame/index'
import { LivePreviewToolbar } from '../Toolbar/index'
import './index.scss'

const baseClass = 'live-preview-window'

export const LivePreview: React.FC<EditViewProps> = (props) => {
  const {
    iframeRef,
    previewWindowType,
    setIframeHasLoaded,
    url,
  } = useLivePreviewContext()

  const { breakpoint } = useLivePreviewContext()

  if (previewWindowType === 'iframe') {
    return (
      <div
        className={[
          baseClass,
          `${baseClass}--is-live-previewing`,
          breakpoint && breakpoint !== 'responsive' && `${baseClass}--has-breakpoint`,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={`${baseClass}__wrapper`}>
          <LivePreviewToolbar {...props} />
          <div className={`${baseClass}__main`}>
            <DeviceContainer>
              {url ? (
                <IFrame ref={iframeRef} setIframeHasLoaded={setIframeHasLoaded} url={url} />
              ) : (
                <div
                  style={{
                    backgroundColor: 'var(--theme-elevation-50)',
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--theme-elevation-500)',
                    fontSize: 'var(--font-body-size-m)',
                  }}
                >
                  Save the document with a title to enable preview
                </div>
              )}
            </DeviceContainer>
          </div>
        </div>
      </div>
    )
  }
}

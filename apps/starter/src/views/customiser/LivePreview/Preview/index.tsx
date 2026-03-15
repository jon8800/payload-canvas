// @ts-nocheck -- Ported from payload-customiser plugin
'use client'

import type { EditViewProps } from 'payload'

import { reduceFieldsToValues } from 'payload/shared'
import React, { useEffect } from 'react'
import { useAllFormFields, useDocumentEvents, useDocumentInfo, useLocale } from '@payloadcms/ui'

import { useLivePreviewContext } from '../Context/context'
import { DeviceContainer } from '../DeviceContainer/index'
import { IFrame } from '../IFrame/index'
import { LivePreviewToolbar } from '../Toolbar/index'
import './index.scss'

const baseClass = 'live-preview-window'

/**
 * Syncs form field changes to the live preview iframe via postMessage.
 * This mirrors Payload's built-in LivePreviewWindow behavior.
 */
function LivePreviewSync() {
  const { appIsReady, iframeRef, popupRef, previewWindowType, url } = useLivePreviewContext()
  const [formState] = useAllFormFields()
  const { id, collectionSlug, globalSlug } = useDocumentInfo()
  const locale = useLocale()
  const { mostRecentUpdate } = useDocumentEvents()

  // Send form data to the preview iframe/popup whenever form state changes
  useEffect(() => {
    if (!appIsReady || !formState) return

    const values = reduceFieldsToValues(formState, true)
    if (!values.id) {
      values.id = id
    }

    const message = {
      type: 'payload-live-preview',
      collectionSlug,
      data: values,
      externallyUpdatedRelationship: mostRecentUpdate,
      globalSlug,
      locale: locale.code,
    }

    if (previewWindowType === 'popup' && popupRef?.current) {
      popupRef.current.postMessage(message, url)
    }

    if (previewWindowType === 'iframe' && iframeRef?.current) {
      iframeRef.current.contentWindow?.postMessage(message, url)
    }
  }, [
    formState,
    url,
    collectionSlug,
    globalSlug,
    id,
    previewWindowType,
    popupRef,
    appIsReady,
    iframeRef,
    mostRecentUpdate,
    locale,
  ])

  // Send document event notifications to the preview
  useEffect(() => {
    if (!appIsReady) return

    const message = { type: 'payload-document-event' }

    if (previewWindowType === 'popup' && popupRef?.current) {
      popupRef.current.postMessage(message, url)
    }

    if (previewWindowType === 'iframe' && iframeRef?.current) {
      iframeRef.current.contentWindow?.postMessage(message, url)
    }
  }, [mostRecentUpdate, iframeRef, popupRef, previewWindowType, url, appIsReady])

  return null
}

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
        <LivePreviewSync />
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

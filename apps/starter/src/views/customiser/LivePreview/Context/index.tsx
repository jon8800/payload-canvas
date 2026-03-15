// @ts-nocheck -- Ported from payload-customiser plugin
'use client'
import type { ClientField, LivePreviewConfig } from 'payload'

import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'

function fieldSchemaToJSON(fieldSchema: ClientField[] | undefined) {
  if (!fieldSchema) return undefined
  return JSON.parse(JSON.stringify(fieldSchema))
}

import React, { useCallback, useEffect, useMemo, useState } from 'react'

import type { usePopupWindow } from '../usePopupWindow'

import { customCollisionDetection } from './collisionDetection'
import { LivePreviewContext } from './context'
import { sizeReducer } from './sizeReducer'

/**
 * Ensures the URL is absolute. Relative URLs (e.g., `/next/preview?...`) need to be
 * converted to absolute so that origin checks against postMessage events work correctly.
 */
function formatAbsoluteURL(incomingURL: string | undefined): string | undefined {
  if (!incomingURL) return undefined
  if (incomingURL.startsWith('http://') || incomingURL.startsWith('https://')) return incomingURL
  try {
    return new URL(incomingURL, window.location.origin).href
  } catch {
    return incomingURL
  }
}

export type LivePreviewProviderProps = {
  appIsReady?: boolean
  breakpoints?: LivePreviewConfig['breakpoints']
  children: React.ReactNode
  deviceSize?: {
    height: number
    width: number
  }
  fieldSchema: ClientField[]
  isPopupOpen?: boolean
  openPopupWindow?: ReturnType<typeof usePopupWindow>['openPopupWindow']
  popupRef?: React.RefObject<Window>
  url?: string
}

export const LivePreviewProvider: React.FC<LivePreviewProviderProps> = ({
  breakpoints,
  children,
  fieldSchema,
  isPopupOpen,
  openPopupWindow,
  popupRef,
  url: urlFromProps,
}) => {
  // Convert relative URLs to absolute so origin checks work with postMessage
  const url = useMemo(() => formatAbsoluteURL(urlFromProps), [urlFromProps])

  const [previewWindowType, setPreviewWindowType] = useState<'iframe' | 'popup'>('iframe')

  const [appIsReady, setAppIsReady] = useState(false)
  const [listeningForMessages, setListeningForMessages] = useState(false)

  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  const [iframeHasLoaded, setIframeHasLoaded] = useState(false)

  const [zoom, setZoom] = useState(1)

  const [position, setPosition] = useState({ x: 0, y: 0 })

  const [size, setSize] = React.useReducer(sizeReducer, { height: 0, width: 0 })

  const [measuredDeviceSize, setMeasuredDeviceSize] = useState({
    height: 0,
    width: 0,
  })

  const [breakpoint, setBreakpoint] =
    React.useState<LivePreviewConfig['breakpoints'][0]['name']>('responsive')

  const [fieldSchemaJSON] = useState(() => {
    return fieldSchemaToJSON(fieldSchema)
  })

  const toolbarSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const handleDragEnd = (ev) => {
    if (ev.over && ev.over.id === 'live-preview-area') {
      const newPos = {
        x: position.x + ev.delta.x,
        y: position.y + ev.delta.y,
      }

      setPosition(newPos)
    }
  }

  const setWidth = useCallback(
    (width) => {
      setSize({ type: 'width', value: width })
    },
    [setSize],
  )

  const setHeight = useCallback(
    (height) => {
      setSize({ type: 'height', value: height })
    },
    [setSize],
  )

  useEffect(() => {
    const foundBreakpoint = breakpoints?.find((bp) => bp.name === breakpoint)

    if (
      foundBreakpoint &&
      breakpoint !== 'responsive' &&
      breakpoint !== 'custom' &&
      typeof foundBreakpoint?.width === 'number' &&
      typeof foundBreakpoint?.height === 'number'
    ) {
      setSize({
        type: 'reset',
        value: {
          height: foundBreakpoint.height,
          width: foundBreakpoint.width,
        },
      })
    }
  }, [breakpoint, breakpoints])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        url?.startsWith(event.origin) &&
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'payload-live-preview'
      ) {
        if (event.data.ready) {
          setAppIsReady(true)
        }
      }
    }

    window.addEventListener('message', handleMessage)

    setListeningForMessages(true)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [url, listeningForMessages])

  const handleWindowChange = useCallback(
    (type: 'iframe' | 'popup') => {
      setAppIsReady(false)
      setPreviewWindowType(type)
      if (type === 'popup') {
        openPopupWindow()
      }
    },
    [openPopupWindow],
  )

  useEffect(() => {
    const newPreviewWindowType = isPopupOpen ? 'popup' : 'iframe'

    if (newPreviewWindowType !== previewWindowType) {
      handleWindowChange('iframe')
    }
  }, [previewWindowType, isPopupOpen, handleWindowChange])

  return (
    <LivePreviewContext.Provider
      value={{
        appIsReady,
        breakpoint,
        breakpoints,
        fieldSchemaJSON,
        iframeHasLoaded,
        iframeRef,
        isPopupOpen,
        measuredDeviceSize,
        openPopupWindow,
        popupRef,
        previewWindowType,
        setAppIsReady,
        setBreakpoint,
        setHeight,
        setIframeHasLoaded,
        setMeasuredDeviceSize,
        setPreviewWindowType: handleWindowChange,
        setSize,
        setToolbarPosition: setPosition,
        setWidth,
        setZoom,
        size,
        toolbarPosition: position,
        url,
        zoom,
      }}
    >
      <DndContext
        id="live-preview-toolbar"
        sensors={toolbarSensors}
        collisionDetection={customCollisionDetection}
        onDragEnd={handleDragEnd}
      >
        {listeningForMessages && children}
      </DndContext>
    </LivePreviewContext.Provider>
  )
}

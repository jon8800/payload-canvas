// @ts-nocheck -- Ported from payload-customiser plugin
'use client'
import { useResize } from '@payloadcms/ui'
import React, { useEffect } from 'react'

import { useLivePreviewContext } from '../Context/context'

export const DeviceContainer: React.FC<{
  children: React.ReactNode
}> = (props) => {
  const { children } = props

  const deviceFrameRef = React.useRef<HTMLDivElement>(null)
  const outerFrameRef = React.useRef<HTMLDivElement>(null)

  const { breakpoint, setMeasuredDeviceSize, size: desiredSize, zoom } = useLivePreviewContext()

  const { size: measuredDeviceSize } = useResize(deviceFrameRef.current)
  const { size: outerFrameSize } = useResize(outerFrameRef.current)

  let deviceIsLargerThanFrame: boolean = false

  useEffect(() => {
    if (measuredDeviceSize) {
      setMeasuredDeviceSize(measuredDeviceSize)
    }
  }, [measuredDeviceSize, setMeasuredDeviceSize])

  let x = '0'
  let margin = '0'

  if (breakpoint && breakpoint !== 'responsive') {
    x = '-50%'

    if (
      desiredSize &&
      measuredDeviceSize &&
      typeof zoom === 'number' &&
      typeof desiredSize.width === 'number' &&
      typeof desiredSize.height === 'number' &&
      typeof measuredDeviceSize.width === 'number' &&
      typeof measuredDeviceSize.height === 'number'
    ) {
      margin = '0 auto'
      const scaledDesiredWidth = desiredSize.width / zoom
      const scaledDeviceWidth = measuredDeviceSize.width * zoom
      const scaledDeviceDifferencePixels = scaledDesiredWidth - desiredSize.width
      deviceIsLargerThanFrame = scaledDeviceWidth > outerFrameSize.width

      if (deviceIsLargerThanFrame) {
        if (zoom > 1) {
          const differenceFromDeviceToFrame = measuredDeviceSize.width - outerFrameSize.width
          if (differenceFromDeviceToFrame < 0) {
            x = `${differenceFromDeviceToFrame / 2}px`
          } else {
            x = '0'
          }
        } else {
          x = '0'
        }
      } else {
        if (zoom >= 1) {
          x = `${scaledDeviceDifferencePixels / 2}px`
        } else {
          const differenceFromDeviceToFrame = outerFrameSize.width - scaledDeviceWidth
          x = `${differenceFromDeviceToFrame / 2}px`
          margin = '0'
        }
      }
    }
  }

  let width = zoom ? `${100 / zoom}%` : '100%'
  let height = zoom ? `${100 / zoom}%` : '100%'

  if (breakpoint !== 'responsive') {
    width = `${desiredSize?.width / (typeof zoom === 'number' ? zoom : 1)}px`
    height = `${desiredSize?.height / (typeof zoom === 'number' ? zoom : 1)}px`
  }

  return (
    <div
      ref={outerFrameRef}
      style={{
        height: '100%',
        width: '100%',
      }}
    >
      <div
        ref={deviceFrameRef}
        style={{
          height,
          margin,
          transform: `translate3d(${x}, 0, 0)`,
          width,
        }}
      >
        {children}
      </div>
    </div>
  )
}

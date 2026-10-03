'use client'
import React, { useCallback } from 'react'

import { useLivePreviewContext } from '../../Context/context'
import './index.scss'

const baseClass = 'toolbar-input'

export const PreviewFrameSizeInput: React.FC<{
  axis?: 'x' | 'y'
}> = (props) => {
  const { axis } = props

  const { breakpoint, measuredDeviceSize, setBreakpoint, setSize, size, zoom } =
    useLivePreviewContext()

  const [internalState, setInternalState] = React.useState<number>(
    (axis === 'x' ? measuredDeviceSize?.width : measuredDeviceSize?.height) || 0,
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = Number(e.target.value)

      if (newValue < 0) {
        newValue = 0
      }

      setInternalState(newValue)
      setBreakpoint('custom')

      setSize({
        type: 'reset',
        value: {
          height: axis === 'y' ? newValue : Number(measuredDeviceSize?.height.toFixed(0)) * zoom,
          width: axis === 'x' ? newValue : Number(measuredDeviceSize?.width.toFixed(0)) * zoom,
        },
      })
    },
    [axis, setBreakpoint, measuredDeviceSize, setSize, zoom],
  )

  // Sync the input from the context during render when the source value changes.
  let syncedValue: number | undefined
  if (breakpoint === 'responsive' && measuredDeviceSize) {
    syncedValue =
      Number((axis === 'x' ? measuredDeviceSize.width : measuredDeviceSize.height).toFixed(0)) *
      zoom
  } else if (breakpoint !== 'responsive' && size) {
    syncedValue = axis === 'x' ? size.width : size.height
  }

  const [prevSyncedValue, setPrevSyncedValue] = React.useState<number | undefined | null>(null)
  if (syncedValue !== prevSyncedValue) {
    setPrevSyncedValue(syncedValue)
    if (syncedValue !== undefined) {
      setInternalState(syncedValue)
    }
  }

  return (
    <input
      className={baseClass}
      min={0}
      name={axis === 'x' ? 'live-preview-width' : 'live-preview-height'}
      onChange={handleChange}
      step={1}
      type="number"
      value={internalState || 0}
    />
  )
}

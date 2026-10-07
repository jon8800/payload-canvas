'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useRef } from 'react'

import { THEME_CHANNEL } from '../config'

/**
 * Renders nothing. After each save of the theme global it posts on the theme BroadcastChannel,
 * so every open builder canvas (any tab of this site) reloads the theme at once.
 */
export function ThemeSaveSignal() {
  const { savedDocumentData } = useDocumentInfo()
  const updatedAt = typeof savedDocumentData?.updatedAt === 'string' ? savedDocumentData.updatedAt : null
  const first = useRef(updatedAt)

  useEffect(() => {
    if (!updatedAt || updatedAt === first.current || typeof BroadcastChannel === 'undefined') return
    first.current = updatedAt
    const channel = new BroadcastChannel(THEME_CHANNEL)
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel has no target origin
    channel.postMessage({ type: 'theme-saved', updatedAt })
    channel.close()
  }, [updatedAt])

  return null
}

'use client'

// Opens the thread named in the URL (`?comment=34`, see `COMMENT_PARAM`): comment mode, the thread's
// popover, and its block selected and scrolled into view. Waits until the comments loaded and the
// canvas measured its blocks. The dashboard's "Open comments" widget links here.

import { useSearchParams } from '@payloadcms/ui'
import { useEffect } from 'react'

import { COMMENT_PARAM } from '../../../comments/shared'
import type { Runtime } from '../runtime'

export function useCommentFromURL(runtime: Runtime): void {
  const threadId = useSearchParams().get(COMMENT_PARAM)
  useEffect(() => {
    const comments = runtime.comments
    if (!threadId || !comments) return
    let done = false
    const unsubscribe: Array<() => void> = []
    const stop = () => unsubscribe.forEach((off) => off())
    const tryOpen = () => {
      if (done || !comments.loaded.get() || !runtime.measurement.get()) return
      done = true
      stop()
      const thread = comments.focus(threadId)
      if (!thread) {
        runtime.warn('That comment no longer exists.')
        return
      }
      if (!thread.blockId) return
      runtime.store.select(thread.blockId)
      runtime.postToCanvas({ type: 'scrollIntoView', id: thread.blockId })
    }
    unsubscribe.push(comments.loaded.subscribe(tryOpen), runtime.measurement.subscribe(tryOpen))
    tryOpen()
    return stop
  }, [runtime, threadId])
}

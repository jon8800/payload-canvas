// Block animations in the canvas. The canvas never animates on its own: blocks show their final
// state. The editor's "Play animations" toggle (`motionPlay`) runs the runtime as on the site, and
// its Preview (`motionPreview`) plays one block once.

import { MOTION_ATTR, type BlockMotion } from '../../core'

import { previewMotion, startMotion } from '../motion/runtime'

/** How long a preview waits for its block to render with the new settings. */
const PREVIEW_WAIT_MS = 1000
const RETRY_MS = 80

export type CanvasMotion = {
  play: (on: boolean) => void
  preview: (id: string) => void
  dispose: () => void
}

/**
 * `motionOf` gives a block's motion in the newest layout from the admin. A preview waits until
 * the block renders with exactly those settings (the edit that asked for it may not be on screen
 * yet), for up to a second. `onSettled` runs when a preview ends and when playing stops: blocks are
 * back in place, so the editor measures them again (a transform does not resize anything, so no
 * observer notices it).
 */
export function createCanvasMotion(motionOf: (id: string) => BlockMotion | undefined, onSettled: () => void = () => {}): CanvasMotion {
  let stop: (() => void) | null = null
  let frame = 0
  let timer = 0

  const cancelPreview = () => {
    cancelAnimationFrame(frame)
    window.clearTimeout(timer)
  }

  return {
    play(on) {
      if (on && !stop) stop = startMotion()
      if (!on && stop) {
        stop()
        stop = null
        requestAnimationFrame(onSettled)
      }
    },
    preview(id) {
      cancelPreview()
      const until = Date.now() + PREVIEW_WAIT_MS
      const attempt = () => {
        const el = document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
        const motion = motionOf(id)
        const current = el?.getAttribute(MOTION_ATTR) ?? null
        const ready = el !== null && motion !== undefined && current === JSON.stringify(motion)
        if (el && (ready || (Date.now() >= until && current))) {
          void previewMotion(el).finally(() => requestAnimationFrame(onSettled))
          return
        }
        if (Date.now() < until) timer = window.setTimeout(attempt, RETRY_MS)
      }
      // Two frames: React commits the layout that came just before this message.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(attempt)
      })
    },
    dispose() {
      cancelPreview()
      stop?.()
      stop = null
    },
  }
}

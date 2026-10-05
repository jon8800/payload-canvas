import type { ReactNode } from 'react'
import { MOTION_READY_ATTR, MOTION_REVEAL_ATTR } from '@payload-toolkit/builder/core'

/** The failsafe animation name. The runtime reads it to see whether the failsafe showed a block. */
export const FAILSAFE_ANIMATION = 'builder-motion-failsafe'

/**
 * Hides blocks with an entrance before the runtime takes them over, so they never flash.
 * - Only while JavaScript runs (`scripting: enabled`): without JavaScript, and for crawlers that
 *   read the HTML, every block is visible.
 * - A failsafe shows them after 2.5 s if the runtime never starts (a script error, a blocked chunk).
 * - The selector outweighs a block's own `animate-*` class, so the failsafe always applies.
 */
export const MOTION_CSS =
  `@media (scripting: enabled){[${MOTION_REVEAL_ATTR}]:not([${MOTION_READY_ATTR}]){opacity:0;animation:${FAILSAFE_ANIMATION} 0s 2.5s forwards}}` +
  `@keyframes ${FAILSAFE_ANIMATION}{to{opacity:1}}`

/**
 * The motion CSS in the document head, once per page however many layouts render it (React
 * hoists and de-duplicates a `<style>` with `href` and `precedence`).
 */
export function MotionStyle(): ReactNode {
  return (
    <style href="payload-builder-motion" precedence="default">
      {MOTION_CSS}
    </style>
  )
}

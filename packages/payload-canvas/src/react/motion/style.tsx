import type { ReactNode } from 'react'
import {
  EASING_CURVES,
  enterFrom,
  enterTiming,
  LIST_ITEMS_PROP,
  MOTION_ATTR,
  MOTION_ITEM_ATTR,
  MOTION_READY_ATTR,
  MOTION_REVEAL_ATTR,
  staggersChildren,
  type Block,
  type EnterMotion,
  type MotionEasing,
} from '../../core'

/**
 * The animation that hides a block until the runtime takes it over. When it ends (the runtime
 * never started: a script error, a blocked chunk), the block shows. The runtime reads the name.
 */
export const HIDE_ANIMATION = 'builder-motion-hide'
/** How long a block may stay hidden while the runtime loads. */
const HIDE_MS = 1200
/** Name prefix of the CSS entrances of blocks that appear on page load. The runtime reads it. */
export const ENTER_ANIMATION_PREFIX = 'builder-motion-enter-'

/**
 * Hides blocks with an entrance before the runtime takes them over, so they never flash.
 * - Only while JavaScript runs (`scripting: enabled`): without JavaScript, and for crawlers that
 *   read the HTML, every block is visible.
 * - Only when the visitor has not asked for less motion: with `prefers-reduced-motion: reduce`
 *   nothing waits for JavaScript.
 * - The hiding is an animation, so it stops by itself after 1.2 s if the runtime never starts.
 * - The selector outweighs a block's own `animate-*` class.
 * - Blocks that appear on page load do not wait for the runtime: `enterCss` plays them in CSS.
 */
export const MOTION_CSS =
  `@media (scripting: enabled) and (prefers-reduced-motion: no-preference){` +
  `[${MOTION_REVEAL_ATTR}]:not([${MOTION_READY_ATTR}]){animation:${HIDE_ANIMATION} ${HIDE_MS}ms}}` +
  `@keyframes ${HIDE_ANIMATION}{0%,100%{opacity:0}}`

/** The most children of one staggering block that get a CSS entrance. Later ones show at once. */
const MAX_STAGGER_ITEMS = 48

/** CSS timing functions for the easings. Springs become curves that settle the same way. */
const CSS_EASINGS: Record<MotionEasing, string> = {
  'ease-out': `cubic-bezier(${EASING_CURVES['ease-out'].join(',')})`,
  'ease-in-out': `cubic-bezier(${EASING_CURVES['ease-in-out'].join(',')})`,
  linear: 'linear',
  spring: 'cubic-bezier(0.16,1,0.3,1)',
  bouncy: 'cubic-bezier(0.34,1.4,0.64,1)',
}

function hash(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** A CSS attribute selector that matches the block's `data-motion` value exactly. */
function motionSelector(json: string): string {
  return `[${MOTION_ATTR}='${json.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`
}

/** The keyframes of an entrance: from its start values to the element's own style. */
function enterKeyframes(enter: EnterMotion): { name: string; css: string } {
  const from = enterFrom(enter)
  const start: string[] = []
  if (from.opacity !== undefined) start.push(`opacity:${from.opacity}`)
  if (from.transform) start.push(`transform:${from.transform}`)
  if (from.filter) start.push(`filter:${from.filter}`)
  if (from.clipPath) start.push(`clip-path:${from.clipPath}`)
  // `clip-path` does not blend into `none`; end on an inset that shows everything.
  const body = `from{${start.join(';')}}${from.clipPath ? 'to{clip-path:inset(0% 0% 0% 0%)}' : ''}`
  const name = `${ENTER_ANIMATION_PREFIX}${hash(body)}`
  return { name, css: `@keyframes ${name}{${body}}` }
}

/** Child blocks the site renders for a staggering block: visible children, times the list documents. */
function itemCount(block: Block): number {
  let count = 0
  for (const children of Object.values(block.slots ?? {})) count += children.filter((child) => !child.hidden).length
  const docs = block.props?.[LIST_ITEMS_PROP]
  if (Array.isArray(docs)) count *= docs.length
  return Math.min(count, MAX_STAGGER_ITEMS)
}

/**
 * CSS that plays the entrances with `trigger: "load"` at first paint, without waiting for
 * JavaScript. The runtime sees them playing and leaves them alone. Each rule matches the block's
 * exact `data-motion` value, so it needs the layout's blocks. Empty when no block appears on load.
 * Not with reduced motion: those blocks just show.
 */
export function enterCss(blocks: readonly Block[]): string {
  const keyframes = new Map<string, string>()
  const rules = new Set<string>()
  const visit = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.hidden) continue
      const enter = block.motion?.enter
      if (enter?.trigger === 'load') {
        const { name, css } = enterKeyframes(enter)
        keyframes.set(name, css)
        const timing = enterTiming(enter)
        const animation = (delay: number) => `animation:${name} ${timing.duration}ms ${CSS_EASINGS[timing.easing]} ${delay}ms backwards`
        const owner = motionSelector(JSON.stringify(block.motion))
        if (staggersChildren(block.motion)) {
          // The owner's direct child blocks, in order. A child of a nested animated block is not one.
          const item = `${owner} [${MOTION_ITEM_ATTR}]`
          const nested = `:not(${owner} [${MOTION_ATTR}] *)`
          for (let i = 0; i < itemCount(block); i++) {
            rules.add(`${item}:nth-child(${i + 1} of [${MOTION_ITEM_ATTR}])${nested}{${animation(timing.delay + i * timing.stagger)}}`)
          }
        } else {
          // Outweighs the hiding rule.
          rules.add(`[${MOTION_REVEAL_ATTR}][${MOTION_REVEAL_ATTR}]${owner}{${animation(timing.delay)}}`)
        }
      }
      for (const children of Object.values(block.slots ?? {})) visit(children)
    }
  }
  visit(blocks)
  if (rules.size === 0) return ''
  return `@media (prefers-reduced-motion: no-preference){${[...rules].join('')}}${[...keyframes.values()].join('')}`
}

/**
 * The motion CSS in the document head, once per page however many layouts render it (React
 * hoists and de-duplicates a `<style>` with `href` and `precedence`). With `blocks`, it adds the
 * CSS entrances of that layout's blocks that appear on page load (`enterCss`).
 */
export function MotionStyle({ blocks }: { blocks?: readonly Block[] } = {}): ReactNode {
  const enter = blocks ? enterCss(blocks) : ''
  return (
    <>
      <style href="payload-builder-motion" precedence="default">
        {MOTION_CSS}
      </style>
      {enter && (
        <style href={`payload-builder-motion-${hash(enter)}`} precedence="default">
          {enter}
        </style>
      )}
    </>
  )
}

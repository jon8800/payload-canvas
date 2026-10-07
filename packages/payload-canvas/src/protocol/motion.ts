// Motion helpers shared by the editor and the canvas iframe for the smooth drag mode.
// Pure TypeScript: no DOM, no React.

import type { Rect } from '../core/types'

/**
 * A spring as a CSS `linear()` easing, so CSS transitions and the Web Animations API run it on the
 * compositor. `response` is Apple's "response" in seconds (how fast it gets there), `damping` the
 * damping ratio (1 = no overshoot, lower = a little bounce). `duration` is the time the easing
 * covers, in ms: long enough for the spring to settle.
 */
export type Spring = { response: number; damping: number; duration: number }

/** Blocks and rows moving out of the way. No overshoot: they only make room. */
export const MAKE_ROOM: Spring = { response: 0.28, damping: 1, duration: 340 }
/** The dropped block settling into its place: a hint of overshoot, it was thrown there. */
export const SETTLE: Spring = { response: 0.32, damping: 0.86, duration: 420 }

/** Position of a spring from 0 to 1 at time `t` (seconds). */
export function springAt(spring: Pick<Spring, 'response' | 'damping'>, t: number): number {
  const omega = (2 * Math.PI) / spring.response
  const zeta = spring.damping
  if (zeta >= 1) return 1 - (1 + omega * t) * Math.exp(-omega * t)
  const omegaD = omega * Math.sqrt(1 - zeta * zeta)
  const decay = Math.exp(-zeta * omega * t)
  return 1 - decay * (Math.cos(omegaD * t) + ((zeta * omega) / omegaD) * Math.sin(omegaD * t))
}

/** The spring as a CSS `linear()` easing with `points` samples. The last point is exactly 1. */
export function springEasing(spring: Spring, points = 32): string {
  const values: string[] = []
  for (let i = 0; i <= points; i++) {
    const value = i === points ? 1 : springAt(spring, ((spring.duration / 1000) * i) / points)
    values.push(String(Math.round(value * 1000) / 1000))
  }
  return `linear(${values.join(', ')})`
}

/** A CSS transform that moves (and optionally scales) a box from `last` back to where `first` was. */
export type Flip = { x: number; y: number; scale: number }

/**
 * The FLIP "invert" step: the transform that shows an element laid out at `last` at the place of
 * `first`. With `scale`, the element also takes the width of `first` (one factor, so text keeps its
 * shape). The transform origin is the element's top left corner.
 */
export function flipFrom(first: Rect, last: Rect, scale = false): Flip {
  const factor = scale && last.width > 0 ? first.width / last.width : 1
  return { x: first.x - last.x, y: first.y - last.y, scale: factor }
}

/** True when a FLIP would move the element by less than half a pixel: no animation needed. */
export function isStill(flip: Flip): boolean {
  return Math.abs(flip.x) < 0.5 && Math.abs(flip.y) < 0.5 && Math.abs(flip.scale - 1) < 0.005
}

export function flipTransform(flip: Flip): string {
  const move = `translate(${round(flip.x)}px, ${round(flip.y)}px)`
  return flip.scale === 1 ? move : `${move} scale(${Math.round(flip.scale * 10000) / 10000})`
}

/** True when two rects overlap (or touch). */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

// The Motion tab's pure logic: which settings each preset uses, preset changes and slider
// conversions. No DOM, no React. The data shape and the presets live in core/motion.ts.

import {
  ENTER_DEFAULTS,
  HOVER_DEFAULTS,
  LOOP_DEFAULTS,
  MOTION_KINDS,
  PRESS_DEFAULTS,
  SCROLL_DEFAULTS,
  type BlockMotion,
  type EnterMotion,
  type HoverMotion,
  type LoopMotion,
  type MotionKind,
  type MotionPatch,
  type ScrollMotion,
} from '../../../core'

/** The fade presets that travel a distance. */
const DIRECTIONAL = new Set(['fade-up', 'fade-down', 'fade-left', 'fade-right'])

export function usesDistance(preset: string): boolean {
  return DIRECTIONAL.has(preset)
}

/** The number a preset of each kind uses, besides `duration` (the other numbers do not apply). */
const PRESET_KEYS: Record<'hover' | 'scroll' | 'loop', Record<string, readonly string[]>> = {
  hover: { lift: ['distance'], grow: ['scale'], tilt: ['angle'] },
  scroll: { parallax: ['distance'], fade: [], zoom: ['scale'] },
  loop: { float: ['duration', 'distance'], pulse: ['duration', 'scale'] },
}

/**
 * The kind after another preset is picked. Settings the new preset also uses stay; settings it
 * does not use go, so no stale value hides in the data.
 */
export function withPreset<K extends MotionKind>(kind: K, current: BlockMotion[K] | undefined, preset: string): NonNullable<BlockMotion[K]> {
  const next: Record<string, unknown> = { ...current, preset }
  const k: MotionKind = kind
  if (k === 'enter') {
    if (!usesDistance(preset)) delete next.distance
  } else if (k === 'hover' || k === 'scroll' || k === 'loop') {
    const keep = new Set(PRESET_KEYS[k][preset] ?? [])
    for (const key of Object.keys(next)) if (key !== 'preset' && !keep.has(key)) delete next[key]
  }
  return next as NonNullable<BlockMotion[K]>
}

/** The kind with one setting changed. `undefined` removes the setting (the default applies). */
export function withValue<K extends MotionKind>(current: NonNullable<BlockMotion[K]>, key: string, value: unknown): NonNullable<BlockMotion[K]> {
  const next: Record<string, unknown> = { ...current }
  if (value === undefined) delete next[key]
  else next[key] = value
  return next as NonNullable<BlockMotion[K]>
}

/** The patch that makes a block's motion exactly `motion`: its kinds set, every other kind removed. */
export function replaceMotionPatch(motion: BlockMotion | undefined): MotionPatch | null {
  if (!motion) return null
  const patch: Record<string, unknown> = {}
  for (const kind of MOTION_KINDS) patch[kind] = motion[kind] ?? null
  return patch as MotionPatch
}

// ---------------------------------------------------------------------------
// Values the controls show (defaults filled in)
// ---------------------------------------------------------------------------

export function enterValues(enter: EnterMotion) {
  return {
    duration: enter.duration ?? ENTER_DEFAULTS.duration,
    delay: enter.delay ?? ENTER_DEFAULTS.delay,
    easing: enter.easing ?? ENTER_DEFAULTS.easing,
    distance: enter.distance ?? ENTER_DEFAULTS.distance,
    trigger: enter.trigger ?? ENTER_DEFAULTS.trigger,
    amount: enter.amount ?? ENTER_DEFAULTS.amount,
    repeat: enter.repeat === true,
    stagger: enter.stagger ?? 0,
  }
}

export const hoverValue = (hover: HoverMotion) =>
  hover.preset === 'lift' ? (hover.distance ?? HOVER_DEFAULTS.distance) : hover.preset === 'grow' ? (hover.scale ?? HOVER_DEFAULTS.scale) : (hover.angle ?? HOVER_DEFAULTS.angle)

export const pressScale = (scale: number | undefined) => scale ?? PRESS_DEFAULTS.scale

export const scrollValue = (scroll: ScrollMotion) =>
  scroll.preset === 'zoom' ? (scroll.scale ?? SCROLL_DEFAULTS.scale) : (scroll.distance ?? SCROLL_DEFAULTS.distance)

export function loopValues(loop: LoopMotion) {
  const defaults = LOOP_DEFAULTS[loop.preset]
  return {
    duration: loop.duration ?? defaults.duration,
    distance: loop.distance ?? LOOP_DEFAULTS.float.distance,
    scale: loop.scale ?? LOOP_DEFAULTS.pulse.scale,
  }
}

// ---------------------------------------------------------------------------
// Percent conversions (a scale of 1.03 shows as 103 %, an amount of 0.2 as 20 %)
// ---------------------------------------------------------------------------

export const toPercent = (fraction: number) => Math.round(fraction * 100)
export const fromPercent = (percent: number) => Math.round(percent) / 100

/** Keeps a slider's thumb on the track when a stored value is outside the slider's range. */
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

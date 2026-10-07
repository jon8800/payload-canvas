// Block animations ("motion"): the data shape, the presets, checking, normalizing and the keyframe
// plan the runtime plays. Pure TypeScript: no DOM, no React. See docs/architecture.md section 8,
// "Motion", and the README section "Animations".
//
// A block stores `motion: { enter?, hover?, press?, scroll?, loop? }`. Each kind holds a `preset`
// plus optional numbers. Times are milliseconds, distances CSS pixels. Canonical form: no empty
// kinds, no unknown keys, and `motion` is left out when it holds no kind.

import type { Block } from './types'

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export const ENTER_PRESETS = [
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'zoom-in',
  'zoom-out',
  'blur-in',
  'wipe-up',
  'wipe-down',
  'wipe-left',
  'wipe-right',
] as const
export const HOVER_PRESETS = ['lift', 'grow', 'tilt'] as const
export const PRESS_PRESETS = ['shrink'] as const
export const SCROLL_PRESETS = ['parallax', 'fade', 'zoom'] as const
export const LOOP_PRESETS = ['float', 'pulse'] as const
export const MOTION_EASINGS = ['ease-out', 'ease-in-out', 'linear', 'spring', 'bouncy'] as const
export const ENTER_TRIGGERS = ['view', 'load'] as const

export type EnterPreset = (typeof ENTER_PRESETS)[number]
export type HoverPreset = (typeof HOVER_PRESETS)[number]
export type PressPreset = (typeof PRESS_PRESETS)[number]
export type ScrollPreset = (typeof SCROLL_PRESETS)[number]
export type LoopPreset = (typeof LOOP_PRESETS)[number]
export type MotionEasing = (typeof MOTION_EASINGS)[number]
export type EnterTrigger = (typeof ENTER_TRIGGERS)[number]

/** The block appears: when it scrolls into view, or when the page loads. */
export type EnterMotion = {
  preset: EnterPreset
  /** Milliseconds. Default 600. */
  duration?: number
  /** Milliseconds before it starts. Default 0. */
  delay?: number
  /** Default "ease-out". "spring" and "bouncy" are springs that settle in about `duration`. */
  easing?: MotionEasing
  /** Pixels the fade-up/down/left/right presets travel. Default 24. */
  distance?: number
  /** "view" (default): when it scrolls into view. "load": as soon as the page loads. */
  trigger?: EnterTrigger
  /** Part of the block (0 to 1) that must be in view before it plays. Default 0.2. */
  amount?: number
  /** Pixels the block must be inside the window before it plays. Default 0. */
  offset?: number
  /** Plays every time the block scrolls into view, not only the first time. Default false. */
  repeat?: boolean
  /**
   * Milliseconds between children. When set, the block's direct child blocks play the entrance
   * one after another (cards appear in turn) and the block itself stays still. A child's own
   * entrance does not play there.
   */
  stagger?: number
}

/** While the pointer is over the block (mouse and pen only, never touch). */
export type HoverMotion = {
  preset: HoverPreset
  /** "lift": pixels up. Default 4. */
  distance?: number
  /** "grow": the scale. Default 1.03. */
  scale?: number
  /** "tilt": the largest angle in degrees. Default 6. */
  angle?: number
}

/** While the block is pressed (pointer down, or Enter on a focused link or button). */
export type PressMotion = {
  preset: PressPreset
  /** Default 0.97. */
  scale?: number
}

/** Follows the scroll position while the block passes through the window. */
export type ScrollMotion = {
  preset: ScrollPreset
  /** "parallax": pixels the block moves against the scroll over its pass. Negative moves with it. Default 60. */
  distance?: number
  /** "zoom": the scale it starts from at the bottom of the window. Default 0.9. */
  scale?: number
}

/** Plays again and again while the block is in view. */
export type LoopMotion = {
  preset: LoopPreset
  /** Milliseconds for one way. Default 3000 (float) or 1500 (pulse). */
  duration?: number
  /** "float": pixels up and down. Default 8. */
  distance?: number
  /** "pulse": the largest scale. Default 1.04. */
  scale?: number
}

export type BlockMotion = {
  enter?: EnterMotion
  hover?: HoverMotion
  press?: PressMotion
  scroll?: ScrollMotion
  loop?: LoopMotion
}

export type MotionKind = keyof BlockMotion
export const MOTION_KINDS: readonly MotionKind[] = ['enter', 'hover', 'press', 'scroll', 'loop']

/**
 * `update.motion`: each kind listed replaces that kind; `null` removes it. Kinds left out stay.
 * `update.motion = null` removes all motion.
 */
export type MotionPatch = { [K in MotionKind]?: BlockMotion[K] | null }

// ---------------------------------------------------------------------------
// Presets and limits (the editor, the AI docs and the checks read these)
// ---------------------------------------------------------------------------

type Range = { min: number; max: number }
type NumberKey = 'duration' | 'delay' | 'distance' | 'amount' | 'offset' | 'stagger' | 'scale' | 'angle'

type KindSpec = {
  presets: readonly string[]
  numbers: Partial<Record<NumberKey, Range>>
  /** Keys with a fixed list of words. */
  words?: Partial<Record<'easing' | 'trigger', readonly string[]>>
  booleans?: readonly 'repeat'[]
}

export const MOTION_SPECS: Record<MotionKind, KindSpec> = {
  enter: {
    presets: ENTER_PRESETS,
    numbers: {
      duration: { min: 50, max: 5000 },
      delay: { min: 0, max: 10000 },
      distance: { min: 0, max: 400 },
      amount: { min: 0, max: 1 },
      offset: { min: -1000, max: 1000 },
      stagger: { min: 0, max: 2000 },
    },
    words: { easing: MOTION_EASINGS, trigger: ENTER_TRIGGERS },
    booleans: ['repeat'],
  },
  hover: { presets: HOVER_PRESETS, numbers: { distance: { min: 0, max: 40 }, scale: { min: 0.5, max: 1.5 }, angle: { min: 0, max: 30 } } },
  press: { presets: PRESS_PRESETS, numbers: { scale: { min: 0.5, max: 1 } } },
  scroll: { presets: SCROLL_PRESETS, numbers: { distance: { min: -1000, max: 1000 }, scale: { min: 0.1, max: 2 } } },
  loop: { presets: LOOP_PRESETS, numbers: { duration: { min: 300, max: 20000 }, distance: { min: 0, max: 100 }, scale: { min: 0.5, max: 2 } } },
}

export const ENTER_DEFAULTS = {
  duration: 600,
  delay: 0,
  easing: 'ease-out' as MotionEasing,
  distance: 24,
  trigger: 'view' as EnterTrigger,
  amount: 0.2,
  offset: 0,
  repeat: false,
}
/** The gap between children when someone turns stagger on. */
export const DEFAULT_STAGGER = 80
export const HOVER_DEFAULTS = { distance: 4, scale: 1.03, angle: 6 }
export const PRESS_DEFAULTS = { scale: 0.97 }
export const SCROLL_DEFAULTS = { distance: 60, scale: 0.9 }
export const LOOP_DEFAULTS = { float: { duration: 3000, distance: 8 }, pulse: { duration: 1500, scale: 1.04 } }

export type MotionPresetInfo = { value: string; label: string; description: string }

/** Labels and one-line descriptions, in menu order. */
export const MOTION_PRESET_INFO: Record<MotionKind, MotionPresetInfo[]> = {
  enter: [
    { value: 'fade', label: 'Fade', description: 'Fades in where it is.' },
    { value: 'fade-up', label: 'Fade up', description: 'Fades in while it moves up into place.' },
    { value: 'fade-down', label: 'Fade down', description: 'Fades in while it moves down into place.' },
    { value: 'fade-left', label: 'Fade left', description: 'Fades in while it moves left into place (comes from the right).' },
    { value: 'fade-right', label: 'Fade right', description: 'Fades in while it moves right into place (comes from the left).' },
    { value: 'zoom-in', label: 'Zoom in', description: 'Fades in while it grows from 92 % to full size.' },
    { value: 'zoom-out', label: 'Zoom out', description: 'Fades in while it shrinks from 108 % to full size.' },
    { value: 'blur-in', label: 'Blur in', description: 'Fades in from a soft blur.' },
    { value: 'wipe-up', label: 'Wipe up', description: 'Uncovers from the bottom edge up (clip-path).' },
    { value: 'wipe-down', label: 'Wipe down', description: 'Uncovers from the top edge down (clip-path).' },
    { value: 'wipe-left', label: 'Wipe left', description: 'Uncovers from the right edge to the left (clip-path).' },
    { value: 'wipe-right', label: 'Wipe right', description: 'Uncovers from the left edge to the right (clip-path).' },
  ],
  hover: [
    { value: 'lift', label: 'Lift', description: 'Moves up a few pixels.' },
    { value: 'grow', label: 'Grow', description: 'Grows a little.' },
    { value: 'tilt', label: 'Tilt', description: 'Tilts in 3D toward the pointer.' },
  ],
  press: [{ value: 'shrink', label: 'Shrink', description: 'Shrinks a little while pressed.' }],
  scroll: [
    { value: 'parallax', label: 'Parallax', description: 'Moves slower or faster than the page while you scroll.' },
    { value: 'fade', label: 'Fade', description: 'Fades in as it rises into the window.' },
    { value: 'zoom', label: 'Zoom', description: 'Grows to full size as it rises into the window.' },
  ],
  loop: [
    { value: 'float', label: 'Float', description: 'Floats gently up and down.' },
    { value: 'pulse', label: 'Pulse', description: 'Grows and shrinks a little, like breathing.' },
  ],
}

export const MOTION_EASING_INFO: MotionPresetInfo[] = [
  { value: 'ease-out', label: 'Ease out', description: 'Starts fast and settles softly. The default.' },
  { value: 'ease-in-out', label: 'Ease in-out', description: 'Speeds up, then slows down.' },
  { value: 'linear', label: 'Linear', description: 'The same speed all the way.' },
  { value: 'spring', label: 'Spring', description: 'A spring with no bounce.' },
  { value: 'bouncy', label: 'Bouncy', description: 'A spring with a small bounce.' },
]

// ---------------------------------------------------------------------------
// Checking and normalizing
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** A problem in a `motion` value. `path` is relative to the block, e.g. "motion.enter.duration". */
export type MotionProblem = { path: string; message: string; unknown?: boolean }

function checkKind(kind: MotionKind, value: unknown, problems: MotionProblem[]): Record<string, unknown> | null {
  const at = `motion.${kind}`
  if (!isRecord(value)) {
    problems.push({ path: at, message: `${at} must be an object with a "preset"` })
    return null
  }
  const spec = MOTION_SPECS[kind]
  const out: Record<string, unknown> = {}
  if (typeof value.preset !== 'string' || !spec.presets.includes(value.preset)) {
    problems.push({ path: `${at}.preset`, message: `${at}.preset must be one of: ${spec.presets.join(', ')}` })
    return null
  }
  out.preset = value.preset
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'preset' || raw === undefined) continue
    const path = `${at}.${key}`
    const range = spec.numbers[key as NumberKey]
    const words = spec.words?.[key as 'easing' | 'trigger']
    if (range) {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) problems.push({ path, message: `${path} must be a number` })
      else if (raw < range.min || raw > range.max) problems.push({ path, message: `${path} must be from ${range.min} to ${range.max}` })
      else out[key] = raw
    } else if (words) {
      if (typeof raw !== 'string' || !words.includes(raw)) problems.push({ path, message: `${path} must be one of: ${words.join(', ')}` })
      else out[key] = raw
    } else if (spec.booleans?.includes(key as 'repeat')) {
      if (typeof raw !== 'boolean') problems.push({ path, message: `${path} must be true or false` })
      else if (raw) out[key] = true
    } else {
      problems.push({ path, message: `Unknown key "${key}" in ${at}`, unknown: true })
    }
  }
  return out
}

/** Checks a stored `motion` value. Unknown keys are reported with `unknown: true` (warnings). */
export function motionProblems(value: unknown): MotionProblem[] {
  const problems: MotionProblem[] = []
  if (value === undefined) return problems
  if (!isRecord(value)) return [{ path: 'motion', message: 'motion must be an object' }]
  for (const [key, kindValue] of Object.entries(value)) {
    if (!MOTION_KINDS.includes(key as MotionKind)) {
      problems.push({ path: `motion.${key}`, message: `Unknown motion kind "${key}" (use ${MOTION_KINDS.join(', ')})`, unknown: true })
      continue
    }
    checkKind(key as MotionKind, kindValue, problems)
  }
  return problems
}

/**
 * The canonical form of a motion value, or an error message. Used by the operations: unknown
 * keys and values out of range are refused, so a bad value never reaches a save.
 */
export function checkMotion(value: unknown): BlockMotion | undefined | string {
  if (value === undefined || value === null) return undefined
  const problems = motionProblems(value)
  if (problems.length > 0) return problems.map((p) => p.message).join('; ')
  return normalizeMotion(value)
}

/** Lenient: keeps the valid kinds and values of any stored value, drops the rest. Never throws. */
export function normalizeMotion(value: unknown): BlockMotion | undefined {
  if (!isRecord(value)) return undefined
  const out: Record<string, unknown> = {}
  for (const kind of MOTION_KINDS) {
    if (value[kind] === undefined) continue
    const kept = checkKind(kind, value[kind], [])
    if (kept) out[kind] = kept
  }
  return Object.keys(out).length > 0 ? (out as BlockMotion) : undefined
}

/** Applies an `update.motion` patch. Returns the new motion (undefined: none) or an error message. */
export function patchMotion(current: BlockMotion | undefined, patch: unknown): BlockMotion | undefined | string {
  if (patch === null) return undefined
  if (!isRecord(patch)) return '`motion` must be an object of motion kinds, or null'
  const next: Record<string, unknown> = { ...current }
  for (const [kind, value] of Object.entries(patch)) {
    if (!MOTION_KINDS.includes(kind as MotionKind)) return `Unknown motion kind "${kind}" (use ${MOTION_KINDS.join(', ')})`
    if (value === null || value === undefined) {
      if (value === null) delete next[kind]
      continue
    }
    const problems: MotionProblem[] = []
    const kept = checkKind(kind as MotionKind, value, problems)
    if (problems.length > 0 || !kept) return problems.map((p) => p.message).join('; ')
    next[kind] = kept
  }
  return Object.keys(next).length > 0 ? (next as BlockMotion) : undefined
}

/** The patch that turns `after` back into `before` (for undo). */
export function motionInverse(before: BlockMotion | undefined, patch: Record<string, unknown> | null): MotionPatch | null {
  if (patch === null) return before ? { ...before } : null
  const inverse: Record<string, unknown> = {}
  for (const kind of Object.keys(patch)) inverse[kind] = before?.[kind as MotionKind] ?? null
  return inverse as MotionPatch
}

export function sameMotion(a: BlockMotion | undefined, b: BlockMotion | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

// ---------------------------------------------------------------------------
// The plan the runtime plays (pure, so it is tested here)
// ---------------------------------------------------------------------------

/** Start values of an entrance. The end is the element's own style. */
export type EnterFrom = { opacity?: number; transform?: string; filter?: string; clipPath?: string }

/**
 * Where an entrance starts. With reduced motion every preset becomes a plain fade: no movement,
 * no blur, no wipe.
 */
export function enterFrom(enter: EnterMotion, reduced = false): EnterFrom {
  if (reduced) return { opacity: 0 }
  const d = enter.distance ?? ENTER_DEFAULTS.distance
  switch (enter.preset) {
    case 'fade':
      return { opacity: 0 }
    case 'fade-up':
      return { opacity: 0, transform: `translateY(${d}px)` }
    case 'fade-down':
      return { opacity: 0, transform: `translateY(${-d}px)` }
    case 'fade-left':
      return { opacity: 0, transform: `translateX(${d}px)` }
    case 'fade-right':
      return { opacity: 0, transform: `translateX(${-d}px)` }
    case 'zoom-in':
      return { opacity: 0, transform: 'scale(0.92)' }
    case 'zoom-out':
      return { opacity: 0, transform: 'scale(1.08)' }
    case 'blur-in':
      return { opacity: 0, filter: 'blur(10px)' }
    case 'wipe-up':
      return { clipPath: 'inset(100% 0% 0% 0%)' }
    case 'wipe-down':
      return { clipPath: 'inset(0% 0% 100% 0%)' }
    case 'wipe-left':
      return { clipPath: 'inset(0% 0% 0% 100%)' }
    case 'wipe-right':
      return { clipPath: 'inset(0% 100% 0% 0%)' }
  }
}

export type EnterTiming = {
  /** Milliseconds. */
  duration: number
  delay: number
  easing: MotionEasing
  /** Milliseconds between children, or 0. */
  stagger: number
}

/** Timing of an entrance. Reduced motion: at most 300 ms, eased, no spring bounce. */
export function enterTiming(enter: EnterMotion, reduced = false): EnterTiming {
  const duration = enter.duration ?? ENTER_DEFAULTS.duration
  const easing = enter.easing ?? ENTER_DEFAULTS.easing
  const stagger = enter.stagger ?? 0
  if (reduced) return { duration: Math.min(duration, 300), delay: enter.delay ?? 0, easing: 'ease-out', stagger: Math.min(stagger, 40) }
  return { duration, delay: enter.delay ?? 0, easing, stagger }
}

/** The "in view" settings of an entrance. */
export function enterView(enter: EnterMotion): { amount: number; offset: number; repeat: boolean; load: boolean } {
  return {
    amount: enter.amount ?? ENTER_DEFAULTS.amount,
    offset: enter.offset ?? ENTER_DEFAULTS.offset,
    repeat: enter.repeat === true,
    load: enter.trigger === 'load',
  }
}

/** A cubic-bezier curve for each eased easing (springs have none). */
export const EASING_CURVES: Record<'ease-out' | 'ease-in-out', [number, number, number, number]> = {
  'ease-out': [0.23, 1, 0.32, 1],
  'ease-in-out': [0.77, 0, 0.175, 1],
}

/** Spring bounce of the spring easings. */
export const SPRING_BOUNCE: Record<'spring' | 'bouncy', number> = { spring: 0, bouncy: 0.25 }

/** The transform a hover or press effect adds. `tilt` is [x, y] from -1 to 1 (pointer from the center). */
export function interactTransform(
  hover: HoverMotion | undefined,
  press: PressMotion | undefined,
  state: { hovered: boolean; pressed: boolean; tilt?: [number, number] },
): string {
  const parts: string[] = []
  if (hover && state.hovered) {
    if (hover.preset === 'lift') parts.push(`translateY(${-(hover.distance ?? HOVER_DEFAULTS.distance)}px)`)
    if (hover.preset === 'grow') parts.push(`scale(${hover.scale ?? HOVER_DEFAULTS.scale})`)
    if (hover.preset === 'tilt') {
      const angle = hover.angle ?? HOVER_DEFAULTS.angle
      const [x, y] = state.tilt ?? [0, 0]
      parts.push(`perspective(800px) rotateX(${round(-y * angle)}deg) rotateY(${round(x * angle)}deg)`)
    }
  }
  if (press && state.pressed) parts.push(`scale(${press.scale ?? PRESS_DEFAULTS.scale})`)
  return parts.length > 0 ? parts.join(' ') : 'none'
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * A scroll-linked effect: keyframes of one CSS property over the block's pass through the window.
 * `offset` pairs are [block progress, window progress] (Motion's `scroll` offsets): [0, 1] is the
 * block's top at the window's bottom, [1, 0] its bottom at the window's top. Null with reduced motion for effects that move.
 */
export function scrollPlan(
  scroll: ScrollMotion,
  reduced = false,
): { property: 'translate' | 'opacity' | 'scale'; keyframes: Array<string | number>; offset: [[number, number], [number, number]] } | null {
  // Fade and zoom finish when the block's middle reaches the window's bottom edge. Both offsets
  // map to a native ViewTimeline range, so the browser runs them off the main thread.
  if (scroll.preset === 'fade') return { property: 'opacity', keyframes: [0, 1], offset: [[0, 1], [0.5, 1]] }
  if (reduced) return null
  if (scroll.preset === 'zoom') return { property: 'scale', keyframes: [scroll.scale ?? SCROLL_DEFAULTS.scale, 1], offset: [[0, 1], [0.5, 1]] }
  const d = scroll.distance ?? SCROLL_DEFAULTS.distance
  return { property: 'translate', keyframes: [`0px ${d}px`, `0px ${-d}px`], offset: [[0, 1], [1, 0]] }
}

/** A loop: one CSS property, there and back forever. Null with reduced motion. */
export function loopPlan(loop: LoopMotion, reduced = false): { property: 'translate' | 'scale'; keyframes: Array<string | number>; duration: number } | null {
  if (reduced) return null
  const defaults = LOOP_DEFAULTS[loop.preset]
  const duration = loop.duration ?? defaults.duration
  if (loop.preset === 'pulse') return { property: 'scale', keyframes: [1, loop.scale ?? LOOP_DEFAULTS.pulse.scale], duration }
  const d = loop.distance ?? LOOP_DEFAULTS.float.distance
  return { property: 'translate', keyframes: ['0px 0px', `0px ${-d}px`], duration }
}

// ---------------------------------------------------------------------------
// Rendering attributes (RenderLayout and custom renderers)
// ---------------------------------------------------------------------------

/** The block's motion settings as JSON. The runtime reads it. */
export const MOTION_ATTR = 'data-motion'
/** A direct child of a block whose entrance has `stagger`: it plays the parent's entrance. */
export const MOTION_ITEM_ATTR = 'data-motion-item'
/** Starts hidden (only while JavaScript runs) until the runtime takes it over. */
export const MOTION_REVEAL_ATTR = 'data-motion-reveal'
/** Set by the runtime once it controls the element. */
export const MOTION_READY_ATTR = 'data-motion-ready'

/** True when the entrance plays on the block's children instead of the block. */
export function staggersChildren(motion: BlockMotion | undefined): boolean {
  return Boolean(motion?.enter && (motion.enter.stagger ?? 0) > 0)
}

/**
 * The attributes a block's root element gets. `item`: the block is a direct child of a block
 * whose entrance staggers its children.
 */
export function motionAttributes(motion: BlockMotion | undefined, item = false): Record<string, string> {
  const out: Record<string, string> = {}
  if (motion) {
    out[MOTION_ATTR] = JSON.stringify(motion)
    if (motion.enter && !staggersChildren(motion)) out[MOTION_REVEAL_ATTR] = ''
  }
  if (item) {
    out[MOTION_ITEM_ATTR] = ''
    out[MOTION_REVEAL_ATTR] = ''
  }
  return out
}

/** Reads a `data-motion` attribute value. */
export function parseMotionAttribute(value: string | null | undefined): BlockMotion | undefined {
  if (!value) return undefined
  try {
    return normalizeMotion(JSON.parse(value))
  } catch {
    return undefined
  }
}

/** True when any block in the list (at any depth, hidden ones left out) has motion. */
export function blocksHaveMotion(blocks: readonly Block[]): boolean {
  for (const block of blocks) {
    if (block.hidden) continue
    if (block.motion) return true
    for (const children of Object.values(block.slots ?? {})) {
      if (blocksHaveMotion(children)) return true
    }
  }
  return false
}

const presetLabel = (kind: MotionKind, preset: string) => MOTION_PRESET_INFO[kind].find((p) => p.value === preset)?.label ?? preset

/** One line per kind, for outline tooltips and the AI: "Fade up on scroll, Lift on hover". */
export function describeMotion(motion: BlockMotion | undefined): string {
  if (!motion) return ''
  const parts: string[] = []
  if (motion.enter) {
    const when = motion.enter.trigger === 'load' ? 'on load' : 'on scroll'
    parts.push(`${presetLabel('enter', motion.enter.preset)} ${when}${staggersChildren(motion) ? ' (children in turn)' : ''}`)
  }
  if (motion.hover) parts.push(`${presetLabel('hover', motion.hover.preset)} on hover`)
  if (motion.press) parts.push(`${presetLabel('press', motion.press.preset)} on press`)
  if (motion.scroll) parts.push(`${presetLabel('scroll', motion.scroll.preset)} while scrolling`)
  if (motion.loop) parts.push(`${presetLabel('loop', motion.loop.preset)} (loop)`)
  return parts.join(', ')
}

// ---------------------------------------------------------------------------
// JSON Schema (AI tools read it; it matches `motionProblems`)
// ---------------------------------------------------------------------------

const describePresets = (kind: MotionKind) => MOTION_PRESET_INFO[kind].map((p) => `${p.value}: ${p.description}`).join(' ')

function numberSchema(k: MotionKind, key: NumberKey, description: string) {
  const range = MOTION_SPECS[k].numbers[key] as Range
  return { type: 'number', minimum: range.min, maximum: range.max, description }
}

function kindSchema(k: MotionKind, description: string, props: Record<string, unknown>) {
  return {
    type: 'object',
    description,
    properties: { preset: { enum: [...MOTION_SPECS[k].presets], description: describePresets(k) }, ...props },
    required: ['preset'],
    additionalProperties: false,
  }
}

/** JSON Schema (draft 2020-12) of a block's `motion`. */
export function motionJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    description:
      'Animations of the block. Every kind is optional. Times are milliseconds, distances pixels. Keep motion subtle: ' +
      'one entrance per section or card group, short distances, durations of 400-900 ms.',
    properties: {
      enter: kindSchema('enter', 'The block appears when it scrolls into view (or on page load).', {
        duration: numberSchema('enter', 'duration', 'Milliseconds. Default 600.'),
        delay: numberSchema('enter', 'delay', 'Milliseconds before it starts. Default 0.'),
        easing: { enum: [...MOTION_EASINGS], description: 'Default "ease-out". "spring" and "bouncy" are springs.' },
        distance: numberSchema('enter', 'distance', 'Pixels the fade-up/down/left/right presets travel. Default 24.'),
        trigger: { enum: [...ENTER_TRIGGERS], description: '"view" (default): when it scrolls into view. "load": on page load (use for the first section).' },
        amount: numberSchema('enter', 'amount', 'Part of the block (0-1) in view before it plays. Default 0.2.'),
        offset: numberSchema('enter', 'offset', 'Pixels the block must be inside the window before it plays. Default 0.'),
        repeat: { type: 'boolean', description: 'Play every time it scrolls into view. Default false (once).' },
        stagger: numberSchema('enter', 'stagger', 'Milliseconds between children. When set, the direct child blocks play the entrance one after another and the block stays still. Use on grids and lists of cards (60-120).'),
      }),
      hover: kindSchema('hover', 'While the pointer is over the block (mouse only).', {
        distance: numberSchema('hover', 'distance', 'lift: pixels up. Default 4.'),
        scale: numberSchema('hover', 'scale', 'grow: scale. Default 1.03.'),
        angle: numberSchema('hover', 'angle', 'tilt: largest angle in degrees. Default 6.'),
      }),
      press: kindSchema('press', 'While the block is pressed. Good on buttons and cards that link.', {
        scale: numberSchema('press', 'scale', 'Default 0.97.'),
      }),
      scroll: kindSchema('scroll', 'Follows the scroll position while the block passes through the window.', {
        distance: numberSchema('scroll', 'distance', 'parallax: pixels it moves against the scroll. Negative moves with it. Default 60.'),
        scale: numberSchema('scroll', 'scale', 'zoom: the scale it starts from. Default 0.9.'),
      }),
      loop: kindSchema('loop', 'Plays again and again while in view. Use rarely, on small decorative blocks.', {
        duration: numberSchema('loop', 'duration', 'Milliseconds one way. Default 3000 (float) or 1500 (pulse).'),
        distance: numberSchema('loop', 'distance', 'float: pixels up and down. Default 8.'),
        scale: numberSchema('loop', 'scale', 'pulse: largest scale. Default 1.04.'),
      }),
    },
    additionalProperties: false,
    examples: [{ enter: { preset: 'fade-up' } }, { enter: { preset: 'fade-up', stagger: 80 } }, { hover: { preset: 'lift' }, press: { preset: 'shrink' } }],
  }
}

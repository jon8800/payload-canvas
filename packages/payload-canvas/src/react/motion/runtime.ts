// The motion runtime: plays `block.motion` in the browser with Motion's DOM API (docs/architecture.md
// section 8, "Motion"). RenderLayout puts the settings on each block's root element as
// `data-motion` (JSON); this module finds those elements and drives them. No React.
//
// - Entrances: `animate` from `motion/mini` (the Web Animations API, so the browser runs them on
//   the compositor), started by an IntersectionObserver. Each runs from its start values to the
//   element's own style, then hands the element back to its classes (inline styles removed).
// - Hover and press: Motion's `hover` and `press` gestures with short springs.
// - Scroll: an animation tied to the scroll position with Motion's `scroll` (a native ViewTimeline
//   where the browser has one).
// - Loops: an endless animation that pauses while the block is out of view (`inView`).
//
// Properties: entrances, hover and press animate `opacity`, `transform`, `filter` and `clip-path`;
// scroll and loop effects use the separate `translate`, `scale` and `opacity` properties, so they
// add to the others instead of replacing them. Nothing changes layout, so nothing shifts.

import { hover, inView, press, scroll, spring, stagger } from 'motion'
import { animate } from 'motion/mini'
import {
  EASING_CURVES,
  enterFrom,
  enterTiming,
  enterView,
  interactTransform,
  loopPlan,
  MOTION_ATTR,
  MOTION_ITEM_ATTR,
  MOTION_READY_ATTR,
  MOTION_REVEAL_ATTR,
  parseMotionAttribute,
  scrollPlan,
  SPRING_BOUNCE,
  staggersChildren,
  type BlockMotion,
  type EnterFrom,
  type EnterMotion,
  type EnterTiming,
} from '../../core'

import { ENTER_ANIMATION_PREFIX, HIDE_ANIMATION } from './style'

type Controls = ReturnType<typeof animate>

export type MotionOptions = {
  /** The document to run in. Default: `document`. */
  root?: Document
  /** Reduced motion. Default: the visitor's `prefers-reduced-motion` setting. */
  reduced?: boolean
}

/** Inline style properties an entrance sets. They get their old values back when it ends. */
const ENTER_STYLES = ['opacity', 'transform', 'filter', 'clip-path', 'transition'] as const

/** An element hidden for an entrance, or playing it. */
type Target = {
  el: HTMLElement
  /** Inline values before the entrance ('' = not set). */
  saved: string[]
  /** The element's own computed values: where the entrance ends. */
  natural: { opacity: string; transform: string; filter: string; clipPath: string }
  from: EnterFrom
  anim: Controls | null
}

/** One animated block element. */
type Entry = {
  el: HTMLElement
  /** The `data-motion` value it was set up with. */
  key: string
  motion: BlockMotion
  /** Hidden or playing entrance targets: the block, or its children with stagger. */
  targets: Target[]
  /** waiting: hidden until it plays. played: done (or playing). */
  state: 'waiting' | 'played'
  stops: Array<() => void>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

function transitionOf(timing: Pick<EnterTiming, 'duration' | 'easing'>) {
  if (timing.easing === 'spring' || timing.easing === 'bouncy') {
    return { type: spring, visualDuration: timing.duration / 1000, bounce: SPRING_BOUNCE[timing.easing] }
  }
  return { duration: timing.duration / 1000, ease: timing.easing === 'linear' ? ('linear' as const) : EASING_CURVES[timing.easing] }
}

/** Direct child blocks of a staggering block: the nearest motion owner above them is `owner`. */
function itemsOf(owner: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const item of owner.querySelectorAll<HTMLElement>(`[${MOTION_ITEM_ATTR}]`)) {
    if (item.parentElement?.closest(`[${MOTION_ATTR}]`) === owner) out.push(item)
  }
  return out
}

function ownerOf(item: Element): HTMLElement | null {
  return item.parentElement?.closest<HTMLElement>(`[${MOTION_ATTR}]`) ?? null
}

/** The CSS animations of an element whose name passes `test`. */
function cssAnimations(el: HTMLElement, test: (name: string) => boolean): CSSAnimation[] {
  return el.getAnimations().filter((a): a is CSSAnimation => 'animationName' in a && test((a as CSSAnimation).animationName))
}

/**
 * True when the visitor may already see the element, so hiding it for its entrance would flash:
 * it is in the window, and no CSS hides it, because the hiding ended (the runtime started late) or
 * the visitor asked for less motion (nothing is hidden then). Elements below the window still play
 * their entrance. Without any hiding CSS (the editor canvas), every element plays.
 */
function alreadySeen(el: HTMLElement, reduced: boolean): boolean {
  if (el.hasAttribute(MOTION_READY_ATTR)) return false
  const win = el.ownerDocument.defaultView!
  const hiding = win.getComputedStyle(el).animationName.includes(HIDE_ANIMATION)
  if (hiding && cssAnimations(el, (name) => name === HIDE_ANIMATION).length > 0) return false
  if (!hiding && !reduced) return false
  const rect = el.getBoundingClientRect()
  return rect.bottom > 0 && rect.top < win.innerHeight && rect.right > 0 && rect.left < win.innerWidth
}

/** True when an ancestor below the page is a scroll box (`overflow` hidden, auto or scroll). */
function insideScrollBox(el: HTMLElement): boolean {
  const win = el.ownerDocument.defaultView!
  for (let node = el.parentElement; node && node !== el.ownerDocument.body; node = node.parentElement) {
    const style = win.getComputedStyle(node)
    if (/hidden|auto|scroll/.test(style.overflowX + style.overflowY)) return true
  }
  return false
}

function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Hides elements at the start of their entrance. Batched: first every element leaves the CSS
 * that hides it before JavaScript runs (`data-motion-ready`), then every own style is read, then
 * the start values are written. No paint happens in between, so nothing flashes.
 */
function prepareTargets(elements: HTMLElement[], enter: EnterMotion, reduced: boolean): Target[] {
  const from = enterFrom(enter, reduced)
  for (const el of elements) el.setAttribute(MOTION_READY_ATTR, '')
  const targets = elements.map((el): Target => {
    const style = el.ownerDocument.defaultView!.getComputedStyle(el)
    return {
      el,
      saved: ENTER_STYLES.map((name) => el.style.getPropertyValue(name)),
      natural: { opacity: style.opacity, transform: style.transform, filter: style.filter, clipPath: style.clipPath },
      from,
      anim: null,
    }
  })
  for (const target of targets) hideTarget(target)
  return targets
}

function startValues(target: Target): Record<string, string> {
  const { from, natural } = target
  const out: Record<string, string> = {}
  if (from.opacity !== undefined) out.opacity = String(from.opacity)
  if (from.transform) out.transform = natural.transform === 'none' ? from.transform : `${from.transform} ${natural.transform}`
  if (from.filter) out.filter = natural.filter === 'none' ? from.filter : `${from.filter} ${natural.filter}`
  if (from.clipPath) out.clipPath = from.clipPath
  return out
}

function hideTarget(target: Target): void {
  const { el } = target
  // A transition class on the block would delay the start values; the entrance owns them.
  el.style.transition = 'none'
  for (const [name, value] of Object.entries(startValues(target))) el.style.setProperty(kebab(name), value)
}

/** Gives the element back to its classes: the inline values it had before the entrance. */
function releaseTarget(target: Target): void {
  target.anim = null
  ENTER_STYLES.forEach((name, i) => {
    const value = target.saved[i]
    if (value) target.el.style.setProperty(name, value)
    else target.el.style.removeProperty(name)
  })
}

function playTargets(targets: Target[], timing: EnterTiming, onDone: (target: Target) => void): Promise<void> {
  const delayOf = stagger(timing.stagger / 1000, { startDelay: timing.delay / 1000 })
  const transition = transitionOf(timing)
  const runs = targets.map((target, i) => {
    const start = startValues(target)
    const end: Record<string, string> = {
      opacity: target.natural.opacity,
      transform: target.natural.transform,
      filter: target.natural.filter,
      clipPath: target.natural.clipPath === 'none' ? 'inset(0% 0% 0% 0%)' : target.natural.clipPath,
    }
    const keyframes: Record<string, string[]> = {}
    for (const [name, value] of Object.entries(start)) keyframes[name] = [value, end[name]]
    const anim = animate(target.el, keyframes, { ...transition, delay: delayOf(i, targets.length) })
    target.anim = anim
    return anim.finished.then(() => {
      if (target.anim === anim) onDone(target)
    })
  })
  return Promise.all(runs).then(() => undefined)
}

// ---------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------

class MotionController {
  readonly doc: Document
  readonly win: Window
  readonly reduced: boolean
  readonly entries = new Map<HTMLElement, Entry>()
  /** Elements whose entrance holds their `transform`: hover and press wait. */
  readonly entering = new WeakSet<HTMLElement>()
  private observer: MutationObserver | null = null
  private scheduled = false

  constructor(doc: Document, reduced: boolean) {
    this.doc = doc
    this.win = doc.defaultView ?? window
    this.reduced = reduced
  }

  start(): void {
    this.sync()
    this.observer = new MutationObserver(() => this.schedule())
    this.observer.observe(this.doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [MOTION_ATTR] })
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null
    for (const entry of this.entries.values()) this.teardown(entry)
    this.entries.clear()
    for (const el of this.doc.querySelectorAll(`[${MOTION_READY_ATTR}]`)) el.removeAttribute(MOTION_READY_ATTR)
  }

  private schedule(): void {
    if (this.scheduled) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      if (this.observer) this.sync()
    })
  }

  /** Sets up new and changed elements, drops removed ones, and shows reveals nobody plays. */
  sync(): void {
    for (const entry of this.entries.values()) {
      if (!entry.el.isConnected || entry.el.getAttribute(MOTION_ATTR) !== entry.key) {
        this.teardown(entry)
        this.entries.delete(entry.el)
      }
    }
    for (const el of this.doc.querySelectorAll<HTMLElement>(`[${MOTION_ATTR}]`)) {
      if (this.entries.has(el)) continue
      const key = el.getAttribute(MOTION_ATTR) ?? ''
      const motion = parseMotionAttribute(key)
      if (!motion) continue
      const entry: Entry = { el, key, motion, targets: [], state: 'played', stops: [] }
      this.entries.set(el, entry)
      this.setup(entry)
    }
    // A reveal no entrance owns (a child added after its parent played, bad data): show it now.
    for (const el of this.doc.querySelectorAll<HTMLElement>(`[${MOTION_REVEAL_ATTR}]:not([${MOTION_READY_ATTR}])`)) {
      const owner = el.hasAttribute(MOTION_ITEM_ATTR) ? ownerOf(el) : null
      const entry = owner ? this.entries.get(owner) : undefined
      if (entry?.state === 'waiting' && entry.motion.enter && !alreadySeen(el, this.reduced)) {
        entry.targets.push(...prepareTargets([el], entry.motion.enter, this.reduced))
        this.entering.add(el)
      } else {
        el.setAttribute(MOTION_READY_ATTR, '')
      }
    }
  }

  private setup(entry: Entry): void {
    const { motion } = entry
    // A child of a staggering block plays its parent's entrance, never its own.
    if (motion.enter && !entry.el.hasAttribute(MOTION_ITEM_ATTR)) this.setupEnter(entry, motion.enter)
    if (motion.hover || motion.press) this.setupInteraction(entry)
    if (motion.scroll) this.setupScroll(entry)
    if (motion.loop) this.setupLoop(entry)
  }

  private teardown(entry: Entry): void {
    for (const stop of entry.stops.splice(0)) stop()
    for (const target of entry.targets) {
      target.anim?.cancel()
      releaseTarget(target)
      this.entering.delete(target.el)
    }
    entry.targets = []
  }

  // Entrances ---------------------------------------------------------------

  private setupEnter(entry: Entry, enter: EnterMotion): void {
    const view = enterView(enter)
    const all = staggersChildren(entry.motion) ? itemsOf(entry.el) : [entry.el]
    const elements: HTMLElement[] = []
    for (const el of all) {
      if (view.load && this.takeCssEntrance(el)) continue
      if (alreadySeen(el, this.reduced)) el.setAttribute(MOTION_READY_ATTR, '')
      else elements.push(el)
    }
    entry.targets = prepareTargets(elements, enter, this.reduced)
    for (const target of entry.targets) this.entering.add(target.el)
    entry.state = 'waiting'
    if (view.load) {
      this.playEnter(entry, enter)
      return
    }
    entry.stops.push(
      watchView(this.win, entry.el, view, {
        enter: () => this.playEnter(entry, enter),
        leave: view.repeat ? () => this.resetEnter(entry) : undefined,
      }),
    )
  }

  /**
   * A block that appears on load already plays its entrance in CSS (`enterCss`), from first
   * paint. The runtime only marks it as its own and holds hover and press until it ends.
   */
  private takeCssEntrance(el: HTMLElement): boolean {
    if (!this.win.getComputedStyle(el).animationName.includes(ENTER_ANIMATION_PREFIX)) return false
    el.setAttribute(MOTION_READY_ATTR, '')
    const running = cssAnimations(el, (name) => name.startsWith(ENTER_ANIMATION_PREFIX)).filter((a) => a.playState !== 'finished')
    if (running.length > 0) {
      this.entering.add(el)
      const done = () => this.entering.delete(el)
      void Promise.all(running.map((a) => a.finished)).then(done, done)
    }
    return true
  }

  private playEnter(entry: Entry, enter: EnterMotion): void {
    if (entry.state !== 'waiting') return
    entry.state = 'played'
    void playTargets(entry.targets, enterTiming(enter, this.reduced), (target) => {
      releaseTarget(target)
      this.entering.delete(target.el)
    })
  }

  /** "Every time": the block left the window; hide it again for the next entrance. */
  private resetEnter(entry: Entry): void {
    if (entry.state !== 'played' || !entry.motion.enter) return
    for (const target of entry.targets) {
      target.anim?.cancel()
      releaseTarget(target)
    }
    const elements = entry.targets.map((t) => t.el).filter((el) => el.isConnected)
    entry.targets = prepareTargets(elements, entry.motion.enter, this.reduced)
    for (const target of entry.targets) this.entering.add(target.el)
    entry.state = 'waiting'
  }

  // Hover and press ---------------------------------------------------------

  private setupInteraction(entry: Entry): void {
    if (this.reduced) return
    const { el, motion } = entry
    const state = { hovered: false, pressed: false, tilt: [0, 0] as [number, number] }
    let natural: string | null = null
    let saved = ''
    let generation = 0
    const apply = (mode: 'in' | 'out' | 'press' | 'follow') => {
      if (this.entering.has(el)) return
      if (natural === null) {
        saved = el.style.transform
        natural = this.win.getComputedStyle(el).transform
      }
      const extra = interactTransform(motion.hover, motion.press, state)
      const target = extra === 'none' ? natural : natural === 'none' ? extra : `${natural} ${extra}`
      const options =
        mode === 'press'
          ? { duration: 0.12, ease: EASING_CURVES['ease-out'] }
          : mode === 'follow'
            ? { duration: 0.2, ease: EASING_CURVES['ease-out'] }
            : { type: spring, visualDuration: 0.3, bounce: mode === 'in' ? 0.15 : 0.2 }
      const mine = ++generation
      const anim = animate(el, { transform: target }, options)
      if (extra !== 'none') return
      void anim.finished.then(() => {
        if (mine !== generation) return
        // Back at rest: the classes own `transform` again.
        if (saved) el.style.transform = saved
        else el.style.removeProperty('transform')
        natural = null
      })
    }

    const fine = this.win.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true
    if (motion.hover && fine) {
      const tilt = motion.hover.preset === 'tilt'
      entry.stops.push(
        hover(el, () => {
          state.hovered = true
          apply('in')
          let frame = 0
          const onMove = (event: PointerEvent) => {
            if (frame) return
            frame = this.win.requestAnimationFrame(() => {
              frame = 0
              const rect = el.getBoundingClientRect()
              if (rect.width === 0 || rect.height === 0) return
              state.tilt = [((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1]
              apply('follow')
            })
          }
          if (tilt) el.addEventListener('pointermove', onMove)
          return () => {
            if (tilt) el.removeEventListener('pointermove', onMove)
            if (frame) this.win.cancelAnimationFrame(frame)
            state.hovered = false
            state.tilt = [0, 0]
            apply('out')
          }
        }),
      )
    }
    if (motion.press) {
      // Motion's `press` makes an element focusable when it is not; a block is not a control, so
      // keep the page's tab order as it is.
      const hadTabIndex = el.hasAttribute('tabindex')
      entry.stops.push(
        press(el, () => {
          state.pressed = true
          apply('press')
          return () => {
            state.pressed = false
            apply('out')
          }
        }),
      )
      if (!hadTabIndex && el.hasAttribute('tabindex')) el.removeAttribute('tabindex')
    }
    entry.stops.push(() => {
      generation++
      if (natural !== null) {
        if (saved) el.style.transform = saved
        else el.style.removeProperty('transform')
      }
    })
  }

  // Scroll and loop ---------------------------------------------------------

  private setupScroll(entry: Entry): void {
    const plan = entry.motion.scroll ? scrollPlan(entry.motion.scroll, this.reduced) : null
    if (!plan) return
    const { el } = entry
    const anim = animate(el, { [plan.property]: plan.keyframes } as Record<string, string[]>, { ease: 'linear', duration: 1 })
    const options = { target: el, offset: plan.offset, container: this.doc.scrollingElement ?? undefined }
    let stop: () => void
    if (insideScrollBox(el)) {
      // A native ViewTimeline follows the nearest scroll box, and `overflow: hidden` (the usual
      // parallax frame) makes one that never scrolls. Follow the page scroll in JavaScript instead.
      anim.pause()
      stop = scroll((progress: number) => {
        anim.time = progress * anim.duration
      }, options)
    } else {
      stop = scroll(anim, options)
    }
    entry.stops.push(() => {
      stop()
      anim.cancel()
      el.style.removeProperty(plan.property)
    })
  }

  private setupLoop(entry: Entry): void {
    const plan = entry.motion.loop ? loopPlan(entry.motion.loop, this.reduced) : null
    if (!plan) return
    const { el } = entry
    const anim = animate(el, { [plan.property]: plan.keyframes } as Record<string, string[]>, {
      duration: plan.duration / 1000,
      ease: 'easeInOut',
      repeat: Infinity,
      repeatType: 'reverse',
    })
    anim.pause()
    const stopView = inView(el, () => {
      anim.play()
      return () => anim.pause()
    })
    entry.stops.push(() => {
      stopView()
      anim.cancel()
      el.style.removeProperty(plan.property)
    })
  }
}

/**
 * Calls `enter` when `amount` of the element is in view (and `offset` pixels inside the window),
 * and `leave` when it is out of view completely. A block taller than the window counts as in view
 * once it covers most of the window.
 */
function watchView(
  win: Window,
  el: HTMLElement,
  view: { amount: number; offset: number },
  on: { enter: () => void; leave?: () => void },
): () => void {
  const height = el.getBoundingClientRect().height
  const amount = height > 0 ? Math.min(view.amount, (win.innerHeight * 0.6) / height) : view.amount
  let inside = false
  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!inside && record.isIntersecting && record.intersectionRatio >= amount - 0.001) {
          inside = true
          on.enter()
          if (!on.leave) observer.disconnect()
        } else if (inside && !record.isIntersecting) {
          inside = false
          on.leave?.()
        }
      }
    },
    { rootMargin: `0px 0px ${-view.offset}px 0px`, threshold: amount > 0 ? [0, amount] : [0] },
  )
  observer.observe(el)
  return () => observer.disconnect()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const running = new WeakMap<Document, { controller: MotionController; users: number }>()

/**
 * Plays every block animation in the document as visitors see it, and watches for new and
 * changed blocks. Calls share one runtime per document; the returned function stops it when the
 * last caller stops, and leaves every element in its final state.
 */
export function startMotion(options: MotionOptions = {}): () => void {
  const doc = options.root ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return () => {}
  let current = running.get(doc)
  if (!current) {
    const controller = new MotionController(doc, options.reduced ?? prefersReducedMotion(doc.defaultView ?? window))
    current = { controller, users: 0 }
    running.set(doc, current)
    controller.start()
  }
  current.users++
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    const entry = running.get(doc)
    if (!entry) return
    entry.users--
    if (entry.users > 0) return
    running.delete(doc)
    entry.controller.stop()
  }
}

/**
 * Plays one block's animation once from the start, then leaves its final state (the editor's
 * Preview). Its entrance (on its children with stagger) ignores the trigger; a block without an
 * entrance shows its hover and press effect in and out.
 */
export async function previewMotion(el: Element, options: { reduced?: boolean } = {}): Promise<void> {
  if (!(el instanceof (el.ownerDocument.defaultView ?? window).HTMLElement)) return
  const motion = parseMotionAttribute(el.getAttribute(MOTION_ATTR))
  if (!motion) return
  const win = el.ownerDocument.defaultView ?? window
  const reduced = options.reduced ?? prefersReducedMotion(win)
  const busy = previews.get(el)
  if (busy) busy()
  let cancelled = false
  const cleanups: Array<() => void> = []
  previews.set(el, () => {
    cancelled = true
    for (const cleanup of cleanups.splice(0)) cleanup()
  })
  try {
    if (motion.enter) {
      const elements = staggersChildren(motion) ? itemsOf(el) : [el]
      const targets = prepareTargets(elements, motion.enter, reduced)
      cleanups.push(() => {
        for (const target of targets) {
          target.anim?.cancel()
          releaseTarget(target)
        }
      })
      await playTargets(targets, enterTiming(motion.enter, reduced), releaseTarget)
      return
    }
    if (reduced || !(motion.hover || motion.press)) return
    const saved = el.style.transform
    const natural = win.getComputedStyle(el).transform
    const extra = interactTransform(motion.hover, motion.press, { hovered: true, pressed: Boolean(motion.press && !motion.hover), tilt: [0.6, -0.4] })
    const target = natural === 'none' ? extra : `${natural} ${extra}`
    const restore = () => {
      if (saved) el.style.transform = saved
      else el.style.removeProperty('transform')
    }
    cleanups.push(restore)
    await animate(el, { transform: target }, { type: spring, visualDuration: 0.3, bounce: 0.15 }).finished
    if (cancelled) return
    await new Promise((resolve) => win.setTimeout(resolve, 350))
    if (cancelled) return
    await animate(el, { transform: natural }, { type: spring, visualDuration: 0.3, bounce: 0.2 }).finished
    if (!cancelled) restore()
  } finally {
    if (!cancelled) previews.delete(el)
  }
}

const previews = new WeakMap<Element, () => void>()

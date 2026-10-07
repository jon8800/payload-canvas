'use client'

// Section thumbnails for the library. One hidden canvas iframe (`?mode=thumbnail`) renders one
// section at a time with the app's components and theme and returns a picture. Pictures are kept
// in memory and in IndexedDB, keyed by the section's content, the theme and the block definitions,
// so a theme change makes new ones. The iframe exists only while pictures are being made.

import type { Block, BlockDefinition } from '../../../core/types'
import { post, unwrap, type CanvasInit, type CanvasToAdmin, type ThumbnailRequest } from '../../../protocol'
import { THEME_CHANNEL } from '../../../theme/config'
import { createValueStore, type ValueStore } from '../valueStore'
import { readThumbnail, writeThumbnail } from './thumbnailCache'
import { canonicalJson, hashText, thumbnailKey } from './thumbnailKey'

/** The canvas width thumbnails are rendered at: a desktop layout. */
export const THUMBNAIL_CANVAS_WIDTH = 1280
const FRAME_HEIGHT = 800
/** Picture width: a library card at twice the pixel density. */
const OUTPUT_WIDTH = 520
/** Sections are cut at this height: a card shows the top part only. */
const MAX_HEIGHT = 820
const TIMEOUT_MS = 30_000
/** The iframe is removed after this long without work. */
const IDLE_MS = 30_000

type ThemeOutput = { css: string; fontsHref: string | null }

export type ThumbnailTheme = { status: 'loading' } | { status: 'ready'; output: ThemeOutput | null; hash: string }

export type ThumbnailService = {
  /** The theme thumbnails are made with. Loads on first use and follows theme saves. */
  theme: ValueStore<ThumbnailTheme>
  /** The cache key of `blocks` with the current theme. Null while the theme loads. */
  keyFor: (blocks: readonly Block[]) => string | null
  /** A thumbnail already in memory. */
  peek: (key: string) => string | null
  /** The thumbnail for `key`: from memory, then IndexedDB, else a new picture. Null on failure. */
  get: (key: string, blocks: Block[]) => Promise<string | null>
  /** Removes the iframe and stops following the theme, until the next use. */
  dispose: () => void
}

type Job = { key: string; blocks: Block[]; resolve: (url: string | null) => void }

type Frame = { iframe: HTMLIFrameElement; ready: Promise<void> }

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 1000 })
    else window.setTimeout(resolve, 16)
  })
}

export function createThumbnailService(options: {
  canvasPath: string
  init: CanvasInit
  themeEndpoint: string | null
  definitions: BlockDefinition[]
}): ThumbnailService {
  const theme = createValueStore<ThumbnailTheme>({ status: 'loading' })
  const memory = new Map<string, string>()
  const inflight = new Map<string, Promise<string | null>>()
  const queue: Job[] = []
  const waiting = new Map<string, (message: Extract<CanvasToAdmin, { type: 'thumbnail' }>) => void>()
  let definitionsHash: string | null = null
  let started = false
  let busy = false
  let frame: Frame | null = null
  let idleTimer = 0
  let channel: BroadcastChannel | null = null
  let themeRequest: AbortController | null = null

  const loadTheme = () => {
    if (!options.themeEndpoint) {
      theme.set({ status: 'ready', output: null, hash: 'none' })
      return
    }
    themeRequest?.abort()
    const controller = new AbortController()
    themeRequest = controller
    fetch(options.themeEndpoint, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async (res) => (res.ok ? ((await res.json()) as ThemeOutput) : null))
      .catch(() => null)
      .then((output) => {
        if (controller.signal.aborted) return
        const value = output && typeof output.css === 'string' ? { css: output.css, fontsHref: output.fontsHref ?? null } : null
        const hash = value ? hashText(`${value.css}\n${value.fontsHref ?? ''}`) : 'none'
        const current = theme.get()
        if (current.status === 'ready' && current.hash === hash) return
        theme.set({ status: 'ready', output: value, hash })
      })
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') loadTheme()
  }

  /** Loads the theme and follows its saves (another tab, the settings drawer) once something needs thumbnails. */
  const start = () => {
    if (started) return
    started = true
    loadTheme()
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(THEME_CHANNEL)
    channel?.addEventListener('message', loadTheme)
    document.addEventListener('visibilitychange', onVisible)
  }

  const onMessage = (event: MessageEvent) => {
    const message = unwrap<CanvasToAdmin>(event, frame?.iframe.contentWindow)
    if (!message || !frame) return
    if (message.type === 'ready') {
      post(frame.iframe.contentWindow, { type: 'init', init: options.init })
      readyResolve?.()
      return
    }
    if (message.type === 'thumbnail') waiting.get(message.key)?.(message)
  }

  let readyResolve: (() => void) | null = null
  const openFrame = (): Frame => {
    if (frame) return frame
    const iframe = document.createElement('iframe')
    const separator = options.canvasPath.includes('?') ? '&' : '?'
    iframe.src = `${options.canvasPath}${separator}mode=thumbnail`
    iframe.title = 'Section thumbnails'
    iframe.tabIndex = -1
    iframe.setAttribute('aria-hidden', 'true')
    iframe.dataset.builderThumbnails = ''
    Object.assign(iframe.style, {
      position: 'fixed',
      top: '0',
      left: '-20000px',
      width: `${THUMBNAIL_CANVAS_WIDTH}px`,
      height: `${FRAME_HEIGHT}px`,
      border: '0',
      opacity: '0',
      pointerEvents: 'none',
    })
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve
    })
    window.addEventListener('message', onMessage)
    document.body.append(iframe)
    frame = { iframe, ready }
    return frame
  }

  const closeFrame = () => {
    window.clearTimeout(idleTimer)
    if (!frame) return
    frame.iframe.remove()
    frame = null
    readyResolve = null
    window.removeEventListener('message', onMessage)
  }

  const render = async (job: Job): Promise<string | null> => {
    const current = theme.get()
    const { iframe, ready } = openFrame()
    await ready
    await idle()
    const request: ThumbnailRequest = {
      key: job.key,
      blocks: job.blocks,
      theme: current.status === 'ready' ? current.output : null,
      outputWidth: OUTPUT_WIDTH,
      maxHeight: MAX_HEIGHT,
    }
    return new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => finish(null), TIMEOUT_MS)
      function finish(url: string | null) {
        window.clearTimeout(timer)
        waiting.delete(job.key)
        resolve(url)
      }
      waiting.set(job.key, (message) => finish(message.url))
      post(iframe.contentWindow, { type: 'thumbnail', request })
    })
  }

  const pump = async () => {
    if (busy) return
    busy = true
    window.clearTimeout(idleTimer)
    while (queue.length > 0) {
      const job = queue.shift() as Job
      const url = await render(job).catch(() => null)
      if (url) {
        memory.set(job.key, url)
        void writeThumbnail(job.key, url)
      }
      job.resolve(url)
    }
    busy = false
    idleTimer = window.setTimeout(closeFrame, IDLE_MS)
  }

  return {
    theme: {
      ...theme,
      subscribe(listener) {
        start()
        return theme.subscribe(listener)
      },
    },
    keyFor(blocks) {
      start()
      const current = theme.get()
      if (current.status !== 'ready') return null
      definitionsHash ??= hashText(canonicalJson(options.definitions, false))
      return thumbnailKey(blocks, current.hash, definitionsHash)
    },
    peek: (key) => memory.get(key) ?? null,
    get(key, blocks) {
      const known = memory.get(key)
      if (known) return Promise.resolve(known)
      let promise = inflight.get(key)
      if (promise) return promise
      promise = readThumbnail(key)
        .then((stored) => {
          if (stored) {
            memory.set(key, stored)
            return stored
          }
          return new Promise<string | null>((resolve) => {
            queue.push({ key, blocks, resolve })
            void pump()
          })
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, promise)
      return promise
    },
    dispose() {
      // Not final: React may mount the editor again (Strict Mode). The next use starts again.
      started = false
      themeRequest?.abort()
      channel?.close()
      document.removeEventListener('visibilitychange', onVisible)
      for (const job of queue.splice(0)) job.resolve(null)
      closeFrame()
    },
  }
}

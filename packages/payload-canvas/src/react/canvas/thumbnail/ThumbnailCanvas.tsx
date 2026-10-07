'use client'

// The canvas page in thumbnail mode (`?mode=thumbnail`): a hidden iframe the editor's library
// uses to picture ready-made and saved sections. It renders one section at a time with the app's
// components, CSS and theme, and sends back a picture (see capture.ts).

import { collectClasses, type BlockDefinition, type Layout } from '../../../core'
import type { CanvasCssInput } from '../../../css'
import { createCanvasCompiler, type CanvasCompiler } from '../../../css/browser'
import { post, unwrap, type AdminToCanvas, type CanvasInit, type CanvasToAdmin, type ThumbnailRequest } from '../../../protocol'
import { useEffect, useMemo, useRef, useState } from 'react'

import { defaultResolveLink, RenderLayout, type PageData } from '../../index'
import type { BuilderCanvasProps } from '../BuilderCanvas'
import { resolveCanvasLayout } from '../resolveLayout'
import { ServerBlocksContext } from '../ServerBlock'
import { createServerBlocks } from '../serverBlocks'
import { withServerBlocks } from '../serverComponents'
import { captureElement } from './capture'

/** No scrollbar (it would narrow the page), hidden blocks left out, empty slots outlined. */
const THUMBNAIL_CSS = `
html { overflow: hidden; scrollbar-width: none; }
[data-builder-thumbnail] { display: flow-root; }
[data-builder-hidden] { display: none !important; }
[data-slot-empty] { border: 1px dashed rgb(128 128 128 / 0.35); border-radius: 4px; }
`

/** Time for late layout (fonts, images with a size) before the picture. */
const SETTLE_MS = 40
/** Longest wait for the theme's font stylesheet. */
const FONTS_TIMEOUT_MS = 4000
/** Longest wait for blocks rendered on the server. */
const SERVER_TIMEOUT_MS = 10000

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/** Waits until the theme's font stylesheet (rendered below) has loaded, or failed. */
function fontsLoaded(): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>('link[data-builder-thumbnail-fonts]')
  if (!link || link.sheet) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, FONTS_TIMEOUT_MS)
    const done = () => {
      window.clearTimeout(timer)
      resolve()
    }
    link.addEventListener('load', done, { once: true })
    link.addEventListener('error', done, { once: true })
  })
}

type Job = { request: ThumbnailRequest; layout: Layout; stored: Layout; css: string; pageData: PageData | null }

function send(message: CanvasToAdmin) {
  post(window.parent, message)
}

export function ThumbnailCanvas({ blocks, components, plugins, resolveLink, server }: BuilderCanvasProps) {
  const [init, setInit] = useState<CanvasInit | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [ownBlocks] = useState(blocks)
  const [linkResolver] = useState(() => resolveLink ?? defaultResolveLink)
  const pluginsRef = useRef(plugins)
  const queue = useRef<ThumbnailRequest[]>([])
  const pump = useRef<() => void>(() => {})
  /** Resolves when the current job has rendered. */
  const rendered = useRef<(() => void) | null>(null)
  const definitions: BlockDefinition[] | undefined = ownBlocks ?? init?.blocks
  // Blocks rendered on the server: no debounce, the picture waits for them.
  const [serverBlocks] = useState(() => (server ? createServerBlocks(server, { debounceMs: 0, maxEntries: 50 }) : null))
  const canvasComponents = useMemo(
    () => withServerBlocks(components, definitions, Boolean(serverBlocks)),
    [components, definitions, serverBlocks],
  )

  // Messages: init once, then thumbnail requests. `ready` repeats until init arrives.
  useEffect(() => {
    if (window.parent === window) return
    const readyTimer = window.setInterval(() => send({ type: 'ready' }), 250)
    const onMessage = (event: MessageEvent) => {
      const message = unwrap<AdminToCanvas>(event, window.parent)
      if (!message) return
      if (message.type === 'init') {
        window.clearInterval(readyTimer)
        setInit(message.init)
      } else if (message.type === 'thumbnail') {
        queue.current.push(message.request)
        pump.current()
      }
    }
    window.addEventListener('message', onMessage)
    send({ type: 'ready' })
    return () => {
      window.clearInterval(readyTimer)
      window.removeEventListener('message', onMessage)
    }
  }, [])

  // One job at a time: resolve the data, compile the CSS, render, wait, take the picture.
  useEffect(() => {
    if (!init || !definitions) return
    // An object, so the loop below sees the cleanup's change.
    const state = { cancelled: false, busy: false }
    const compiler: Promise<CanvasCompiler> = fetch(init.cssEndpoint, { credentials: 'include' }).then(async (res) => {
      if (!res.ok) throw new Error(`Canvas CSS: ${res.status} ${res.statusText}`)
      return createCanvasCompiler((await res.json()) as CanvasCssInput, pluginsRef.current)
    })

    serverBlocks?.setScope({ document: init.document ?? null, context: null })
    const pageData: Promise<PageData | null> = serverBlocks ? serverBlocks.pageData() : Promise.resolve(null)

    const run = async (request: ThumbnailRequest) => {
      const stored: Layout = { version: 1, blocks: request.blocks }
      const layout = await resolveCanvasLayout(stored, null, init.api, definitions, linkResolver)
      const css = (await compiler).build(collectClasses(layout, definitions))
      const done = new Promise<void>((resolve) => {
        rendered.current = resolve
      })
      setJob({ request, layout, stored, css, pageData: await pageData })
      await done
      if (serverBlocks) {
        await Promise.race([serverBlocks.idle(), new Promise((resolve) => setTimeout(resolve, SERVER_TIMEOUT_MS))])
        // The server content shows in a transition: let it commit and paint.
        await nextFrame()
      }
      await fontsLoaded()
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
      const root = rootRef.current
      if (!root || state.cancelled) throw new Error('The thumbnail page closed')
      return captureElement(root, { outputWidth: request.outputWidth, maxHeight: request.maxHeight })
    }

    pump.current = async () => {
      if (state.busy) return
      state.busy = true
      while (!state.cancelled && queue.current.length > 0) {
        const request = queue.current.shift() as ThumbnailRequest
        try {
          const picture = await run(request)
          if (!state.cancelled) send({ type: 'thumbnail', key: request.key, url: picture.url, width: picture.width, height: picture.height })
        } catch (error) {
          if (!state.cancelled) send({ type: 'thumbnail', key: request.key, url: null, error: error instanceof Error ? error.message : String(error) })
        }
      }
      state.busy = false
    }
    pump.current()
    return () => {
      state.cancelled = true
    }
    // `definitions` changes only with `init`; the link resolver is fixed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [init])

  // After the job rendered (painted), let the waiting job continue.
  useEffect(() => {
    if (!job) return
    rendered.current?.()
    rendered.current = null
  }, [job])

  return (
    <>
      <style data-builder-thumbnail-css="">{THUMBNAIL_CSS}</style>
      {/* The theme of the request, after the page's own (same selector, so it wins). In the body,
          not the head: the head may still be hydrating. */}
      {job?.request.theme?.css ? <style data-builder-thumbnail-theme="">{job.request.theme.css}</style> : null}
      {job?.request.theme?.fontsHref ? <link rel="stylesheet" href={job.request.theme.fontsHref} data-builder-thumbnail-fonts="" /> : null}
      <div ref={rootRef} data-builder-thumbnail="">
        {job && definitions && (
          <ServerBlocksContext.Provider value={serverBlocks ? { store: serverBlocks, layout: job.stored, version: 0 } : null}>
            <RenderLayout
              key={job.request.key}
              layout={job.layout}
              blocks={definitions}
              components={canvasComponents}
              css={job.css}
              mode="canvas"
              resolveLink={resolveLink}
              pageData={job.pageData}
            />
          </ServerBlocksContext.Provider>
        )}
      </div>
    </>
  )
}

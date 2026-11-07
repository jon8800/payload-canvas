'use client'

// Comment mode on the canvas: a layer over the iframe that takes the pointer (a click places a
// pin on the block under it, the wheel still scrolls the page), the pins of the threads, and the
// popover with the composer or the open thread. Renders nothing outside comment mode, so the
// canvas does no comment work while people edit.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { deepestBlockAt } from '../../../core'
import type { Point } from '../../../core/types'
import { threadsOf, type CommentThread } from '../../../comments/shared'
import { Icon } from '../icons'
import { cursorAt, cursorPoint } from '../live/presence'
import { toCanvasPoint, useRuntime, type Runtime } from '../runtime'
import { useEditor } from '../store'
import { useValue } from '../valueStore'
import type { CommentsController } from './controller'
import { Avatar, CommentInput, Thread } from './Thread'
import './comments.scss'

const noSubscription = () => () => {}
const editorRoot = () => document.querySelector<HTMLElement>('.builder-editor')
const noRoot = () => null

/** Space between the pin and its popover, and from the window edge, in screen pixels. */
const GAP = 10
/** The pin's size on screen (`.builder-comment-pin`): the popover sits beside it, never over it. */
const PIN = 30
const POPOVER_WIDTH = 300

export function CommentLayer() {
  const { comments } = useRuntime()
  if (!comments) return null
  return <ModeGate comments={comments} />
}

function ModeGate({ comments }: { comments: CommentsController }) {
  const on = useValue(comments.mode)
  return on ? <ModeLayer comments={comments} /> : null
}

function ModeLayer({ comments }: { comments: CommentsController }) {
  const runtime = useRuntime()
  const measurement = useValue(runtime.measurement)
  const list = useValue(comments.list)
  const filter = useValue(comments.filter)
  const draft = useValue(comments.draft)
  const openId = useValue(comments.open)
  const layout = useEditor(runtime.store, (s) => s.layout)
  // The block under the pointer, by id: its outline follows the block when the page scrolls or changes.
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hovered = hoveredId ? (measurement?.blocks.find((b) => b.id === hoveredId)?.rect ?? null) : null
  const threads = useMemo(() => threadsOf(list, filter), [list, filter])
  const openThread = useMemo(() => (openId ? threadsOf(list).find((t) => t.root.id === openId) : undefined), [list, openId])

  const pointAt = (e: PointerEvent): Point | null => {
    const iframe = runtime.iframeRef.current
    return iframe ? toCanvasPoint(iframe, { x: e.clientX, y: e.clientY }) : null
  }
  const onMove = (e: PointerEvent) => {
    const p = pointAt(e)
    setHoveredId(p && measurement ? deepestBlockAt(layout, measurement, p) : null)
  }
  const onClick = (e: PointerEvent) => {
    const p = pointAt(e)
    if (!p || !measurement) return
    const cursor = cursorAt(layout, measurement, p)
    // Over the page background, not a block: close what is open.
    if (!cursor.blockId) {
      comments.draft.set(null)
      comments.open.set(null)
      return
    }
    // A click while a thread or the composer is open only closes it.
    if (comments.draft.get() || comments.open.get()) {
      comments.draft.set(null)
      comments.open.set(null)
      return
    }
    comments.place(cursor)
  }

  const pinAt = (blockId: string | null, x: number, y: number) => (measurement && blockId ? cursorPoint(measurement, { blockId, x, y }) : null)
  const draftPoint = draft ? pinAt(draft.blockId, draft.x, draft.y) : null
  const openPoint = openThread ? pinAt(openThread.root.blockId, openThread.root.x, openThread.root.y) : null

  return (
    <div className="builder-comments-layer">
      <div
        className="builder-comments-layer__capture"
        aria-label="Click a block to comment"
        onPointerMove={onMove}
        onPointerLeave={() => setHoveredId(null)}
        onPointerDown={(e) => e.button === 0 && onClick(e)}
        onWheel={(e) => runtime.postToCanvas({ type: 'scrollBy', dx: e.deltaX, dy: e.deltaY })}
      />
      {hovered && (
        <div className="builder-comments-layer__hover" style={{ left: hovered.x, top: hovered.y, width: hovered.width, height: hovered.height }} />
      )}
      {threads.map((thread) => {
        const point = pinAt(thread.root.blockId, thread.root.x, thread.root.y)
        if (!point) return null
        return <Pin key={thread.root.id} thread={thread} point={point} open={thread.root.id === openId} comments={comments} />
      })}
      {draftPoint && (
        <span className="builder-comment-pin builder-comment-pin--draft" style={{ left: draftPoint.x, top: draftPoint.y }} aria-hidden>
          <Icon name="plus" size={12} />
        </span>
      )}
      {draft && draftPoint && (
        <Popover runtime={runtime} point={draftPoint} label="New comment" onClose={() => comments.draft.set(null)}>
          <div className="builder-thread builder-thread--new">
            <CommentInput
              placeholder="Add a comment"
              submitLabel="Comment"
              focusOnMount
              onCancel={() => comments.draft.set(null)}
              onSubmit={(body) => comments.create(body)}
            />
          </div>
        </Popover>
      )}
      {openThread && openPoint && (
        <Popover runtime={runtime} point={openPoint} label="Comment thread" onClose={() => comments.open.set(null)}>
          <Thread thread={openThread} comments={comments} onClose={() => comments.open.set(null)} />
        </Popover>
      )}
    </div>
  )
}

function Pin({ thread, point, open, comments }: { thread: CommentThread; point: Point; open: boolean; comments: CommentsController }) {
  const { root, replies } = thread
  const classes = ['builder-comment-pin', open && 'builder-comment-pin--open', root.resolved && 'builder-comment-pin--resolved'].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={classes}
      style={{ left: point.x, top: point.y }}
      aria-label={`Comment by ${root.authorName}${replies.length ? `, ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : ''}`}
      aria-expanded={open}
      onClick={() => {
        comments.draft.set(null)
        comments.open.set(open ? null : root.id)
      }}
    >
      {root.resolved ? <Icon name="check" size={12} /> : <Avatar name={root.authorName} />}
    </button>
  )
}

/**
 * The composer or the thread next to its pin, in the editor root (outside the zoomed frame, so it
 * keeps its size). Hidden while the pin is scrolled out of the canvas.
 */
function Popover({ runtime, point, label, onClose, children }: { runtime: Runtime; point: Point; label: string; onClose: () => void; children: ReactNode }) {
  const host = useSyncExternalStore(noSubscription, editorRoot, noRoot)
  const ref = useRef<HTMLDialogElement>(null)
  // Escape inside the popover closes it (a text box that cancels an edit handles it first).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [onClose])
  const iframe = runtime.iframeRef.current
  const box = iframe?.getBoundingClientRect()
  const scale = iframe && box && iframe.offsetWidth ? box.width / iframe.offsetWidth : 1
  const screen = box ? { x: box.left + point.x * scale, y: box.top + point.y * scale } : null
  const visible = Boolean(box && screen && screen.y >= box.top && screen.y <= box.bottom && screen.x >= box.left && screen.x <= box.right)

  // Right of the pin when it fits, else left. Kept inside the window vertically.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !screen) return
    const right = screen.x + PIN + GAP + POPOVER_WIDTH <= window.innerWidth - GAP
    const left = right ? screen.x + PIN + GAP : screen.x - GAP - POPOVER_WIDTH
    // The popover's top lines up with the pin's top.
    const top = Math.min(Math.max(GAP, screen.y - PIN), window.innerHeight - el.offsetHeight - GAP)
    el.style.left = `${Math.max(GAP, left)}px`
    el.style.top = `${Math.max(GAP, top)}px`
  })

  if (!host || !visible) return null
  const style = { width: POPOVER_WIDTH } as CSSProperties
  return createPortal(
    <dialog ref={ref} open className="builder-comments-popover" aria-label={label} style={style}>
      {children}
    </dialog>,
    host,
  )
}

'use client'

// The comments panel (the right sidebar in comment mode) and the top bar button with the count of
// open threads.

import { useMemo, type ReactNode } from 'react'

import { findBlock } from '../../../core'
import { openCount, threadsOf, type CommentFilter, type CommentThread } from '../../../comments/shared'
import { Icon } from '../icons'
import { blockName } from '../names'
import { useRuntime, type Runtime } from '../runtime'
import { useEditor } from '../store'
import { formatSaveTime } from '../topbar/saveTime'
import { useOptionalValue, useValue, useValueSelector } from '../valueStore'
import type { CommentsController } from './controller'
import { Avatar, Thread } from './Thread'
import './comments.scss'

/** Top bar: comment mode on or off, with the number of open threads. */
export function CommentsButton() {
  const { comments } = useRuntime()
  if (!comments) return null
  return <CommentsToggle comments={comments} />
}

function CommentsToggle({ comments }: { comments: CommentsController }) {
  const on = useValue(comments.mode)
  const count = useValueSelector(comments.list, openCount)
  const label = count > 0 ? `Comments, ${count} open` : 'Comments'
  return (
    <button
      type="button"
      className="builder-editor__icon-button builder-comments-button"
      aria-pressed={on}
      aria-label={label}
      aria-keyshortcuts="C"
      data-tooltip={`${on ? 'Leave comment mode' : 'Comments'} · C`}
      onClick={() => comments.toggle()}
    >
      <Icon name="comment" />
      {count > 0 && <span className="builder-comments-button__badge">{count > 99 ? '99+' : count}</span>}
    </button>
  )
}

/** In comment mode the panel takes the inspector's place. The inspector stays mounted. */
export function CommentsOrInspector({ children }: { children: ReactNode }) {
  const { comments } = useRuntime()
  const on = useOptionalValue(comments?.mode ?? null) === true
  return (
    <>
      {on && comments && <CommentsPanel comments={comments} />}
      <div className="builder-comments-keep" hidden={on}>
        {children}
      </div>
    </>
  )
}

const FILTERS: { id: CommentFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
]

function CommentsPanel({ comments }: { comments: CommentsController }) {
  const runtime = useRuntime()
  const list = useValue(comments.list)
  const loaded = useValue(comments.loaded)
  const filter = useValue(comments.filter)
  const openId = useValue(comments.open)
  const threads = useMemo(() => threadsOf(list, filter), [list, filter])
  const counts = useMemo(() => {
    const all = threadsOf(list)
    const open = all.filter((t) => !t.root.resolved).length
    return { all: all.length, open, resolved: all.length - open }
  }, [list])

  return (
    <section className="builder-comments-panel" aria-label="Comments">
      <header className="builder-comments-panel__head">
        <h2 className="builder-comments-panel__title">Comments</h2>
        <button
          type="button"
          className="builder-editor__icon-button builder-editor__icon-button--small"
          aria-label="Close comments"
          data-tooltip="Close · C"
          onClick={() => comments.toggle(false)}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="builder-comments-panel__filter">
        <div className="builder-editor__segmented builder-editor__segmented--full builder-editor__segmented--small" role="tablist" aria-label="Show">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filter === option.id}
              className="builder-editor__segment"
              onClick={() => comments.filter.set(option.id)}
            >
              {option.label}
              {counts[option.id] > 0 && <span className="builder-editor__segment-count">{counts[option.id]}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="builder-comments-panel__list">
        {threads.length === 0 ? (
          <div className="builder-editor__empty">
            <Icon name="comment" size={20} />
            <p>{!loaded ? 'Loading comments' : filter === 'resolved' ? 'No resolved comments' : filter === 'open' && counts.all > 0 ? 'All resolved' : 'No comments yet'}</p>
            {loaded && filter !== 'resolved' && <p className="builder-editor__hint">Click a block on the canvas to comment on it.</p>}
          </div>
        ) : (
          threads.map((thread) => <ThreadCard key={thread.root.id} thread={thread} open={openId === thread.root.id} runtime={runtime} comments={comments} />)
        )}
      </div>
    </section>
  )
}

function ThreadCard({ thread, open, runtime, comments }: { thread: CommentThread; open: boolean; runtime: Runtime; comments: CommentsController }) {
  const { root, replies } = thread
  const block = useEditor(runtime.store, (s) => (root.blockId ? findBlock(s.view, root.blockId) : null))
  const where = block ? blockName(block, runtime.blockLabel(block.type)) : null
  const last = replies.at(-1)

  const show = () => {
    comments.draft.set(null)
    if (open) {
      comments.open.set(null)
      return
    }
    comments.open.set(root.id)
    if (!block) return
    runtime.store.select(block.id)
    runtime.postToCanvas({ type: 'scrollIntoView', id: block.id })
  }

  const classes = ['builder-comment-card', open && 'builder-comment-card--open', root.resolved && 'builder-comment-card--resolved'].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      <button type="button" className="builder-comment-card__summary" aria-expanded={open} onClick={show}>
        <Avatar name={root.authorName} />
        <span className="builder-comment-card__main">
          <span className="builder-comment__head">
            <span className="builder-comment__name">{root.authorName}</span>
            <time className="builder-comment__time" dateTime={root.createdAt}>
              {formatSaveTime(root.createdAt)}
            </time>
            {root.resolved && (
              <span className="builder-comment-card__resolved" aria-label="Resolved">
                <Icon name="check" size={12} />
              </span>
            )}
          </span>
          <span className="builder-comment-card__body">{root.body}</span>
          <span className="builder-comment-card__meta">
            {where ? (
              <span className="builder-comment-card__where">{where}</span>
            ) : (
              <span className="builder-comment-card__deleted">Block deleted</span>
            )}
            {replies.length > 0 && (
              <span>
                {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                {last && ` · ${last.authorName}`}
              </span>
            )}
          </span>
        </span>
      </button>
      {/* A thread without its block has no pin: it opens here. */}
      {open && !block && <Thread thread={thread} comments={comments} />}
    </div>
  )
}

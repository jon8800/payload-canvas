'use client'

// A comment thread (the popover at a pin, and the panel for threads whose block is gone) and the
// text box that writes comments and replies.

import { useAuth, useConfig } from '@payloadcms/ui'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { authorKeyOf, COMMENT_MAX, type BuilderComment, type CommentThread } from '../../../comments/shared'
import { Icon } from '../icons'
import { initials } from '../live/presence'
import { formatSaveTime } from '../topbar/saveTime'
import type { CommentsController } from './controller'

/** The signed-in user's author key, to tell their own comments. */
export function useAuthorKey(): string | null {
  const { user } = useAuth()
  const { config } = useConfig()
  if (!user) return null
  const u = user as { collection?: unknown }
  return authorKeyOf({ ...user, collection: typeof u.collection === 'string' ? u.collection : config.admin.user })
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="builder-comment__avatar" aria-hidden>
      {initials(name)}
    </span>
  )
}

type InputProps = {
  placeholder: string
  submitLabel: string
  initial?: string
  focusOnMount?: boolean
  /** Shows Cancel, and Escape cancels. */
  onCancel?: () => void
  /** True when the text was saved: the box empties. */
  onSubmit: (body: string) => Promise<boolean>
}

/** A text box that grows with its text. Enter sends, Shift+Enter adds a line, Escape cancels. */
export function CommentInput({ placeholder, submitLabel, initial = '', focusOnMount, onCancel, onSubmit }: InputProps) {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!focusOnMount) return
    const el = ref.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [focusOnMount])

  const submit = async () => {
    if (busy || !text.trim()) return
    setBusy(true)
    const saved = await onSubmit(text)
    setBusy(false)
    if (saved) setText('')
    ref.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  return (
    <div className="builder-comment-input">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={COMMENT_MAX}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="builder-comment-input__actions">
        {onCancel && (
          <button type="button" className="builder-comment__text-button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="builder-comment__send"
          disabled={busy || !text.trim()}
          aria-label={submitLabel}
          data-tooltip={`${submitLabel} · Enter`}
          onClick={() => void submit()}
        >
          <Icon name="arrowUp" size={14} />
        </button>
      </div>
    </div>
  )
}

/** One comment: author, time, text, and Edit / Delete for its author. */
function CommentItem({ comment, own, comments, isRoot }: { comment: BuilderComment; own: boolean; comments: CommentsController; isRoot: boolean }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const time = formatSaveTime(comment.createdAt)

  return (
    <article className="builder-comment">
      <Avatar name={comment.authorName} />
      <div className="builder-comment__main">
        <header className="builder-comment__head">
          <span className="builder-comment__name">{comment.authorName}</span>
          <time className="builder-comment__time" dateTime={comment.createdAt}>
            {time}
            {comment.editedAt && ' · edited'}
          </time>
          {own && !editing && (
            <span className="builder-comment__tools">
              <button
                type="button"
                className="builder-editor__icon-button builder-editor__icon-button--small"
                aria-label="Edit"
                data-tooltip="Edit"
                onClick={() => setEditing(true)}
              >
                <Icon name="rename" size={13} />
              </button>
              <button
                type="button"
                className="builder-editor__icon-button builder-editor__icon-button--small"
                aria-label="Delete"
                data-tooltip="Delete"
                onClick={() => setConfirming(true)}
              >
                <Icon name="delete" size={13} />
              </button>
            </span>
          )}
        </header>
        {editing ? (
          <CommentInput
            placeholder="Edit comment"
            submitLabel="Save"
            initial={comment.body}
            focusOnMount
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              const saved = await comments.edit(comment.id, body)
              if (saved) setEditing(false)
              return saved
            }}
          />
        ) : (
          <p className="builder-comment__body">{comment.body}</p>
        )}
        {confirming && (
          <div className="builder-comment__confirm" role="alert">
            <span>{isRoot ? 'Delete this thread and its replies?' : 'Delete this reply?'}</span>
            <button type="button" className="builder-comment__text-button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="builder-comment__text-button builder-comment__text-button--danger" onClick={() => void comments.remove(comment.id)}>
              Delete
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

/** The thread: resolve and close in the head, the comments, and a reply box. */
export function Thread({ thread, comments, onClose }: { thread: CommentThread; comments: CommentsController; onClose?: () => void }) {
  const me = useAuthorKey()
  const { root, replies } = thread
  const [busy, setBusy] = useState(false)
  const toggleResolved = async () => {
    setBusy(true)
    const done = await comments.setResolved(root.id, !root.resolved)
    setBusy(false)
    // Resolving closes the thread, as in Figma: it leaves the open list.
    if (done && !root.resolved) onClose?.()
  }

  return (
    <div className="builder-thread">
      <div className="builder-thread__head">
        <span className="builder-thread__status">
          {root.resolved ? `Resolved${root.resolvedByName ? ` by ${root.resolvedByName}` : ''}` : replies.length > 0 ? `${replies.length + 1} comments` : 'Comment'}
        </span>
        <button
          type="button"
          className="builder-editor__icon-button builder-editor__icon-button--small"
          aria-pressed={root.resolved}
          aria-label={root.resolved ? 'Reopen' : 'Resolve'}
          data-tooltip={root.resolved ? 'Reopen' : 'Resolve'}
          disabled={busy}
          onClick={() => void toggleResolved()}
        >
          <Icon name={root.resolved ? 'undo' : 'check'} size={14} />
        </button>
        {onClose && (
          <button type="button" className="builder-editor__icon-button builder-editor__icon-button--small" aria-label="Close" data-tooltip="Close · Esc" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <div className="builder-thread__items">
        {[root, ...replies].map((comment) => (
          <CommentItem key={comment.id} comment={comment} own={comment.authorKey === me} comments={comments} isRoot={comment === root} />
        ))}
      </div>
      <div className="builder-thread__reply">
        <CommentInput
          key={root.id}
          placeholder="Reply"
          submitLabel="Reply"
          focusOnMount={Boolean(onClose)}
          onSubmit={(body) => comments.reply(root.id, body)}
        />
      </div>
    </div>
  )
}

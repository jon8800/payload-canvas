// Live editing: wire types shared by the server channel, the MCP tools and the editor hook.
// Pure TypeScript: no React, no Payload runtime imports. See docs/architecture.md section 12.

import type { Layout, Operation } from '../core/types'

/** Who made a change. `label` is what the editor shows, e.g. "Claude Desktop" or "Ana". */
export type LiveActor = { type: 'user' | 'ai'; id: string; label: string }

/**
 * @deprecated The single-editor live channel. The server no longer sends it; it is replaced by
 * the multiplayer events below. Kept until the editor switches over.
 */
export type LiveOperationsEvent = {
  type: 'operations'
  /** Event id, `${epoch}:${seq}`. Also the SSE `id:` line, so a reconnect can ask for missed events. */
  eventId: string
  /**
   * The applied operations. A `duplicate` is sent as the `insert` of the finished copy, so every
   * client gets the same child ids.
   */
  ops: Operation[]
  actor: LiveActor
  /** Set when the change came from an editor that sent `clientId`. That editor skips the echo. */
  clientId?: string
  /** `updatedAt` of the draft the operations were applied to. */
  baseVersion?: string
  /** `updatedAt` of the saved draft. */
  version?: string
  /** ISO time of the save. */
  at: string
}

/** One connected viewer. Names only: no ids or emails leave the server. */
export type PresenceMember = { name: string; type: 'user' | 'ai'; self?: boolean }

export type LivePresenceEvent = { type: 'presence'; members: PresenceMember[] }

/** First event on every connection. `eventId` is the newest event the server knows. */
export type LiveReadyEvent = { type: 'ready'; eventId: string | null; members: PresenceMember[] }

/** The server cannot replay the events this client missed. The editor should reload the draft. */
export type LiveResyncEvent = { type: 'resync'; reason: string }

export type LiveEvent = LiveOperationsEvent | LivePresenceEvent | LiveReadyEvent | LiveResyncEvent

/** Body of `POST {liveEndpoint}/:collection/:id/operations`. */
export type LiveOperationsRequest = { ops: Operation[]; clientId?: string }

/** Response of `POST {liveEndpoint}/:collection/:id/operations`. */
export type LiveOperationsResponse =
  | { ok: true; layout: Layout; ops: Operation[]; seq?: number; version?: string; warnings?: LiveError[] }
  | { ok: false; error: string; errors?: LiveError[] }

/** A layout problem, as returned to clients. Same shape as core `LayoutError`. */
export type LiveError = { blockId?: string; path: string; message: string; code: string }

// ---------------------------------------------------------------------------
// Multiplayer (server-authoritative document sessions). See docs/architecture.md section 12.
//
// The server keeps one in-memory session per open document: the layout at sequence `seq`.
// Editors apply their own operations at once (optimistic), send them in order, and rebase
// unconfirmed operations on top of remote ones. The session persists the draft (debounced);
// while a session is open, the save hook takes the layout from the session, not from the form.
// ---------------------------------------------------------------------------

/** One person (or AI) connected to a document, with a stable per-tab id and a display color. */
export type CollaboratorInfo = {
  clientId: string
  name: string
  type: 'user' | 'ai'
  /** CSS color, stable per user (hashed from the user id). */
  color: string
}

/**
 * Where a collaborator's pointer is, relative to a block so it maps across different canvas
 * widths: `x`/`y` in 0..1 of the block's rect. `blockId: null` means over the page background
 * (x/y relative to the iframe document).
 */
export type CollaboratorCursor = { blockId: string | null; x: number; y: number }

/** Live state of one collaborator, relayed by the server, never persisted. */
export type Awareness = {
  selectedId: string | null
  hoveredId: string | null
  cursor: CollaboratorCursor | null
  /** Canvas width in px, so others can see which breakpoint someone is editing. */
  canvasWidth: number | null
}

/** Sent to every editor of a document when the session applies operations. */
export type LiveCommitEvent = {
  type: 'commit'
  /** Session sequence number after these operations. Strictly increasing by 1 per commit. */
  seq: number
  ops: Operation[]
  actor: LiveActor
  /** The editor that sent the operations (its own commit doubles as the acknowledgement). */
  clientId?: string
  /** The sender's batch id, echoed so the sender can match the acknowledgement. */
  batchId?: string
  at: string
}

/** Full session state: the first event on connect, and the answer to a resync. */
export type LiveSessionEvent = {
  type: 'session'
  /**
   * Id of this in-memory session. A new id means the server restarted the session (the old seqs
   * no longer apply). The SSE id of session and commit frames is `${sessionId}:${seq}`.
   */
  sessionId?: string
  seq: number
  layout: Layout
  collaborators: Array<CollaboratorInfo & { awareness: Awareness | null }>
  /** This connection's own clientId as the server knows it. */
  self: CollaboratorInfo
  /** The highest seq the saved draft contains. Commits above it are not saved yet. */
  savedSeq?: number
  /**
   * The layout was replaced as a whole (Revert to published). Editors drop their unsent changes
   * and their undo history instead of rebasing them on the new layout.
   */
  reset?: boolean
}

/** Who is connected changed (join/leave). */
export type LiveCollaboratorsEvent = {
  type: 'collaborators'
  collaborators: CollaboratorInfo[]
}

/** A collaborator's awareness changed. Throttled by the sender (cursor ~20/s). */
export type LiveAwarenessEvent = {
  type: 'awareness'
  clientId: string
  awareness: Awareness
}

/**
 * The document was saved with the session layout up to `seq`: by the session itself (about a
 * second after the last commit) or by another save while the session was open (Publish, the
 * settings drawer, the REST API).
 */
export type LiveSavedEvent = {
  type: 'saved'
  seq: number
  /** ISO time of the save. */
  at: string
  /** `updatedAt` of the saved document. */
  updatedAt?: string
  /** `_status` of the saved document (collections with drafts). */
  status?: string
}

/**
 * The session could not save the draft. The commits stay in the session (nothing is lost while the
 * server runs). With `retrying`, the session tries again with backoff (2 s, 5 s, 15 s, then every
 * 30 s); a `saved` event follows when a save works. Without it (no permission), the next commit or
 * `POST …/flush` tries again. A new connection gets this event right after its first events.
 */
export type LiveSaveFailedEvent = {
  type: 'saveFailed'
  /** ISO time of the failed save. */
  at: string
  /** The reason, e.g. a validation message. */
  message: string
  retrying: boolean
}

/** Someone published, unpublished or reverted the document to its published version. */
export type LivePublishedEvent = {
  type: 'published'
  action: PublishAction
  /** `_status` of the document after the action. */
  status: 'draft' | 'published'
  at: string
  updatedAt?: string
  actor: LiveActor
}

export type MultiplayerEvent =
  | LiveCommitEvent
  | LiveSessionEvent
  | LiveCollaboratorsEvent
  | LiveAwarenessEvent
  | LiveSavedEvent
  | LiveSaveFailedEvent
  | LivePublishedEvent

/** Response of `POST {liveEndpoint}/:collection/:id/flush`: save the session's unsaved commits now. */
export type LiveFlushResponse = { ok: true } | { ok: false; error: string }

/** `POST {liveEndpoint}/:collection/:id/commit` — one batch of local operations, sent in order. */
export type LiveCommitRequest = {
  clientId: string
  batchId: string
  /** The session seq the client had applied when it made these operations. */
  baseSeq: number
  ops: Operation[]
}

/**
 * Response to a commit. `ok: false` means the batch was rejected as a whole (an operation no
 * longer applies, e.g. its block was deleted by someone else); the client drops it and rebases.
 */
export type LiveCommitResponse =
  | { ok: true; seq: number }
  | { ok: false; error: string; seq: number }

/** `POST {liveEndpoint}/:collection/:id/awareness` */
export type LiveAwarenessRequest = { clientId: string; awareness: Awareness }

// ---------------------------------------------------------------------------
// Document header and publishing (the full-screen builder view).
//
//   GET  {liveEndpoint}/:collection/:id/meta       -> BuilderDocMeta
//   POST {liveEndpoint}/:collection/:id/publish    -> PublishResponse
//   POST {liveEndpoint}/:collection/:id/unpublish  -> PublishResponse
//   POST {liveEndpoint}/:collection/:id/revert     -> PublishResponse
// ---------------------------------------------------------------------------

/** `publish`: publish the draft. `unpublish`: back to draft. `revert`: drop the draft changes. */
export type PublishAction = 'publish' | 'unpublish' | 'revert'

/**
 * Status of a document in a collection with drafts, as Payload's own header shows it:
 * `changed` means published, with a newer draft.
 */
export type DocStatus = 'draft' | 'published' | 'changed'

/** What the builder's top bar shows about the open document. */
export type BuilderDocMeta = {
  collection: string
  id: string
  /** The document title (`admin.useAsTitle`), else the id. */
  title: string
  /** The field that holds the title. Null when the collection has no `useAsTitle`. */
  titleField: string | null
  /** The collection has drafts (and so Publish). */
  drafts: boolean
  /** Null when the collection has no drafts. */
  status: DocStatus | null
  createdAt: string | null
  /** Last change of the newest draft. */
  updatedAt: string | null
  /** When the published version was saved. Null when nothing is published. */
  publishedAt: string | null
  /** Number of versions. Null when versions are off or not readable. */
  versions: number | null
  /** The public page, from the collection's `url` option. */
  url: string | null
  /** The draft preview, from the collection's `admin.livePreview.url` or `admin.preview`. */
  previewUrl: string | null
  /** The user may change the document. */
  canUpdate: boolean
  /** Template documents: the collection the template is for and its preview document. */
  template: { target: string | null; preview: unknown } | null
}

export type PublishResponse = { ok: true; meta: BuilderDocMeta } | { ok: false; error: string }

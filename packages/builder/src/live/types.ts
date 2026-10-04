// Live editing: wire types shared by the server channel, the MCP tools and the editor hook.
// Pure TypeScript: no React, no Payload runtime imports. See docs/architecture.md section 12.

import type { Layout, Operation } from '../core/types'

/** Who made a change. `label` is what the editor shows, e.g. "Claude Desktop" or "Ana". */
export type LiveActor = { type: 'user' | 'ai'; id: string; label: string }

/** Operations applied to a document's draft. Sent to every open editor of that document. */
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
  | { ok: true; layout: Layout; ops: Operation[]; version?: string; warnings?: LiveError[] }
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
  seq: number
  layout: Layout
  collaborators: Array<CollaboratorInfo & { awareness: Awareness | null }>
  /** This connection's own clientId as the server knows it. */
  self: CollaboratorInfo
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

export type MultiplayerEvent = LiveCommitEvent | LiveSessionEvent | LiveCollaboratorsEvent | LiveAwarenessEvent

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

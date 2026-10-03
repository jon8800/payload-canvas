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

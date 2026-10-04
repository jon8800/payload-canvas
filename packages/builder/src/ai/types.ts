// AI assistant: contract between the chat endpoint (server) and the editor's Assistant panel.
// The assistant edits the layout the user has open (unsaved edits included). It never saves:
// the server streams operations back, the editor applies them as one undo step per turn, and
// Payload's normal autosave persists them. External agents keep using MCP (src/mcp).

import type { Layout, Operation, TemplateContext } from '../core/types'

/** Plugin option `ai`. Presence enables the assistant. */
export type AiOptions = {
  /** Claude model id. Default "claude-opus-5-5". */
  model?: string
  /** Effort for the agent loop. Default "medium". */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** API key. Default: the Anthropic SDK's own resolution (ANTHROPIC_API_KEY, ant auth profile, …). */
  apiKey?: string
  /** Extra instructions appended to the system prompt (brand voice, rules). */
  instructions?: string
  /** Maximum tool-loop iterations per user message. Default 12. */
  maxSteps?: number
  /** Upload collection the assistant may pick images from. Default "media". */
  mediaCollection?: string
}

/** Set on BuilderClientConfig.ai when the assistant is enabled. */
export type AiClientConfig = {
  /** Full API path prefix, e.g. "/api/builder/ai". The chat endpoint is `${endpoint}/chat`. */
  endpoint: string
  model: string
}

/**
 * One turn of the conversation as the client stores it. `content` is the exact Anthropic message
 * content (text, thinking, tool_use, tool_result blocks) so history can be replayed append-only.
 * The client keeps the history per document (localStorage) and sends it back on every request.
 */
export type AiMessage = { role: 'user' | 'assistant'; content: unknown }

/** POST `${endpoint}/chat` body. */
export type AiChatRequest = {
  collection: string
  /** Document id (for access checks and context). */
  id: string | number
  /** Conversation so far, ending with the new user message. */
  messages: AiMessage[]
  /** The layout as it is in the editor right now (unsaved edits included). */
  layout: Layout
  /** The selected block, so "make this bigger" has a target. */
  selectedId?: string | null
  /** Template mode: the sample document, so the assistant can bind and see real values. */
  context?: TemplateContext | null
  /** Canvas width in px, so the assistant knows which breakpoint the user is looking at. */
  canvasWidth?: number | null
}

/**
 * Server-Sent Events from the chat endpoint, in order. `event:` is the type, `data:` the JSON.
 * - text: streamed assistant text (append to the current bubble)
 * - tool: a tool call started (`status: 'running'`) or finished (`'done' | 'error'`), with a short
 *   human summary ("Inserted Hero section", "Updated 3 blocks")
 * - operations: operations to apply to the editor layout now (already validated against the
 *   server's working copy). Apply in order; group all operations of one `turnId` into one undo step.
 * - message: the complete assistant (and tool_result user) messages to append to the history
 * - done: the turn finished; `stopReason` from the API
 * - error: a fatal error (missing API key, API error, access denied); `code` for the UI hint
 */
export type AiStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; callId: string; name: string; status: 'running' | 'done' | 'error'; summary: string }
  | { type: 'operations'; turnId: string; ops: Operation[] }
  | { type: 'message'; message: AiMessage }
  | { type: 'done'; turnId: string; stopReason: string | null }
  | { type: 'error'; code: 'no_api_key' | 'forbidden' | 'api_error' | 'invalid_request' | 'aborted'; message: string }

// AI assistant: contract between the chat endpoint (server) and the editor's Assistant panel, and
// the AiAdapter interface that connects the assistant to a model API.
// The assistant edits the layout the user has open (unsaved edits included). It never saves:
// the server streams operations back, the editor applies them as one undo step per turn, and
// Payload's normal autosave persists them. External agents keep using MCP (src/mcp).

import type { Layout, Operation, TemplateContext } from '../core/types'

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** How hard the model thinks. Adapters map it to their API, or ignore it. */
export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** One part of the system prompt. `cache: true` marks a stable prefix the adapter may cache. */
export type AiSystemPart = { text: string; cache?: boolean }

/** A tool the model may call. */
export type AiToolDefinition = {
  name: string
  description: string
  /** JSON Schema of the input object. */
  inputSchema: Record<string, unknown>
  /**
   * The same input as a simpler JSON Schema (one flat object instead of a union). Set only where
   * it differs. Smaller models handle it better; the tool accepts both shapes.
   */
  simpleInputSchema?: Record<string, unknown>
  /** All properties of `inputSchema` are fixed (no free-form objects). APIs with strict tool schemas may use it. */
  strict?: boolean
}

/**
 * The content blocks of stored messages. Every adapter reads and writes these three. An adapter
 * may add its own block types (Anthropic "thinking", OpenAI-format "reasoning") and must skip the
 * types it does not know.
 */
export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | ({ type: string } & Record<string, unknown>)

/** Why a model call ended. */
export type AiStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn'

/** One model call, as the agent loop asks for it. */
export type AiModelRequest = {
  /** The system prompt. The same text on every call, so prompt caching hits. */
  system: AiSystemPart[]
  /** The conversation so far (oldest first). `content` is a string or a list of AiContentBlock. */
  messages: AiMessage[]
  tools: AiToolDefinition[]
  /** The plugin option `ai.effort`. Undefined: the adapter's default. */
  effort?: AiEffort
  /** Aborts the request (Stop button, closed tab). */
  signal?: AbortSignal
}

/**
 * What an adapter yields while one model call streams, in order:
 * - text: assistant text as it arrives (a delta).
 * - toolStart: a tool call began (optional; the panel shows a running chip).
 * - toolCall: one complete tool call. `error` when the arguments could not be read: the tool is
 *   not run and the model gets the error.
 * - usage: token usage of this call (the last one counts).
 * - done: the call finished. `content` is the assistant message to store and send back later
 *   (text, tool_use and the adapter's own blocks). `refusal` when the model declined.
 * - error: the call failed. `message` is shown to the editor. `auth` shows the setup card;
 *   `invalid_output` makes the loop call the model again (up to two times).
 */
export type AiModelEvent =
  | { type: 'text'; text: string }
  | { type: 'toolStart'; id: string; name: string }
  | { type: 'toolCall'; id: string; name: string; input: unknown; error?: string }
  | { type: 'usage'; usage: AiUsage }
  | { type: 'done'; stopReason: AiStopReason; content: AiContentBlock[]; refusal?: { explanation: string | null } }
  | { type: 'error'; code: 'auth' | 'aborted' | 'api_error' | 'invalid_output'; message: string }

/**
 * Connects the assistant to a model API. Create one with a built-in factory
 * (`openRouterAdapter`, `anthropicAdapter`, …) or write your own. See the README, "AI adapters".
 */
export type AiAdapter = {
  /** Short id, e.g. "openrouter". Part of the chat identity: changing it starts a new chat. */
  name: string
  /** Shown in the panel, e.g. "OpenRouter". */
  label: string
  /** The model id in the API's naming, e.g. "openai/gpt-6-luna". */
  model: string
  /** False when the adapter cannot work, for example without an API key. The panel shows the setup card. */
  ready: boolean
  /** One sentence for the developer when `ready` is false, e.g. "No OpenRouter API key. Set OPENROUTER_API_KEY …". */
  setupProblem?: string | null
  /** The env var that holds the key, for the setup card. */
  keyEnv?: string | null
  /** Where to create a key, for the setup card. */
  keyUrl?: string | null
  /** Streams one model call. Must not throw for API errors: yield an `error` event instead. */
  stream(request: AiModelRequest): AsyncIterable<AiModelEvent>
}

// ---------------------------------------------------------------------------
// Plugin option and client config
// ---------------------------------------------------------------------------

/** Plugin option `ai`. Presence enables the assistant panel. */
export type AiOptions = {
  /**
   * The model API, e.g. `openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY })` from
   * `@payload-toolkit/builder/ai/openrouter`. Without it the panel shows the setup card.
   */
  adapter?: AiAdapter | null
  /** Effort for the agent loop. Default: the adapter's default (Anthropic "medium"). */
  effort?: AiEffort
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
  /** `AiAdapter.name`, or "none" without an adapter. */
  adapter: string
  /** `AiAdapter.label`, e.g. "OpenRouter". */
  label: string
  model: string
  /** False when the adapter cannot work (no adapter, missing key). The panel shows the setup card. */
  ready: boolean
  /** One readable sentence for the developer when `ready` is false. */
  setupProblem: string | null
  /** The env var for the key, for the setup card. */
  keyEnv: string | null
  /** Where to create a key, for the setup card. */
  keyUrl: string | null
}

/** Token usage of one turn (all model calls). `cost` in USD when the provider reports it (OpenRouter). */
export type AiUsage = { inputTokens: number; outputTokens: number; cachedTokens?: number; cost?: number }

/**
 * One turn of the conversation as the client stores it. `content` is a string or a list of
 * content blocks (AiContentBlock). The client keeps the history per document (localStorage) and
 * sends it back on every request, append-only.
 */
export type AiMessage = {
  role: 'user' | 'assistant'
  content: unknown
  /**
   * Set by the server on user messages that are not chat bubbles: `context` (the editor state the
   * server added to the user's message) and `tool_results`. Store and send them back like any
   * message; do not render them. The server never sends this field to the API.
   */
  kind?: 'context' | 'tool_results'
  /**
   * `${adapter}:${model}` of the server that wrote this message. History from another adapter or
   * model cannot be replayed: the server rejects it and the panel starts a new chat.
   */
  provider?: string
}

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
  /**
   * Localized layouts: the locale the editor shows. The assistant reads that locale's values, and
   * its prop updates write that locale. Default: the default locale.
   */
  locale?: string | null
}

/**
 * Server-Sent Events from the chat endpoint, in order. `event:` is the type, `data:` the whole
 * event object as JSON (including `type`). Errors before the stream starts (401, 400, 403, 404)
 * use the same format: the body is one `error` event.
 * - text: streamed assistant text (append to the current bubble)
 * - tool: a tool call started (`status: 'running'`) or finished (`'done' | 'error'`), with a short
 *   human summary ("Inserted Hero section", "Updated 3 blocks")
 * - operations: operations to apply to the editor layout now (already validated against the
 *   server's working copy). Apply in order; group all operations of one `turnId` into one undo step.
 * - message: the complete assistant (and tool_result user) messages to append to the history
 * - done: the turn finished; `stopReason` ("end_turn", "tool_use", "max_tokens", "refusal",
 *   "max_steps"), `usage` summed over the turn's model calls when known
 * - error: a fatal error (missing API key, API error, access denied); `code` for the UI hint
 */
export type AiStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; callId: string; name: string; status: 'running' | 'done' | 'error'; summary: string }
  | { type: 'operations'; turnId: string; ops: Operation[] }
  | { type: 'message'; message: AiMessage }
  | { type: 'done'; turnId: string; stopReason: string | null; usage?: AiUsage }
  | { type: 'error'; code: 'no_api_key' | 'forbidden' | 'api_error' | 'invalid_request' | 'aborted'; message: string }

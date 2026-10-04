// AI assistant: contract between the chat endpoint (server) and the editor's Assistant panel.
// The assistant edits the layout the user has open (unsaved edits included). It never saves:
// the server streams operations back, the editor applies them as one undo step per turn, and
// Payload's normal autosave persists them. External agents keep using MCP (src/mcp).

import type { Layout, Operation, TemplateContext } from '../core/types'

/** Plugin option `ai`. Presence enables the assistant. */
/**
 * Which API the assistant talks to.
 * - "anthropic": the Anthropic Messages API (official SDK). Default.
 * - "openai-compatible": any OpenAI-compatible Chat Completions endpoint, called with fetch:
 *   OpenRouter, Cloudflare AI Gateway (compat endpoint), OpenAI, Groq, Ollama, LM Studio, …
 *   Presets fill `baseURL` and the key env var: "openrouter", "cloudflare".
 */
export type AiProvider =
  | { type: 'anthropic' }
  | {
      type: 'openai-compatible'
      /** e.g. "https://openrouter.ai/api/v1". */
      baseURL: string
      /** Default: read from `apiKeyEnv`. */
      apiKey?: string
      /** Env var with the key. Default "OPENAI_API_KEY". */
      apiKeyEnv?: string
      /** Extra headers (e.g. OpenRouter's HTTP-Referer / X-Title, Cloudflare's cf-aig-authorization). */
      headers?: Record<string, string>
    }
  | { type: 'openrouter'; apiKey?: string; apiKeyEnv?: string }
  | {
      type: 'cloudflare'
      /** Cloudflare account id and AI Gateway id. */
      accountId: string
      gatewayId: string
      /** Provider key (e.g. an OpenAI/Anthropic key) unless the gateway stores it (BYOK). */
      apiKey?: string
      apiKeyEnv?: string
      /** Gateway token for authenticated gateways (`cf-aig-authorization`). */
      gatewayToken?: string
      gatewayTokenEnv?: string
    }

export type AiOptions = {
  /** Default { type: 'anthropic' }. */
  provider?: AiProvider
  /**
   * Model id in the provider's naming, e.g. "claude-opus-5-5" (anthropic),
   * "anthropic/claude-haiku-4.5" (openrouter). Default "claude-opus-5-5" for anthropic; required
   * for other providers.
   */
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
  /** Output limit per model call, thinking included. Default 32000. */
  maxTokens?: number
  /**
   * Server-side refusal fallback (`fallbacks: "default"`): when a safety classifier declines a
   * request, the API retries it on Anthropic's recommended fallback model. Default: on for
   * "claude-opus-5-5", off for other models.
   */
  fallbacks?: boolean
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
export type AiMessage = {
  role: 'user' | 'assistant'
  content: unknown
  /**
   * Set by the server on user messages that are not chat bubbles: `context` (the editor state the
   * server added to the user's message) and `tool_results`. Store and send them back like any
   * message; do not render them. The server never sends this field to the API.
   */
  kind?: 'context' | 'tool_results'
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

// AI assistant: contract between the chat endpoint (server) and the editor's Assistant panel.
// The assistant edits the layout the user has open (unsaved edits included). It never saves:
// the server streams operations back, the editor applies them as one undo step per turn, and
// Payload's normal autosave persists them. External agents keep using MCP (src/mcp).

import type { Layout, Operation, TemplateContext } from '../core/types'

/**
 * Which API the assistant talks to.
 * - "anthropic": the Anthropic Messages API (official SDK, optional peer dependency).
 * - "openai-compatible": any OpenAI-compatible Chat Completions endpoint, called with fetch:
 *   OpenAI, Groq, Together, Ollama, LM Studio, vLLM, …
 * - "openrouter", "cloudflare": presets of "openai-compatible" that fill the URL and headers.
 * Without `provider`, the plugin reads the environment: BUILDER_AI_PROVIDER, else "openrouter"
 * when only OPENROUTER_API_KEY is set, else "anthropic". See docs/ai/providers.md.
 */
export type AiProvider =
  | { type: 'anthropic' }
  | {
      type: 'openai-compatible'
      /** e.g. "https://openrouter.ai/api/v1". */
      baseURL: string
      /** Default: read from `apiKeyEnv`. */
      apiKey?: string
      /** Env var with the key. Default: BUILDER_AI_API_KEY, then OPENAI_API_KEY. No key: no Authorization header (Ollama, LM Studio). */
      apiKeyEnv?: string
      /** Extra headers (e.g. OpenRouter's HTTP-Referer / X-Title, Cloudflare's cf-aig-authorization). */
      headers?: Record<string, string>
    }
  /** https://openrouter.ai/api/v1. Key env default OPENROUTER_API_KEY. */
  | { type: 'openrouter'; apiKey?: string; apiKeyEnv?: string }
  | {
      type: 'cloudflare'
      /** Cloudflare account id and AI Gateway id. */
      accountId: string
      gatewayId: string
      /**
       * Provider key (e.g. an OpenAI key), sent as `Authorization`. Leave it out when the gateway
       * stores the keys (BYOK) or uses unified billing. Default env: BUILDER_AI_API_KEY.
       */
      apiKey?: string
      apiKeyEnv?: string
      /** Gateway token for authenticated gateways (`cf-aig-authorization`). Default env: CF_AIG_TOKEN. */
      gatewayToken?: string
      gatewayTokenEnv?: string
    }

/** Plugin option `ai`. Presence enables the assistant. */
export type AiOptions = {
  /** Default: from the environment (see AiProvider). */
  provider?: AiProvider
  /**
   * Model id in the provider's naming, e.g. "claude-opus-5-5" (anthropic),
   * "openai/gpt-6-luna" (openrouter), "openai/gpt-5.2" (cloudflare). Default: BUILDER_AI_MODEL,
   * else "claude-opus-5-5" (anthropic) or "openai/gpt-6-luna" (openrouter). Required for
   * "cloudflare" and "openai-compatible".
   */
  model?: string
  /**
   * Effort for the agent loop. Anthropic: default "medium". OpenRouter: sent as
   * `reasoning.effort` only when set. Other OpenAI-compatible APIs: ignored.
   */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Anthropic API key. Default: the Anthropic SDK's own resolution (ANTHROPIC_API_KEY, ant auth profile, …). */
  apiKey?: string
  /** Extra instructions appended to the system prompt (brand voice, rules). */
  instructions?: string
  /** Maximum tool-loop iterations per user message. Default 12. */
  maxSteps?: number
  /** Upload collection the assistant may pick images from. Default "media". */
  mediaCollection?: string
  /** Output limit per model call, thinking included. Default 32000 (anthropic); not sent to OpenAI-compatible APIs unless set. */
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
  /** Provider type, e.g. "openrouter". Optional only for older configs; treat a missing value as "anthropic". */
  provider?: AiProvider['type']
  /** Display name, e.g. "OpenRouter", "Cloudflare AI Gateway", "api.openai.com". */
  providerLabel?: string
  /** The env var the server reads the key from, for the setup hint. Null when no key is needed. */
  keyEnv?: string | null
  /**
   * False when the server found no credentials or config at startup, so the panel can show the
   * setup card before the first message. Anthropic `ant auth login` credentials cannot be seen,
   * so keep sending possible even when false.
   */
  ready?: boolean
  /** One readable sentence for editors when `ready` is false. */
  setupProblem?: string | null
}

/** Token usage of one turn (all model calls). `cost` in USD when the provider reports it (OpenRouter). */
export type AiUsage = { inputTokens: number; outputTokens: number; cachedTokens?: number; cost?: number }

/**
 * One turn of the conversation as the client stores it. `content` is a string or a list of
 * content blocks. Both adapters use the block types "text", "tool_use" and "tool_result", so the
 * panel can render any history. Provider-specific blocks ride along: Anthropic "thinking" /
 * "fallback", OpenAI-compatible "reasoning". The client keeps the history per document
 * (localStorage) and sends it back on every request, append-only.
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
   * `${provider}:${model}` of the server that wrote this message. History from another provider
   * or model cannot be replayed: the server rejects it and the panel starts a new chat.
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
 * - done: the turn finished; `stopReason` in Anthropic terms ("end_turn", "tool_use", "max_tokens",
 *   "refusal", "max_steps"), `usage` summed over the turn's model calls when known
 * - error: a fatal error (missing API key, API error, access denied); `code` for the UI hint
 */
export type AiStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; callId: string; name: string; status: 'running' | 'done' | 'error'; summary: string }
  | { type: 'operations'; turnId: string; ops: Operation[] }
  | { type: 'message'; message: AiMessage }
  | { type: 'done'; turnId: string; stopReason: string | null; usage?: AiUsage }
  | { type: 'error'; code: 'no_api_key' | 'forbidden' | 'api_error' | 'invalid_request' | 'aborted'; message: string }

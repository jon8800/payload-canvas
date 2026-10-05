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
// Image adapters
// ---------------------------------------------------------------------------

/** Width:height of a generated image. Adapters map a ratio their model lacks to the closest one. */
export type AiImageAspectRatio = '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16' | '21:9'

/** One image generation call. */
export type AiImageRequest = {
  /** What to draw. The caller adds no style words: put style in the prompt. */
  prompt: string
  aspectRatio: AiImageAspectRatio
  /** How many images. The plugin asks for 1. Adapters may return fewer. */
  n: number
  signal?: AbortSignal
}

/** One generated image: the file bytes. */
export type AiGeneratedImage = { data: Uint8Array; mimeType: string; width?: number; height?: number }

/** Cost and tokens of one image call, when the provider reports them. `cost` in USD. */
export type AiImageUsage = { cost?: number; inputTokens?: number; outputTokens?: number }

export type AiImageResult = {
  images: AiGeneratedImage[]
  /** The prompt the provider actually used, when it rewrote it (OpenAI, some OpenRouter models). */
  revisedPrompt?: string | null
  usage?: AiImageUsage
}

/**
 * Connects image generation to an image API. Separate from the chat `AiAdapter`: chat models do
 * not return images through the chat API unless they are image-output models, and MCP clients
 * (Claude Code, Codex) bring their own chat model. Create one with a built-in factory
 * (`openRouterImageAdapter`, `openAIImageAdapter`, `cloudflareWorkersAIImageAdapter`,
 * `fakeImageAdapter`) or write your own. See docs/ai/images.md.
 */
export type AiImageAdapter = {
  /** Short id, e.g. "openrouter". */
  name: string
  /** Shown in the editor, e.g. "OpenRouter". */
  label: string
  /** The model id in the API's naming. */
  model: string
  /** False when the adapter cannot work, for example without an API key. */
  ready: boolean
  /** One sentence for the developer when `ready` is false. */
  setupProblem?: string | null
  /** The env var that holds the key. */
  keyEnv?: string | null
  /** Where to create a key. */
  keyUrl?: string | null
  /** Generates images. Throws `AiImageError` (or any Error) with a readable message on failure. */
  generate(request: AiImageRequest): Promise<AiImageResult>
}

/** Plugin option `ai.imageLimits`: a guard against runaway cost. */
export type AiImageLimits = {
  /** Most images one assistant reply may generate. Default 3. */
  perRequest?: number
  /** Most images one user may generate per hour (assistant, inspector and MCP together). Default 20. */
  perHour?: number
}

/** Set on AiClientConfig.images when an image adapter is ready. */
export type AiImagesClientConfig = {
  /** Full API path of the generate endpoint, e.g. "/api/builder/ai/image". */
  endpoint: string
  label: string
  model: string
  /** The upload collection generated images go to by default. */
  collection: string
  aspectRatios: AiImageAspectRatio[]
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
  /** Upload collection the assistant may pick images from, and where generated images go. Default "media". */
  mediaCollection?: string
  /**
   * Image generation, for the assistant, the inspector's Generate action and the MCP
   * `generateImage` tool, e.g. `openRouterImageAdapter({ apiKey })` from
   * `@payload-toolkit/builder/ai/images/openrouter`. Independent of `adapter`. See docs/ai/images.md.
   */
  images?: AiImageAdapter | null
  /** Caps for image generation. Default 3 per assistant reply, 20 per user per hour. */
  imageLimits?: AiImageLimits
  /**
   * A text, textarea or JSON field of the media collection that gets a note on generated images
   * (adapter, model, prompt, date). Used only when the collection has the field. Default
   * "generatedBy". `false` turns it off.
   */
  imageMarkerField?: string | false
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
  /** Image generation. Null when no image adapter is ready: the editor hides the Generate action. */
  images: AiImagesClientConfig | null
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

/** The state of one tool call in the panel. `cancelled`: it started streaming but never ran. */
export type AiToolStatus = 'running' | 'done' | 'error' | 'cancelled'

/** An image a tool made (generateImage), for the chip's thumbnail. */
export type AiToolImage = { id: string | number; url: string; alt: string | null; width: number | null; height: number | null }

/**
 * Server-Sent Events from the chat endpoint, in order. `event:` is the type, `data:` the whole
 * event object as JSON (including `type`). Errors before the stream starts (401, 400, 403, 404)
 * use the same format: the body is one `error` event.
 * - text: streamed assistant text (append to the current bubble)
 * - tool: a tool call started (`status: 'running'`) or finished (`'done' | 'error'`), with a short
 *   human summary ("Inserted Hero section", "Updated 3 blocks"). `'cancelled'`: a started call
 *   that never ran (the model dropped it, a refusal, Stop, an error). Every `running` call gets
 *   one final status before `done` or `error`.
 * - operations: operations to apply to the editor layout now (already validated against the
 *   server's working copy). Apply in order; group all operations of one `turnId` into one undo step.
 * - message: the complete assistant (and tool_result user) messages to append to the history
 * - done: the turn finished; `stopReason` ("end_turn", "tool_use", "max_tokens", "refusal",
 *   "max_steps"), `usage` summed over the turn's model calls when known
 * - error: a fatal error (missing API key, API error, access denied); `code` for the UI hint
 */
export type AiStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; callId: string; name: string; status: AiToolStatus; summary: string; image?: AiToolImage }
  | { type: 'operations'; turnId: string; ops: Operation[]; /** The tool call that made them. */ callId?: string }
  | { type: 'message'; message: AiMessage }
  | { type: 'done'; turnId: string; stopReason: string | null; usage?: AiUsage }
  | { type: 'error'; code: 'no_api_key' | 'forbidden' | 'api_error' | 'invalid_request' | 'aborted'; message: string }

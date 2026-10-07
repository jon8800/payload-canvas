// The Anthropic Messages API as an AiAdapter. Needs the `@anthropic-ai/sdk` package (an optional
// peer dependency: only this entry point loads it).
//
//   import { anthropicAdapter } from 'payload-canvas/ai/anthropic'
//   ai: { adapter: anthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }) }
//
// History is append-only. The client stores the assistant content unchanged (thinking blocks
// included) and sends it back, so earlier thinking blocks stay valid and the prompt cache hits.

import Anthropic, { APIError, APIUserAbortError, AuthenticationError, RateLimitError } from '@anthropic-ai/sdk'

import type { AiAdapter, AiContentBlock, AiEffort, AiMessage, AiModelEvent, AiStopReason, AiToolDefinition, AiUsage } from '../types'

type MessageParam = Anthropic.Beta.BetaMessageParam
type StreamParams = Anthropic.Beta.Messages.MessageCreateParamsStreaming
type StreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent
type Message = Anthropic.Beta.BetaMessage
type ContentBlock = Anthropic.Beta.BetaContentBlock
type Tool = Anthropic.Beta.BetaTool
type Effort = NonNullable<Anthropic.Beta.BetaOutputConfig['effort']>

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5'
const DEFAULT_MAX_TOKENS = 32_000
const DEFAULT_EFFORT: Effort = 'medium'
const KEY_URL = 'https://console.anthropic.com/settings/keys'

export const NO_KEY_MESSAGE =
  'No Anthropic credentials found. Set ANTHROPIC_API_KEY in the server environment (for example in .env) and restart the server, or run `ant auth login` on the server.'

/** The part of a message stream the adapter uses. `client.beta.messages.stream()` returns one. */
export type AnthropicStream = AsyncIterable<StreamEvent> & { finalMessage(): Promise<Message>; abort(): void }

/** The part of the Anthropic client the adapter uses. Tests pass a fake. */
export type AnthropicClient = {
  beta: { messages: { stream(params: Omit<StreamParams, 'stream'>, options?: { signal?: AbortSignal }): AnthropicStream } }
  apiKey?: string | null
  authToken?: string | null
}

export type AnthropicAdapterOptions = {
  /** API key. Default: the SDK's own lookup (ANTHROPIC_API_KEY, `ant auth login` profile, …). */
  apiKey?: string | null
  /** Default "claude-opus-5-5". */
  model?: string
  /** Output limit per model call, thinking included. Default 32000. */
  maxTokens?: number
  /**
   * Server-side refusal fallback (`fallbacks: "default"`): when a safety classifier declines a
   * request, the API retries it on Anthropic's recommended fallback model. Default: on for
   * "claude-opus-5-5", off for other models.
   */
  fallbacks?: boolean
  /** Tests: a ready client (or a fake). */
  client?: AnthropicClient
}

/** Beta features the requests use. */
export const AI_BETAS = {
  /** `fallbacks: "default"`: a classifier refusal is retried on Anthropic's recommended model. */
  fallback: 'server-side-fallback-2026-07-01',
  /** `thinking.block_binding`: drop (not 400) thinking blocks whose earlier history changed. */
  thinkingBinding: 'thinking-binding-controls-2026-08-01',
} as const

/** The API shape of a stored message: role and content only (`kind` stays on the client). */
export function toParam(message: AiMessage): MessageParam {
  return { role: message.role, content: message.content as MessageParam['content'] }
}

/**
 * After a mid-output refusal fallback, the blocks before the last `fallback` block came from the
 * model that declined. Keep only their text (the API's echo rule): their thinking and tool calls
 * are not part of the conversation, and their tool calls must not run.
 */
export function sanitizeFallback(content: ContentBlock[]): ContentBlock[] {
  let last = -1
  content.forEach((block, i) => {
    if (block.type === 'fallback') last = i
  })
  if (last < 0) return content
  return content.filter((block, i) => i >= last || block.type === 'text' || block.type === 'fallback')
}

/** Tool definitions as Anthropic tools. Inputs stream as they are generated (applyOperations inputs can be long). */
export function anthropicTools(tools: AiToolDefinition[]): Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Tool['input_schema'],
    ...(tool.strict ? { strict: true } : {}),
    eager_input_streaming: true,
  }))
}

/** The plugin's effort levels are Anthropic's. Default "medium". */
function effortOf(effort: AiEffort | undefined): Effort {
  return effort ?? DEFAULT_EFFORT
}

export type BuildParamsArgs = { model: string; maxTokens: number; fallbacks: boolean; system: string; tools: Tool[]; effort: Effort }

export function buildParams(args: BuildParamsArgs, history: MessageParam[]): Omit<StreamParams, 'stream'> {
  return {
    model: args.model,
    max_tokens: args.maxTokens,
    // The stable prefix (tools + system) gets an explicit breakpoint; the top-level cache_control
    // caches the growing conversation as well.
    system: [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }],
    cache_control: { type: 'ephemeral' },
    tools: args.tools,
    messages: history,
    thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
    output_config: { effort: args.effort },
    betas: args.fallbacks ? [AI_BETAS.fallback, AI_BETAS.thinkingBinding] : [AI_BETAS.thinkingBinding],
    ...(args.fallbacks ? { fallbacks: 'default' as const } : {}),
  }
}

function usageOf(message: Message): AiUsage | undefined {
  const usage = message.usage as Partial<Message['usage']> | undefined
  if (!usage) return undefined
  const cached = usage.cache_read_input_tokens ?? 0
  return {
    inputTokens: (usage.input_tokens ?? 0) + cached + (usage.cache_creation_input_tokens ?? 0),
    outputTokens: usage.output_tokens ?? 0,
    cachedTokens: cached,
  }
}

function stopReasonOf(reason: Message['stop_reason']): AiStopReason {
  switch (reason) {
    case 'tool_use':
    case 'max_tokens':
    case 'refusal':
    case 'pause_turn':
      return reason
    case 'model_context_window_exceeded':
      return 'max_tokens'
    default:
      return 'end_turn'
  }
}

type ErrorEvent = Extract<AiModelEvent, { type: 'error' }>

/** The Anthropic Messages API as an AiAdapter. */
export function anthropicAdapter(options: AnthropicAdapterOptions = {}): AiAdapter {
  const model = options.model?.trim() || ANTHROPIC_DEFAULT_MODEL
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
  const fallbacks = options.fallbacks ?? model === ANTHROPIC_DEFAULT_MODEL
  const apiKey = options.apiKey?.trim() || undefined
  // `ant auth login` credentials cannot be seen here: without a key the panel says "probably".
  const seesKey = Boolean(apiKey || process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim() || options.client)
  let client: AnthropicClient | null = options.client ?? null

  /** Credentials resolve once per client: a client that had none is dropped after a failure. */
  const getClient = (): AnthropicClient => {
    client ??= (apiKey ? new Anthropic({ apiKey }) : new Anthropic()) as unknown as AnthropicClient
    return client
  }
  const hasCredentials = (c: AnthropicClient) => Boolean(c.apiKey || c.authToken || (c as { credentials?: unknown }).credentials)

  const describe = (error: unknown, streamStarted: boolean, current: AnthropicClient): ErrorEvent => {
    if (error instanceof AuthenticationError) {
      if (!options.client) client = null
      return { type: 'error', code: 'auth', message: `The Anthropic API rejected the credentials (401). ${NO_KEY_MESSAGE}` }
    }
    if (error instanceof RateLimitError) return { type: 'error', code: 'api_error', message: 'The Anthropic API rate limit was reached. Wait a moment and try again.' }
    if (error instanceof APIUserAbortError) return { type: 'error', code: 'aborted', message: 'The request was cancelled.' }
    if (error instanceof APIError) {
      const status = error.status ? ` (${error.status})` : ''
      return { type: 'error', code: 'api_error', message: `The Anthropic API returned an error${status}: ${error.message}` }
    }
    const message = error instanceof Error ? error.message : String(error)
    // Not an API error: before any stream event this is a missing credential; after events it is
    // a tool input the SDK could not parse (eager input streaming), which the loop retries.
    if (!streamStarted && !hasCredentials(current)) {
      if (!options.client) client = null
      return { type: 'error', code: 'auth', message: NO_KEY_MESSAGE }
    }
    if (streamStarted) return { type: 'error', code: 'invalid_output', message: `The model sent a tool call that could not be read (${message}).` }
    return { type: 'error', code: 'api_error', message }
  }

  return {
    name: 'anthropic',
    label: 'Anthropic',
    model,
    ready: seesKey,
    setupProblem: seesKey ? null : 'The AI assistant is probably not set up: the server has no ANTHROPIC_API_KEY. Ask your developer to add an API key.',
    keyEnv: 'ANTHROPIC_API_KEY',
    keyUrl: KEY_URL,
    async *stream(request) {
      let current: AnthropicClient
      try {
        current = getClient()
      } catch (error) {
        yield { type: 'error', code: 'auth', message: `${NO_KEY_MESSAGE} (${error instanceof Error ? error.message : String(error)})` }
        return
      }
      const params = buildParams(
        {
          model,
          maxTokens,
          fallbacks,
          system: request.system.map((part) => part.text).join('\n\n'),
          tools: anthropicTools(request.tools),
          effort: effortOf(request.effort),
        },
        request.messages.map(toParam),
      )
      let streamStarted = false
      let message: Message
      try {
        const stream = current.beta.messages.stream(params, { signal: request.signal })
        const pending: AiModelEvent[] = []
        for await (const event of stream) {
          streamStarted = true
          if (event.type === 'content_block_start') {
            const block = event.content_block
            if (block.type === 'tool_use') pending.push({ type: 'toolStart', id: block.id, name: block.name })
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            pending.push({ type: 'text', text: event.delta.text })
          }
          while (pending.length > 0) yield pending.shift() as AiModelEvent
        }
        message = await stream.finalMessage()
      } catch (error) {
        yield describe(error, streamStarted, current)
        return
      }
      const usage = usageOf(message)
      if (usage) yield { type: 'usage', usage }
      if (message.stop_reason === 'refusal') {
        yield { type: 'done', stopReason: 'refusal', content: [], refusal: { explanation: message.stop_details?.explanation ?? null } }
        return
      }
      const content = sanitizeFallback(message.content)
      for (const block of content) {
        if (block.type === 'tool_use') yield { type: 'toolCall', id: block.id, name: block.name, input: block.input }
      }
      yield { type: 'done', stopReason: stopReasonOf(message.stop_reason), content: content as unknown as AiContentBlock[] }
    },
  }
}

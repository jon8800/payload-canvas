// The Anthropic adapter of the agent loop (loop.ts): a manual streaming loop over the Messages API,
// because each step must stream text, tool status and operations to the editor as they happen.
//
// History is append-only. The client stores every `message` event verbatim (assistant content
// unchanged, thinking blocks included) and sends it back, so earlier thinking blocks stay valid
// and the prompt cache keeps hitting.

import type Anthropic from '@anthropic-ai/sdk'

import { runAgent, type DescribeError, type ModelAdapter, type RunAgentArgs, type ToolCall } from './loop'
import type { AiMessage, AiUsage } from './types'

export type { AiErrorEvent, DescribeError } from './loop'

type MessageParam = Anthropic.Beta.BetaMessageParam
type StreamParams = Anthropic.Beta.Messages.MessageCreateParamsStreaming
type StreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent
type Message = Anthropic.Beta.BetaMessage
type ContentBlock = Anthropic.Beta.BetaContentBlock
type Tool = Anthropic.Beta.BetaTool

/** The part of a message stream the loop uses. `client.beta.messages.stream()` returns one. */
export type AiStream = AsyncIterable<StreamEvent> & { finalMessage(): Promise<Message>; abort(): void }

/** The part of the Anthropic client the loop uses. Tests and the fake model implement it. */
export type AiClient = {
  beta: {
    messages: {
      stream(params: Omit<StreamParams, 'stream'>, options?: { signal?: AbortSignal }): AiStream
    }
  }
}

export type AnthropicAdapterArgs = {
  client: AiClient
  model: string
  effort: NonNullable<Anthropic.Beta.BetaOutputConfig['effort']>
  maxTokens: number
  /** Send `fallbacks: "default"` (server-side refusal fallback). */
  fallbacks: boolean
  system: string
  tools: Tool[]
  describeError: DescribeError
  /** Written to the stored messages (`AiMessage.provider`). */
  identity?: string
}

export type RunAssistantArgs = AnthropicAdapterArgs & Omit<RunAgentArgs, 'adapter'>

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

export function buildParams(args: AnthropicAdapterArgs, history: MessageParam[]): Omit<StreamParams, 'stream'> {
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

/** The Anthropic Messages API as a model adapter. */
export function anthropicAdapter(args: AnthropicAdapterArgs): ModelAdapter {
  return {
    describeError: args.describeError,
    identity: args.identity,
    async step(history, hooks, signal) {
      const stream = args.client.beta.messages.stream(buildParams(args, history.map(toParam)), { signal })
      let newTextBlock = false
      for await (const event of stream) {
        hooks.start()
        if (event.type === 'content_block_start') {
          const block = event.content_block
          if (block.type === 'text') newTextBlock = true
          if (block.type === 'tool_use') hooks.toolStart(block.id, block.name)
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          hooks.text(event.delta.text, newTextBlock)
          newTextBlock = false
        }
      }
      const message = await stream.finalMessage()
      const usage = usageOf(message)
      if (message.stop_reason === 'refusal') {
        return { content: [], calls: [], stopReason: 'refusal', refusal: { explanation: message.stop_details?.explanation ?? null }, usage }
      }
      const content = sanitizeFallback(message.content)
      const calls: ToolCall[] = content.flatMap((b) => (b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : []))
      return { content, calls, stopReason: message.stop_reason, pause: message.stop_reason === 'pause_turn', usage }
    },
  }
}

/** Runs one user turn against the Anthropic API. Never throws: failures become an `error` event. */
export async function runAssistant(args: RunAssistantArgs): Promise<void> {
  return runAgent({ ...args, adapter: anthropicAdapter(args) })
}

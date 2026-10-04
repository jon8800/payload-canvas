// The assistant's agent loop: a manual streaming loop, because each step must stream text, tool
// status and operations to the editor as they happen.
//
// History is append-only. The client stores every `message` event verbatim (assistant content
// unchanged, thinking blocks included) and sends it back, so earlier thinking blocks stay valid
// and the prompt cache keeps hitting.

import type Anthropic from '@anthropic-ai/sdk'

import { createId } from '../core/ids'
import { RUNNING_SUMMARY, runTool, type ToolEnv, type Workspace } from './tools'
import type { AiMessage, AiStreamEvent } from './types'

type MessageParam = Anthropic.Beta.BetaMessageParam
type StreamParams = Anthropic.Beta.Messages.MessageCreateParamsStreaming
type StreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent
type Message = Anthropic.Beta.BetaMessage
type ContentBlock = Anthropic.Beta.BetaContentBlock
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam
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

export type AiErrorEvent = Extract<AiStreamEvent, { type: 'error' }>

/**
 * Maps an exception from the API call to an `error` event. `streamStarted` is true when at least
 * one stream event arrived. Return null to retry the step once more (unparseable tool input).
 */
export type DescribeError = (error: unknown, info: { streamStarted: boolean }) => AiErrorEvent | null

export type RunAssistantArgs = {
  client: AiClient
  model: string
  effort: NonNullable<Anthropic.Beta.BetaOutputConfig['effort']>
  maxSteps: number
  maxTokens: number
  /** Send `fallbacks: "default"` (server-side refusal fallback). */
  fallbacks: boolean
  system: string
  tools: Tool[]
  /** The conversation from the client, ending with the new user message. Already validated. */
  messages: AiMessage[]
  /** The editor context, sent right after the user's message (kind "context"). */
  context: AiMessage
  workspace: Workspace
  env: ToolEnv
  emit: (event: AiStreamEvent) => void
  describeError: DescribeError
  signal?: AbortSignal
  turnId?: string
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

export function buildParams(args: RunAssistantArgs, history: MessageParam[]): Omit<StreamParams, 'stream'> {
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

const REFUSAL_TEXT = 'I can’t help with that request.'
const MAX_JSON_RETRIES = 2

/** Runs one user turn to the end. Never throws: failures become an `error` event. */
export async function runAssistant(args: RunAssistantArgs): Promise<void> {
  const { client, emit, signal, workspace, env } = args
  const turnId = args.turnId ?? `turn_${createId().slice(2)}`
  const history: MessageParam[] = [...args.messages.map(toParam), toParam(args.context)]
  let contextSent = false
  let textSent = false
  let jsonRetries = 0

  const sendText = (text: string) => {
    if (!text) return
    emit({ type: 'text', text })
    textSent = true
  }
  const aborted = () => {
    emit({ type: 'error', code: 'aborted', message: 'The request was cancelled.' })
  }

  for (let step = 0; step < args.maxSteps; step++) {
    if (signal?.aborted) return aborted()

    let message: Message
    let streamStarted = false
    try {
      const stream = client.beta.messages.stream(buildParams(args, history), { signal })
      let newTextBlock = false
      for await (const event of stream) {
        if (!streamStarted) {
          streamStarted = true
          // The context joins the history only once the API accepted the request.
          if (!contextSent) {
            emit({ type: 'message', message: args.context })
            contextSent = true
          }
        }
        if (event.type === 'content_block_start') {
          const block = event.content_block
          if (block.type === 'text') newTextBlock = true
          if (block.type === 'tool_use') {
            emit({ type: 'tool', callId: block.id, name: block.name, status: 'running', summary: RUNNING_SUMMARY[block.name] ?? block.name })
          }
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          // A new text block after earlier text (e.g. after a tool round) starts a new paragraph.
          if (newTextBlock && textSent && event.delta.text) sendText('\n\n')
          newTextBlock = false
          sendText(event.delta.text)
        }
      }
      message = await stream.finalMessage()
      jsonRetries = 0
    } catch (error) {
      if (signal?.aborted) return aborted()
      const described = args.describeError(error, { streamStarted })
      if (described === null && jsonRetries++ < MAX_JSON_RETRIES) {
        step--
        continue
      }
      emit(described ?? { type: 'error', code: 'api_error', message: 'The model sent a tool call that could not be read.' })
      return
    }

    // A refusal can cut a tool call off mid-input: never run that turn's tools, and drop the
    // partial output (it is not a complete answer).
    if (message.stop_reason === 'refusal') {
      const explanation = message.stop_details?.explanation
      sendText((textSent ? '\n\n' : '') + REFUSAL_TEXT + (explanation ? ` ${explanation}` : ''))
      emit({ type: 'done', turnId, stopReason: 'refusal' })
      return
    }

    const content = sanitizeFallback(message.content)
    const assistant: AiMessage = { role: 'assistant', content }

    // pause_turn: send the paused turn back as is; the API resumes it.
    if (message.stop_reason === 'pause_turn') {
      history.push(toParam(assistant))
      emit({ type: 'message', message: assistant })
      continue
    }

    const calls = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (calls.length === 0) {
      if (content.length > 0) {
        history.push(toParam(assistant))
        emit({ type: 'message', message: assistant })
      }
      if (message.stop_reason === 'max_tokens') sendText((textSent ? '\n\n' : '') + '(The reply hit the length limit.)')
      emit({ type: 'done', turnId, stopReason: message.stop_reason })
      return
    }

    // A tool input cut off at max_tokens can still parse as a valid object: do not run it. The
    // calls still get (error) results, so the stored history stays valid.
    const truncated = message.stop_reason === 'max_tokens'

    // Run every call first, then emit the whole round at once: the client never stores an
    // assistant message without its tool results.
    const results: ToolResult[] = []
    const events: AiStreamEvent[] = []
    for (const call of calls) {
      if (truncated) {
        results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'Not run: the reply hit the length limit.' })
        events.push({ type: 'tool', callId: call.id, name: call.name, status: 'error', summary: 'Not run: the reply hit the length limit' })
        continue
      }
      const outcome = await runTool(call.name, call.input, workspace, env)
      results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.content, ...(outcome.ok ? {} : { is_error: true }) })
      if (outcome.ops && outcome.ops.length > 0) events.push({ type: 'operations', turnId, ops: outcome.ops })
      events.push({ type: 'tool', callId: call.id, name: call.name, status: outcome.ok ? 'done' : 'error', summary: outcome.summary })
    }
    const toolResults: AiMessage = { role: 'user', content: results, kind: 'tool_results' }
    history.push(toParam(assistant), toParam(toolResults))
    emit({ type: 'message', message: assistant })
    for (const event of events) emit(event)
    emit({ type: 'message', message: toolResults })

    if (truncated) {
      sendText((textSent ? '\n\n' : '') + '(The reply hit the length limit before the change was complete.)')
      emit({ type: 'done', turnId, stopReason: 'max_tokens' })
      return
    }
  }

  sendText((textSent ? '\n\n' : '') + `(Stopped after ${args.maxSteps} steps. Send another message to continue.)`)
  emit({ type: 'done', turnId, stopReason: 'max_steps' })
}

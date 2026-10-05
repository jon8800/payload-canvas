// The assistant's agent loop. It drives any AiAdapter: each step streams one model call, runs the
// tools on the working copy, streams text, tool status and operations to the editor, and stores
// every message for the client's history.
//
// History is append-only. The client stores every `message` event verbatim and sends it back.
// Adapters store "text" and "tool_use" blocks (plus their own); the tool results are built here.

import { createId } from '../core/ids'
import { isPlainObject } from '../core/tree'
import { RUNNING_SUMMARY, runTool, type ToolEnv, type Workspace } from './tools'
import type { AiAdapter, AiContentBlock, AiEffort, AiMessage, AiModelEvent, AiStreamEvent, AiSystemPart, AiToolDefinition, AiUsage } from './types'

export type AiErrorEvent = Extract<AiStreamEvent, { type: 'error' }>

/** One tool call of a model reply. `error` is set when the arguments could not be read. */
export type ToolCall = { id: string; name: string; input: unknown; error?: string }

export type RunAgentArgs = {
  adapter: AiAdapter
  system: AiSystemPart[]
  tools: AiToolDefinition[]
  effort?: AiEffort
  maxSteps: number
  /** The conversation from the client, ending with the new user message. Already validated. */
  messages: AiMessage[]
  /** The editor context, sent right after the user's message (kind "context"). */
  context: AiMessage
  workspace: Workspace
  env: ToolEnv
  emit: (event: AiStreamEvent) => void
  signal?: AbortSignal
  turnId?: string
}

/** `${adapter.name}:${adapter.model}`. Stored on every message: history only replays on the same identity. */
export function adapterIdentity(adapter: Pick<AiAdapter, 'name' | 'model'>): string {
  return `${adapter.name}:${adapter.model}`
}

const REFUSAL_TEXT = 'I can’t help with that request.'
const MAX_OUTPUT_RETRIES = 2
const CANCELLED = 'The request was cancelled.'

const sum = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0))

function addUsage(total: AiUsage | undefined, usage: AiUsage | undefined): AiUsage | undefined {
  if (!usage) return total
  if (!total) return { ...usage }
  const cachedTokens = sum(total.cachedTokens, usage.cachedTokens)
  const cost = sum(total.cost, usage.cost)
  return {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    ...(cachedTokens === undefined ? {} : { cachedTokens }),
    ...(cost === undefined ? {} : { cost }),
  }
}

type Done = Extract<AiModelEvent, { type: 'done' }>
type ModelError = Extract<AiModelEvent, { type: 'error' }>

const ERROR_CODES: Record<ModelError['code'], AiErrorEvent['code']> = {
  auth: 'no_api_key',
  aborted: 'aborted',
  api_error: 'api_error',
  invalid_output: 'api_error',
}

/**
 * The tool calls of a reply and the content to store. Calls come from `toolCall` events; an
 * adapter that only puts tool_use blocks in `content` works too. Every call gets a tool_use block,
 * so the stored history stays valid.
 */
function callsOf(done: Done, events: ToolCall[]): { calls: ToolCall[]; content: AiContentBlock[] } {
  const content = [...done.content]
  const fromContent: ToolCall[] = content.flatMap((b) =>
    b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string' ? [{ id: b.id, name: b.name, input: b.input }] : [],
  )
  if (events.length === 0) return { calls: fromContent, content }
  for (const call of events) {
    if (!fromContent.some((c) => c.id === call.id)) content.push({ type: 'tool_use', id: call.id, name: call.name, input: isPlainObject(call.input) ? call.input : {} })
  }
  return { calls: events, content }
}

/** Runs one user turn to the end. Never throws: failures become an `error` event. */
export async function runAgent(args: RunAgentArgs): Promise<void> {
  const { adapter, emit, signal, workspace, env } = args
  const turnId = args.turnId ?? `turn_${createId().slice(2)}`
  const identity = adapterIdentity(adapter)
  const tag = (message: AiMessage): AiMessage => ({ ...message, provider: identity })
  const context = tag(args.context)
  const history: AiMessage[] = [...args.messages, context]
  let contextSent = false
  let textSent = false
  let outputRetries = 0
  let usage: AiUsage | undefined

  const sendText = (text: string) => {
    if (!text) return
    emit({ type: 'text', text })
    textSent = true
  }
  const done = (stopReason: string | null) => emit({ type: 'done', turnId, stopReason, ...(usage ? { usage } : {}) })
  const aborted = () => emit({ type: 'error', code: 'aborted', message: CANCELLED })

  for (let step = 0; step < args.maxSteps; step++) {
    if (signal?.aborted) return aborted()

    let final: Done | null = null
    let failure: ModelError | null = null
    let stepUsage: AiUsage | undefined
    // Text after a tool call, or the first text of a new step after earlier text, starts a new paragraph.
    let afterText = false
    const calls: ToolCall[] = []

    try {
      // A copy: the history grows after this call, and an adapter may keep the request.
      const stream = adapter.stream({ system: args.system, messages: [...history], tools: args.tools, effort: args.effort, signal })
      for await (const event of stream) {
        if (event.type === 'error') {
          failure = event
          break
        }
        // The context joins the history only once the API accepted the request.
        if (!contextSent) {
          emit({ type: 'message', message: context })
          contextSent = true
        }
        if (event.type === 'text') {
          if (!event.text) continue
          if (!afterText && textSent) sendText('\n\n')
          sendText(event.text)
          afterText = true
        } else if (event.type === 'toolStart') {
          emit({ type: 'tool', callId: event.id, name: event.name, status: 'running', summary: RUNNING_SUMMARY[event.name] ?? event.name })
          afterText = false
        } else if (event.type === 'toolCall') {
          calls.push({ id: event.id, name: event.name, input: event.input, ...(event.error ? { error: event.error } : {}) })
          afterText = false
        } else if (event.type === 'usage') {
          stepUsage = event.usage
        } else if (event.type === 'done') {
          final = event
          break
        }
      }
    } catch (error) {
      failure = { type: 'error', code: 'api_error', message: error instanceof Error ? error.message : String(error) }
    }
    if (signal?.aborted) return aborted()
    usage = addUsage(usage, stepUsage)

    if (failure) {
      if (failure.code === 'invalid_output' && outputRetries++ < MAX_OUTPUT_RETRIES) {
        step--
        continue
      }
      emit({ type: 'error', code: ERROR_CODES[failure.code] ?? 'api_error', message: failure.message || 'The model call failed.' })
      return
    }
    if (!final) {
      emit({ type: 'error', code: 'api_error', message: 'The model stream ended without a result.' })
      return
    }
    outputRetries = 0

    // A refusal can cut a tool call off mid-input: never run that turn's tools, and drop the
    // partial output (it is not a complete answer).
    if (final.refusal || final.stopReason === 'refusal') {
      const explanation = final.refusal?.explanation
      sendText((textSent ? '\n\n' : '') + REFUSAL_TEXT + (explanation ? ` ${explanation}` : ''))
      done('refusal')
      return
    }

    const reply = callsOf(final, calls)
    const assistant = tag({ role: 'assistant', content: reply.content })

    // pause_turn: send the paused turn back as is; the API resumes it.
    if (final.stopReason === 'pause_turn') {
      history.push(assistant)
      emit({ type: 'message', message: assistant })
      continue
    }

    if (reply.calls.length === 0) {
      if (reply.content.length > 0) {
        history.push(assistant)
        emit({ type: 'message', message: assistant })
      }
      if (final.stopReason === 'max_tokens') sendText((textSent ? '\n\n' : '') + '(The reply hit the length limit.)')
      done(final.stopReason)
      return
    }

    // A tool input cut off at max_tokens can still parse as a valid object: do not run it. The
    // calls still get (error) results, so the stored history stays valid.
    const truncated = final.stopReason === 'max_tokens'

    // Run every call first, then emit the whole round at once: the client never stores an
    // assistant message without its tool results.
    const results: Array<Record<string, unknown>> = []
    const events: AiStreamEvent[] = []
    const failed = (call: ToolCall, content: string, summary: string) => {
      results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content })
      events.push({ type: 'tool', callId: call.id, name: call.name, status: 'error', summary })
    }
    for (const call of reply.calls) {
      if (truncated) {
        failed(call, 'Not run: the reply hit the length limit.', 'Not run: the reply hit the length limit')
        continue
      }
      if (call.error) {
        failed(call, JSON.stringify({ error: call.error }), 'Not run: the tool input could not be read')
        continue
      }
      const outcome = await runTool(call.name, call.input, workspace, env)
      results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.content, ...(outcome.ok ? {} : { is_error: true }) })
      if (outcome.ops && outcome.ops.length > 0) events.push({ type: 'operations', turnId, ops: outcome.ops })
      events.push({
        type: 'tool',
        callId: call.id,
        name: call.name,
        status: outcome.ok ? 'done' : 'error',
        summary: outcome.summary,
        ...(outcome.image ? { image: outcome.image } : {}),
      })
    }
    const toolResults = tag({ role: 'user', content: results, kind: 'tool_results' })
    history.push(assistant, toolResults)
    emit({ type: 'message', message: assistant })
    for (const event of events) emit(event)
    emit({ type: 'message', message: toolResults })

    if (truncated) {
      sendText((textSent ? '\n\n' : '') + '(The reply hit the length limit before the change was complete.)')
      done('max_tokens')
      return
    }
  }

  sendText((textSent ? '\n\n' : '') + `(Stopped after ${args.maxSteps} steps. Send another message to continue.)`)
  done('max_steps')
}

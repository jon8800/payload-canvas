// The assistant's agent loop, provider-neutral. A model adapter (Anthropic, OpenAI-compatible)
// streams one model call; this loop runs the tools on the working copy, streams text, tool status
// and operations to the editor, and stores every message for the client's history.
//
// History is append-only. The client stores every `message` event verbatim and sends it back. Both
// adapters store "text", "tool_use" and "tool_result" blocks, so tool results are built here.

import { createId } from '../core/ids'
import { RUNNING_SUMMARY, runTool, type ToolEnv, type Workspace } from './tools'
import type { AiMessage, AiStreamEvent, AiUsage } from './types'

export type AiErrorEvent = Extract<AiStreamEvent, { type: 'error' }>

/**
 * Maps an exception from the model call to an `error` event. `streamStarted` is true when at
 * least one stream event arrived. Return null to retry the step once more (unparseable tool input).
 */
export type DescribeError = (error: unknown, info: { streamStarted: boolean }) => AiErrorEvent | null

/** One tool call of a model reply. `invalid` is set when the arguments could not be read. */
export type ToolCall = { id: string; name: string; input: unknown; invalid?: string }

/** Called by the adapter while the reply streams. */
export type StepHooks = {
  /** The first stream event arrived (the API accepted the request). */
  start(): void
  /** Assistant text. `newBlock` is true for the first text of a new text block. */
  text(text: string, newBlock: boolean): void
  /** A tool call started streaming. */
  toolStart(id: string, name: string): void
}

/** The result of one model call. */
export type ModelStep = {
  /** The assistant message content to store (provider-specific blocks allowed). */
  content: unknown[]
  calls: ToolCall[]
  /** In Anthropic terms: "end_turn", "tool_use", "max_tokens", … */
  stopReason: string | null
  /** The model declined: nothing is stored or run. */
  refusal?: { explanation: string | null }
  /** Anthropic `pause_turn`: store the reply and call again. */
  pause?: boolean
  usage?: AiUsage
}

export type ModelAdapter = {
  step(history: AiMessage[], hooks: StepHooks, signal?: AbortSignal): Promise<ModelStep>
  describeError: DescribeError
  /** Written to `AiMessage.provider` of the stored messages. */
  identity?: string
}

export type RunAgentArgs = {
  adapter: ModelAdapter
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

const REFUSAL_TEXT = 'I can’t help with that request.'
const MAX_JSON_RETRIES = 2

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

/** Runs one user turn to the end. Never throws: failures become an `error` event. */
export async function runAgent(args: RunAgentArgs): Promise<void> {
  const { adapter, emit, signal, workspace, env } = args
  const turnId = args.turnId ?? `turn_${createId().slice(2)}`
  const tag = (message: AiMessage): AiMessage => (adapter.identity ? { ...message, provider: adapter.identity } : message)
  const context = tag(args.context)
  const history: AiMessage[] = [...args.messages, context]
  let contextSent = false
  let textSent = false
  let jsonRetries = 0
  let usage: AiUsage | undefined

  const sendText = (text: string) => {
    if (!text) return
    emit({ type: 'text', text })
    textSent = true
  }
  const done = (stopReason: string | null) => emit({ type: 'done', turnId, stopReason, ...(usage ? { usage } : {}) })
  const aborted = () => {
    emit({ type: 'error', code: 'aborted', message: 'The request was cancelled.' })
  }

  for (let step = 0; step < args.maxSteps; step++) {
    if (signal?.aborted) return aborted()

    let result: ModelStep
    let streamStarted = false
    const hooks: StepHooks = {
      start() {
        if (streamStarted) return
        streamStarted = true
        // The context joins the history only once the API accepted the request.
        if (!contextSent) {
          emit({ type: 'message', message: context })
          contextSent = true
        }
      },
      text(text, newBlock) {
        hooks.start()
        // A new text block after earlier text (e.g. after a tool round) starts a new paragraph.
        if (newBlock && textSent && text) sendText('\n\n')
        sendText(text)
      },
      toolStart(id, name) {
        hooks.start()
        emit({ type: 'tool', callId: id, name, status: 'running', summary: RUNNING_SUMMARY[name] ?? name })
      },
    }
    try {
      result = await adapter.step(history, hooks, signal)
      jsonRetries = 0
    } catch (error) {
      if (signal?.aborted) return aborted()
      const described = adapter.describeError(error, { streamStarted })
      if (described === null && jsonRetries++ < MAX_JSON_RETRIES) {
        step--
        continue
      }
      emit(described ?? { type: 'error', code: 'api_error', message: 'The model sent a tool call that could not be read.' })
      return
    }
    usage = addUsage(usage, result.usage)

    // A refusal can cut a tool call off mid-input: never run that turn's tools, and drop the
    // partial output (it is not a complete answer).
    if (result.refusal) {
      const explanation = result.refusal.explanation
      sendText((textSent ? '\n\n' : '') + REFUSAL_TEXT + (explanation ? ` ${explanation}` : ''))
      done('refusal')
      return
    }

    const assistant = tag({ role: 'assistant', content: result.content })

    // pause_turn: send the paused turn back as is; the API resumes it.
    if (result.pause) {
      history.push(assistant)
      emit({ type: 'message', message: assistant })
      continue
    }

    if (result.calls.length === 0) {
      if (result.content.length > 0) {
        history.push(assistant)
        emit({ type: 'message', message: assistant })
      }
      if (result.stopReason === 'max_tokens') sendText((textSent ? '\n\n' : '') + '(The reply hit the length limit.)')
      done(result.stopReason)
      return
    }

    // A tool input cut off at max_tokens can still parse as a valid object: do not run it. The
    // calls still get (error) results, so the stored history stays valid.
    const truncated = result.stopReason === 'max_tokens'

    // Run every call first, then emit the whole round at once: the client never stores an
    // assistant message without its tool results.
    const results: Array<Record<string, unknown>> = []
    const events: AiStreamEvent[] = []
    const failed = (call: ToolCall, content: string, summary: string) => {
      results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content })
      events.push({ type: 'tool', callId: call.id, name: call.name, status: 'error', summary })
    }
    for (const call of result.calls) {
      if (truncated) {
        failed(call, 'Not run: the reply hit the length limit.', 'Not run: the reply hit the length limit')
        continue
      }
      if (call.invalid) {
        failed(call, JSON.stringify({ error: call.invalid }), 'Not run: the tool input could not be read')
        continue
      }
      const outcome = await runTool(call.name, call.input, workspace, env)
      results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.content, ...(outcome.ok ? {} : { is_error: true }) })
      if (outcome.ops && outcome.ops.length > 0) events.push({ type: 'operations', turnId, ops: outcome.ops })
      events.push({ type: 'tool', callId: call.id, name: call.name, status: outcome.ok ? 'done' : 'error', summary: outcome.summary })
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

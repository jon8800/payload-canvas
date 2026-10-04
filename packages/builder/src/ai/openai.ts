// The OpenAI-compatible adapter of the agent loop (loop.ts): Chat Completions over plain fetch with
// streaming. Works with OpenRouter, Cloudflare AI Gateway (compat endpoint), OpenAI, Groq, Ollama,
// LM Studio and other servers that speak the same format. No SDK.
//
// Stored history uses the same block types as the Anthropic adapter ("text", "tool_use",
// "tool_result"), plus a "reasoning" block that carries the provider's reasoning fields back
// unchanged. The blocks are turned into Chat Completions messages on every request.

import { createId } from '../core/ids'
import { isPlainObject } from '../core/tree'
import type { DescribeError, ModelAdapter, ModelStep, StepHooks, ToolCall } from './loop'
import { createSseParser } from './sse'
import type { OpenAiTool } from './tools'
import type { AiMessage, AiUsage } from './types'

export type OpenAiAdapterOptions = {
  /** Full Chat Completions URL. */
  url: string
  /** Request headers, credentials included. */
  headers: Record<string, string>
  /** "OpenRouter", "Cloudflare AI Gateway", … for error messages. */
  label: string
  /** What to set after a 401. */
  keyHint: string
  model: string
  system: string
  tools: OpenAiTool[]
  /** Sent as `max_tokens` only when set. */
  maxTokens?: number
  /** Extra body fields, e.g. OpenRouter's `reasoning: { effort }`. */
  extraBody?: Record<string, unknown>
  /** Ask for a usage chunk (`stream_options.include_usage`). Default true; dropped once if the server rejects it. */
  includeUsage?: boolean
  /** Written to the stored messages (`AiMessage.provider`). */
  identity?: string
  /** Tests and the fake model. Default: global fetch. */
  fetch?: typeof fetch
  /** Time to wait for the response headers. Default 60 s. */
  timeoutMs?: number
  /** Time to wait between two stream chunks. Default 120 s. */
  idleTimeoutMs?: number
  /** Retries on 408, 429, 5xx and network errors before the stream starts. Default 2. */
  maxRetries?: number
  /** First retry delay; doubles each time. A Retry-After header wins (up to 20 s). Default 1000 ms. */
  retryDelayMs?: number
  /** Tests: replaces the timer. Must reject when the signal aborts. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** An HTTP or stream error from the provider. `status` is the HTTP status when there is one. */
export class OpenAiApiError extends Error {
  readonly status: number | null
  readonly kind: 'http' | 'stream' | 'timeout' | 'network'
  readonly retryAfterMs: number | null

  constructor(message: string, options: { status?: number | null; kind: OpenAiApiError['kind']; retryAfterMs?: number | null }) {
    super(message)
    this.name = 'OpenAiApiError'
    this.status = options.status ?? null
    this.kind = options.kind
    this.retryAfterMs = options.retryAfterMs ?? null
  }
}

// ---------------------------------------------------------------------------
// History -> Chat Completions messages
// ---------------------------------------------------------------------------

type ChatMessage = Record<string, unknown> & { role: 'system' | 'user' | 'assistant' | 'tool' }
type Block = Record<string, unknown> & { type: string }

function blocksOf(content: unknown): Block[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : []
  if (!Array.isArray(content)) return []
  return content.filter((b): b is Block => isPlainObject(b) && typeof b.type === 'string')
}

function textOf(blocks: Block[]): string {
  return blocks.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('\n\n')
}

/** Tool result content as a string (Anthropic allows a list of blocks). */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  const text = textOf(blocksOf(content))
  return text || JSON.stringify(content ?? null)
}

/** The stored history as Chat Completions messages. Anthropic-only blocks (thinking) are left out. */
export function toChatMessages(system: string, history: AiMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }]
  for (const message of history) {
    const blocks = blocksOf(message.content)
    if (message.role === 'user') {
      // Tool results first: they answer the assistant message right before this one.
      for (const block of blocks) {
        if (block.type === 'tool_result') out.push({ role: 'tool', tool_call_id: String(block.tool_use_id), content: resultText(block.content) })
      }
      const text = textOf(blocks)
      if (text) out.push({ role: 'user', content: text })
      continue
    }
    const text = textOf(blocks)
    const calls = blocks.flatMap((b) =>
      b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string'
        ? [{ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }]
        : [],
    )
    const reasoning = blocks.find((b) => b.type === 'reasoning')
    if (!text && calls.length === 0) continue
    out.push({
      role: 'assistant',
      content: text || null,
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
      // Echo the provider's reasoning back unchanged (OpenRouter asks for it during tool use).
      ...(reasoning && typeof reasoning.reasoning === 'string' ? { reasoning: reasoning.reasoning } : {}),
      ...(reasoning && Array.isArray(reasoning.reasoning_details) ? { reasoning_details: reasoning.reasoning_details } : {}),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Stream accumulation
// ---------------------------------------------------------------------------

type PendingCall = { id: string; name: string; args: string; announced: boolean }

/**
 * Reads tool call arguments. They arrive as string fragments; some models wrap them in a code
 * fence, double-encode them, or send nothing for a call without arguments.
 */
export function parseArguments(raw: string): { input: Record<string, unknown> } | { error: string } {
  let text = raw.trim()
  if (!text) return { input: {} }
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text)
  if (fence) text = fence[1]
  try {
    let value: unknown = JSON.parse(text)
    if (typeof value === 'string') value = JSON.parse(value)
    if (isPlainObject(value)) return { input: value }
    return { error: 'The tool arguments must be one JSON object.' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { error: `The tool arguments were not valid JSON (${reason}). Send the arguments as one JSON object and try again.` }
  }
}

/** Merges streamed `reasoning_details` items: items with the same `index` are one item in parts. */
function mergeDetails(target: Record<string, unknown>[], items: unknown[]) {
  for (const item of items) {
    if (!isPlainObject(item)) continue
    const existing = typeof item.index === 'number' ? target.find((d) => d.index === item.index && d.type === item.type) : undefined
    if (!existing) {
      target.push({ ...item })
      continue
    }
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'string' && typeof existing[key] === 'string' && ['text', 'summary', 'data'].includes(key)) {
        existing[key] = (existing[key] as string) + value
      } else if (value !== undefined && value !== null) {
        existing[key] = value
      }
    }
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function usageOf(value: unknown): AiUsage | undefined {
  if (!isPlainObject(value)) return undefined
  const details = isPlainObject(value.prompt_tokens_details) ? value.prompt_tokens_details : {}
  const cached = num(details.cached_tokens)
  const cost = num(value.cost)
  return {
    inputTokens: num(value.prompt_tokens) ?? 0,
    outputTokens: num(value.completion_tokens) ?? 0,
    ...(cached === undefined ? {} : { cachedTokens: cached }),
    ...(cost === undefined ? {} : { cost }),
  }
}

/** finish_reason in Anthropic terms, so the editor and the loop see one vocabulary. */
function stopReasonOf(finish: string | null, hasCalls: boolean): string {
  if (finish === 'length') return 'max_tokens'
  if (hasCalls) return 'tool_use'
  if (finish === 'content_filter') return 'refusal'
  return 'end_turn'
}

/** Builds the step result from the stream chunks. One instance per model call. */
export function createAccumulator(hooks: StepHooks) {
  let text = ''
  let reasoning = ''
  const details: Record<string, unknown>[] = []
  const calls = new Map<number, PendingCall>()
  let lastIndex = -1
  let finish: string | null = null
  let usage: AiUsage | undefined
  let error: OpenAiApiError | null = null
  let done = false
  let started = false

  const callFor = (delta: Record<string, unknown>): PendingCall => {
    let index = typeof delta.index === 'number' ? delta.index : -1
    if (index < 0 && typeof delta.id === 'string') {
      for (const [i, call] of calls) if (call.id === delta.id) index = i
    }
    // No index and an unknown id: a new call. No index and no id: a fragment of the last call.
    if (index < 0) index = typeof delta.id === 'string' || lastIndex < 0 ? calls.size : lastIndex
    lastIndex = index
    let call = calls.get(index)
    if (!call) {
      call = { id: '', name: '', args: '', announced: false }
      calls.set(index, call)
    }
    return call
  }

  return {
    get done() {
      return done
    },
    /** One SSE `data:` payload. */
    push(data: string) {
      const trimmed = data.trim()
      if (trimmed === '[DONE]') {
        done = true
        return
      }
      let chunk: unknown
      try {
        chunk = JSON.parse(trimmed)
      } catch {
        return
      }
      if (!isPlainObject(chunk)) return
      if (!started) {
        started = true
        hooks.start()
      }
      if (isPlainObject(chunk.error)) {
        const code = chunk.error.code
        const message = typeof chunk.error.message === 'string' ? chunk.error.message : 'The stream reported an error.'
        error = new OpenAiApiError(message, { status: typeof code === 'number' ? code : null, kind: 'stream' })
      }
      const chunkUsage = usageOf(chunk.usage)
      if (chunkUsage) usage = chunkUsage
      const choice = Array.isArray(chunk.choices) && isPlainObject(chunk.choices[0]) ? chunk.choices[0] : null
      if (!choice) return
      const delta = isPlainObject(choice.delta) ? choice.delta : isPlainObject(choice.message) ? choice.message : {}
      if (typeof delta.content === 'string' && delta.content) {
        hooks.text(delta.content, text === '')
        text += delta.content
      }
      if (typeof delta.reasoning === 'string') reasoning += delta.reasoning
      else if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content
      if (Array.isArray(delta.reasoning_details)) mergeDetails(details, delta.reasoning_details)
      for (const item of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        if (!isPlainObject(item)) continue
        const call = callFor(item)
        if (typeof item.id === 'string' && item.id && !call.id) call.id = item.id
        const fn = isPlainObject(item.function) ? item.function : {}
        // The name comes whole in the first fragment; some servers repeat it in every fragment.
        if (typeof fn.name === 'string' && fn.name && !call.name) call.name = fn.name
        if (typeof fn.arguments === 'string') call.args += fn.arguments
        else if (isPlainObject(fn.arguments)) call.args = JSON.stringify(fn.arguments)
        if (!call.announced && call.name) {
          call.id ||= `call_${createId().slice(2)}`
          call.announced = true
          hooks.toolStart(call.id, call.name)
        }
      }
      if (typeof choice.finish_reason === 'string') {
        finish = choice.finish_reason
        if (finish === 'error' && !error) error = new OpenAiApiError('The model stopped with an error.', { kind: 'stream' })
      }
    },
    /** The step result. Throws the stream's error, if any. */
    result(): ModelStep {
      if (error) throw error
      if (!started) throw new OpenAiApiError('The API sent an empty response.', { kind: 'stream' })
      const toolCalls: ToolCall[] = [...calls.entries()]
        .toSorted(([a], [b]) => a - b)
        .flatMap(([, call]) => {
          if (!call.name) return []
          const id = call.id || `call_${createId().slice(2)}`
          const parsed = parseArguments(call.args)
          return 'error' in parsed ? [{ id, name: call.name, input: {}, invalid: parsed.error }] : [{ id, name: call.name, input: parsed.input }]
        })
      const stopReason = stopReasonOf(finish, toolCalls.length > 0)
      if (stopReason === 'refusal') return { content: [], calls: [], stopReason, refusal: { explanation: null }, usage }
      const content: unknown[] = []
      if (reasoning || details.length > 0) {
        content.push({ type: 'reasoning', ...(reasoning ? { reasoning } : {}), ...(details.length > 0 ? { reasoning_details: details } : {}) })
      }
      if (text) content.push({ type: 'text', text })
      for (const call of toolCalls) content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input })
      return { content, calls: toolCalls, stopReason, usage }
    },
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_IDLE_TIMEOUT_MS = 120_000
const MAX_RETRY_DELAY_MS = 20_000

function abortError(): Error {
  const error = new Error('The request was cancelled.')
  error.name = 'AbortError'
  return error
}

/** setTimeout as a promise that rejects when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const retryable = (status: number) => status === 408 || status === 429 || status >= 500

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get('retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

/** The provider's error message from a JSON (or text) error body. */
async function httpError(response: Response): Promise<OpenAiApiError> {
  let message = ''
  try {
    const text = await response.text()
    try {
      const body = JSON.parse(text) as unknown
      const error = isPlainObject(body) ? body.error : null
      if (isPlainObject(error)) {
        message = typeof error.message === 'string' ? error.message : ''
        // OpenRouter puts the upstream provider's message in metadata.raw.
        const raw = isPlainObject(error.metadata) ? error.metadata.raw : undefined
        if (typeof raw === 'string' && raw && !message.includes(raw)) message = `${message} (${raw.slice(0, 300)})`
      } else if (typeof error === 'string') {
        message = error
      } else if (isPlainObject(body) && typeof body.message === 'string') {
        message = body.message
      }
    } catch {
      message = text.slice(0, 300)
    }
  } catch {
    // No body.
  }
  return new OpenAiApiError(message || response.statusText || `HTTP ${response.status}`, {
    status: response.status,
    kind: 'http',
    retryAfterMs: retryAfterMs(response),
  })
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/** Maps adapter errors to `error` events with the provider's message. */
export function describeOpenAiError(options: Pick<OpenAiAdapterOptions, 'label' | 'keyHint' | 'model'>): DescribeError {
  const { label, keyHint, model } = options
  return (error) => {
    if (error instanceof OpenAiApiError) {
      const detail = error.message ? `: ${error.message.trim().replace(/\.$/, '')}` : ''
      if (error.kind === 'timeout') return { type: 'error', code: 'api_error', message: `${label} did not answer in time${detail}. Try again.` }
      if (error.kind === 'network') return { type: 'error', code: 'api_error', message: `Could not reach ${label}${detail}.` }
      switch (error.status) {
        case 401:
          return { type: 'error', code: 'no_api_key', message: `${label} rejected the API key (401)${detail}. ${keyHint}` }
        case 402:
          return { type: 'error', code: 'api_error', message: `${label} says the account has no credits left (402)${detail}.` }
        case 404:
          return { type: 'error', code: 'api_error', message: `${label} returned 404${detail}. Check the model id "${model}" and that the model supports tool calling.` }
        case 429:
          return { type: 'error', code: 'api_error', message: `${label} rate limit reached (429)${detail}. Wait a moment and try again.` }
      }
      const status = error.status ? ` (${error.status})` : ''
      return { type: 'error', code: 'api_error', message: `${label} returned an error${status}${detail}` }
    }
    if (error instanceof Error && error.name === 'AbortError') return { type: 'error', code: 'aborted', message: 'The request was cancelled.' }
    return { type: 'error', code: 'api_error', message: error instanceof Error ? error.message : String(error) }
  }
}

/** An OpenAI-compatible Chat Completions API as a model adapter. */
export function openAiAdapter(options: OpenAiAdapterOptions): ModelAdapter {
  const doFetch = options.fetch ?? fetch
  const wait = options.sleep ?? sleep
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const idleMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
  const maxRetries = options.maxRetries ?? 2
  const baseDelay = options.retryDelayMs ?? 1000
  let includeUsage = options.includeUsage ?? true

  /** One HTTP attempt. The returned controller also stops the body read (idle timeout, abort). */
  const attempt = async (body: Record<string, unknown>, signal?: AbortSignal) => {
    const controller = new AbortController()
    let timedOut = false
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    try {
      const response = await doFetch(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...options.headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)
      return { response, controller, cleanup }
    } catch (error) {
      cleanup()
      if (signal?.aborted) throw abortError()
      if (timedOut) throw new OpenAiApiError(`no response within ${Math.round(timeoutMs / 1000)} seconds`, { kind: 'timeout' })
      throw new OpenAiApiError(error instanceof Error ? error.message : String(error), { kind: 'network' })
    }
  }

  /** Sends the request, retrying 408 / 429 / 5xx / network errors with backoff. */
  const request = async (history: AiMessage[], signal?: AbortSignal) => {
    for (let retry = 0; ; retry++) {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: toChatMessages(options.system, history),
        ...(options.tools.length > 0 ? { tools: options.tools, tool_choice: 'auto' } : {}),
        stream: true,
        ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...options.extraBody,
      }
      let failure: OpenAiApiError
      try {
        const sent = await attempt(body, signal)
        if (sent.response.ok && sent.response.body) return sent
        sent.cleanup()
        failure = sent.response.ok ? new OpenAiApiError('The API sent no response body.', { kind: 'stream' }) : await httpError(sent.response)
      } catch (error) {
        if (!(error instanceof OpenAiApiError)) throw error
        failure = error
      }
      // Some servers reject stream_options: try once without it (no usage then).
      if (failure.status === 400 && includeUsage && /stream_options|include_usage/i.test(failure.message)) {
        includeUsage = false
        retry--
        continue
      }
      const canRetry = failure.kind === 'network' || failure.kind === 'timeout' || (failure.status !== null && retryable(failure.status))
      if (!canRetry || retry >= maxRetries) throw failure
      await wait(Math.min(MAX_RETRY_DELAY_MS, failure.retryAfterMs ?? baseDelay * 2 ** retry), signal)
    }
  }

  return {
    identity: options.identity,
    describeError: describeOpenAiError(options),
    async step(history, hooks, signal) {
      const { response, controller, cleanup } = await request(history, signal)
      const accumulator = createAccumulator(hooks)
      const parser = createSseParser(({ data }) => accumulator.push(data))
      const reader = (response.body as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      let idleTimedOut = false
      let idle: ReturnType<typeof setTimeout> | undefined
      const resetIdle = () => {
        clearTimeout(idle)
        idle = setTimeout(() => {
          idleTimedOut = true
          controller.abort()
        }, idleMs)
      }
      try {
        resetIdle()
        while (!accumulator.done) {
          const { done, value } = await reader.read()
          if (done) break
          resetIdle()
          parser.push(decoder.decode(value, { stream: true }))
        }
        parser.push(decoder.decode())
        parser.end()
      } catch (error) {
        if (signal?.aborted) throw abortError()
        if (idleTimedOut) throw new OpenAiApiError(`the stream stalled for ${Math.round(idleMs / 1000)} seconds`, { kind: 'timeout' })
        throw new OpenAiApiError(error instanceof Error ? error.message : String(error), { kind: 'network' })
      } finally {
        clearTimeout(idle)
        cleanup()
        // Stop the download when the loop ended early ([DONE] seen, error, abort).
        reader.cancel().catch(() => {})
      }
      return accumulator.result()
    },
  }
}

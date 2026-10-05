// Shared code of the OpenAI-format adapters (OpenRouter, Cloudflare, any OpenAI-compatible API):
// Chat Completions over plain fetch with streaming. No SDK.
//
// Stored history uses the neutral block types ("text", "tool_use", "tool_result"), plus a
// "reasoning" block that carries the provider's reasoning fields back unchanged. The blocks are
// turned into Chat Completions messages on every request.

import { createId } from '../core/ids'
import { isPlainObject } from '../core/tree'
import { createSseParser } from './sse'
import type { AiAdapter, AiContentBlock, AiMessage, AiModelEvent, AiModelRequest, AiStopReason, AiSystemPart, AiToolDefinition, AiUsage } from './types'

/** Request options every OpenAI-format adapter accepts. */
export type OpenAIFormatTransportOptions = {
  /** Output limit per model call. Sent as `max_tokens` only when set. */
  maxTokens?: number
  /** Extra request headers. */
  headers?: Record<string, string>
  /** Tests: replaces fetch. */
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

export type OpenAIFormatAdapterOptions = OpenAIFormatTransportOptions & {
  name: string
  label: string
  model: string
  /** The full Chat Completions URL. */
  url: string
  /** Credential headers (Authorization, …). Merged before `headers`. Never logged. */
  authHeaders?: Record<string, string>
  ready?: boolean
  setupProblem?: string | null
  keyEnv?: string | null
  keyUrl?: string | null
  /** What to check after a 401. */
  keyHint: string
  /** Extra body fields per request, e.g. OpenRouter's `reasoning: { effort }`. */
  extraBody?: (request: AiModelRequest) => Record<string, unknown> | undefined
  /** Send the cached system parts as content parts with `cache_control` (OpenRouter: Anthropic and Gemini models). */
  cacheControl?: boolean
  /** Ask for a usage chunk (`stream_options.include_usage`). Default true; dropped once if the server rejects it. */
  includeUsage?: boolean
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
// Tools and history -> Chat Completions
// ---------------------------------------------------------------------------

export type ChatTool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

/**
 * A JSON Schema that most OpenAI-compatible providers accept: no type arrays (["string","null"]
 * becomes "string"), no `const` (becomes a one-value enum), no `additionalProperties`.
 */
export function portableSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(portableSchema)
  if (!isPlainObject(schema)) return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue
    if (key === 'type' && Array.isArray(value)) {
      const types = value.filter((t) => t !== 'null')
      out.type = types.length === 1 ? types[0] : types
    } else if (key === 'const') {
      out.enum = [value]
    } else if (key === 'properties' && isPlainObject(value)) {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, portableSchema(item)]))
    } else {
      out[key] = portableSchema(value)
    }
  }
  return out
}

/** The tools as Chat Completions function tools (the simpler schema where there is one). */
export function chatTools(tools: AiToolDefinition[]): ChatTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: portableSchema(tool.simpleInputSchema ?? tool.inputSchema) as Record<string, unknown>,
    },
  }))
}

export type ChatMessage = Record<string, unknown> & { role: 'system' | 'user' | 'assistant' | 'tool' }
type Block = Record<string, unknown> & { type: string }

function blocksOf(content: unknown): Block[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : []
  if (!Array.isArray(content)) return []
  return content.filter((b): b is Block => isPlainObject(b) && typeof b.type === 'string')
}

function textOf(blocks: Block[]): string {
  return blocks.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('\n\n')
}

/** Tool result content as a string (it may be a list of blocks). */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  const text = textOf(blocksOf(content))
  return text || JSON.stringify(content ?? null)
}

/** The system message. With `cacheControl`, cached parts carry `cache_control` (OpenRouter passes it on). */
function systemMessage(system: AiSystemPart[] | string, cacheControl: boolean): ChatMessage {
  const parts = typeof system === 'string' ? [{ text: system }] : system
  if (!cacheControl) return { role: 'system', content: parts.map((p) => p.text).join('\n\n') }
  return {
    role: 'system',
    content: parts.map((p) => ({ type: 'text', text: p.text, ...(p.cache ? { cache_control: { type: 'ephemeral' } } : {}) })),
  }
}

/** The stored history as Chat Completions messages. Blocks of other adapters (thinking) are left out. */
export function toChatMessages(system: AiSystemPart[] | string, history: AiMessage[], options: { cacheControl?: boolean } = {}): ChatMessage[] {
  const out: ChatMessage[] = [systemMessage(system, options.cacheControl === true)]
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

/** finish_reason in the assistant's stop reasons. */
function stopReasonOf(finish: string | null, hasCalls: boolean): AiStopReason {
  if (finish === 'length') return 'max_tokens'
  // A filtered reply can end in a cut-off tool call: never run it.
  if (finish === 'content_filter') return 'refusal'
  if (hasCalls) return 'tool_use'
  return 'end_turn'
}

/**
 * Builds the model events from the stream chunks. One instance per model call. `onEvent` gets the
 * text and toolStart events as they stream; `result()` returns the closing events.
 */
export function createAccumulator(onEvent: (event: AiModelEvent) => void) {
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
      started = true
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
        onEvent({ type: 'text', text: delta.content })
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
          onEvent({ type: 'toolStart', id: call.id, name: call.name })
        }
      }
      if (typeof choice.finish_reason === 'string') {
        finish = choice.finish_reason
        if (finish === 'error' && !error) error = new OpenAiApiError('The model stopped with an error.', { kind: 'stream' })
      }
    },
    /** The closing events: tool calls, usage, done. Throws the stream's error, if any. */
    result(): AiModelEvent[] {
      if (error) throw error
      if (!started) throw new OpenAiApiError('The API sent an empty response.', { kind: 'stream' })
      const events: AiModelEvent[] = []
      const content: AiContentBlock[] = []
      if (reasoning || details.length > 0) {
        content.push({ type: 'reasoning', ...(reasoning ? { reasoning } : {}), ...(details.length > 0 ? { reasoning_details: details } : {}) })
      }
      if (text) content.push({ type: 'text', text })
      let hasCalls = false
      for (const [, call] of [...calls.entries()].toSorted(([a], [b]) => a - b)) {
        if (!call.name) continue
        hasCalls = true
        const id = call.id || `call_${createId().slice(2)}`
        const parsed = parseArguments(call.args)
        const input = 'error' in parsed ? {} : parsed.input
        content.push({ type: 'tool_use', id, name: call.name, input })
        events.push({ type: 'toolCall', id, name: call.name, input, ...('error' in parsed ? { error: parsed.error } : {}) })
      }
      if (usage) events.push({ type: 'usage', usage })
      const stopReason = stopReasonOf(finish, hasCalls)
      if (stopReason === 'refusal') return [...events.filter((e) => e.type === 'usage'), { type: 'done', stopReason, content: [], refusal: { explanation: null } }]
      events.push({ type: 'done', stopReason, content })
      return events
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

export const retryable = (status: number) => status === 408 || status === 429 || status >= 500

export function retryAfterMs(response: Response): number | null {
  const value = response.headers.get('retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

/** The provider's error message from a JSON (or text) error body. */
export async function httpError(response: Response): Promise<OpenAiApiError> {
  let message = ''
  try {
    const text = await response.text()
    try {
      const body = JSON.parse(text) as unknown
      const error = isPlainObject(body) ? body.error : null
      const errors = isPlainObject(body) && Array.isArray(body.errors) ? body.errors : null
      if (isPlainObject(error)) {
        message = typeof error.message === 'string' ? error.message : ''
        // OpenRouter puts the upstream provider's message in metadata.raw.
        const raw = isPlainObject(error.metadata) ? error.metadata.raw : undefined
        if (typeof raw === 'string' && raw && !message.includes(raw)) message = `${message} (${raw.slice(0, 300)})`
      } else if (typeof error === 'string') {
        message = error
      } else if (errors && isPlainObject(errors[0]) && typeof errors[0].message === 'string') {
        // Cloudflare's API: { success: false, errors: [{ code, message }] }.
        message = errors[0].message
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

/** An adapter error as an `error` event with the provider's message. */
export function describeOpenAiError(error: unknown, options: { label: string; keyHint: string; model: string }): Extract<AiModelEvent, { type: 'error' }> {
  const { label, keyHint, model } = options
  if (error instanceof OpenAiApiError) {
    const detail = error.message ? `: ${error.message.trim().replace(/\.$/, '')}` : ''
    if (error.kind === 'timeout') return { type: 'error', code: 'api_error', message: `${label} did not answer in time${detail}. Try again.` }
    if (error.kind === 'network') return { type: 'error', code: 'api_error', message: `Could not reach ${label}${detail}.` }
    switch (error.status) {
      case 401:
        return { type: 'error', code: 'auth', message: `${label} rejected the API key (401)${detail}. ${keyHint}` }
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

/** `${base}/chat/completions`, unless the base already is the full URL. */
export function chatCompletionsUrl(baseURL: string): string {
  const base = baseURL.trim().replace(/\/+$/, '')
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

/** A trimmed value, or undefined when empty. */
export const clean = (value: string | null | undefined): string | undefined => (value?.trim() ? value.trim() : undefined)

export const bearer = (key: string) => `Bearer ${key}`

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/** An adapter for any Chat Completions API that streams in the OpenAI format. */
export function createOpenAIFormatAdapter(options: OpenAIFormatAdapterOptions): AiAdapter {
  const doFetch = options.fetch ?? fetch
  const wait = options.sleep ?? sleep
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const idleMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
  const maxRetries = options.maxRetries ?? 2
  const baseDelay = options.retryDelayMs ?? 1000
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...options.authHeaders, ...options.headers }
  let includeUsage = options.includeUsage ?? true

  /** One HTTP attempt. The returned controller also stops the body read (idle timeout, abort). */
  const attempt = async (body: Record<string, unknown>, signal?: AbortSignal) => {
    if (signal?.aborted) throw abortError()
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
      const response = await doFetch(options.url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
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
  const send = async (request: AiModelRequest) => {
    const tools = chatTools(request.tools)
    for (let retry = 0; ; retry++) {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: toChatMessages(request.system, request.messages, { cacheControl: options.cacheControl }),
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        stream: true,
        ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...options.extraBody?.(request),
      }
      let failure: OpenAiApiError
      try {
        const sent = await attempt(body, request.signal)
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
      await wait(Math.min(MAX_RETRY_DELAY_MS, failure.retryAfterMs ?? baseDelay * 2 ** retry), request.signal)
    }
  }

  const describe = (error: unknown) => describeOpenAiError(error, options)

  return {
    name: options.name,
    label: options.label,
    model: options.model,
    ready: options.ready ?? true,
    setupProblem: options.setupProblem ?? null,
    keyEnv: options.keyEnv ?? null,
    keyUrl: options.keyUrl ?? null,
    async *stream(request) {
      // Missing key or config: say what to set, without a network call.
      if (options.ready === false) {
        yield { type: 'error', code: 'auth', message: options.setupProblem || `${options.label} is not set up.` }
        return
      }
      let sent: Awaited<ReturnType<typeof send>>
      try {
        sent = await send(request)
      } catch (error) {
        yield describe(error)
        return
      }
      const { response, controller, cleanup } = sent
      const queue: AiModelEvent[] = []
      const accumulator = createAccumulator((event) => queue.push(event))
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
      let failure: unknown = null
      try {
        resetIdle()
        while (!accumulator.done) {
          const { done, value } = await reader.read()
          if (done) break
          resetIdle()
          parser.push(decoder.decode(value, { stream: true }))
          while (queue.length > 0) yield queue.shift() as AiModelEvent
        }
        parser.push(decoder.decode())
        parser.end()
      } catch (error) {
        if (request.signal?.aborted) failure = abortError()
        else if (idleTimedOut) failure = new OpenAiApiError(`the stream stalled for ${Math.round(idleMs / 1000)} seconds`, { kind: 'timeout' })
        else failure = new OpenAiApiError(error instanceof Error ? error.message : String(error), { kind: 'network' })
      } finally {
        clearTimeout(idle)
        cleanup()
        // Stop the download when the loop ended early ([DONE] seen, error, abort).
        reader.cancel().catch(() => {})
      }
      if (failure) {
        yield describe(failure)
        return
      }
      yield* queue
      let closing: AiModelEvent[]
      try {
        closing = accumulator.result()
      } catch (error) {
        yield describe(error)
        return
      }
      yield* closing
    },
  }
}

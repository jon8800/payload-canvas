// Test data for the OpenAI-format adapters: a fake `fetch` that answers Chat Completions requests,
// and "recorded" SSE streams modelled on what real providers send. Tests only.

type AnyRecord = Record<string, unknown>

// ---------------------------------------------------------------------------
// Fake fetch
// ---------------------------------------------------------------------------

/** A scripted model reply, streamed as Chat Completions chunks. */
export type ChatReply = {
  /** Reasoning text (the `reasoning` delta field). */
  reasoning?: string
  text?: string
  toolCalls?: Array<{ id: string; name: string; input: unknown }>
  /** Default: "tool_calls" when there are tool calls, else "stop". */
  finish?: string
  usage?: AnyRecord
}

/** A Chat Completions request body as the fake sees it. */
export type FakeChatBody = { model: string; messages: Array<Record<string, any>>; [key: string]: unknown }

/**
 * One scripted response of the fake fetch:
 * - a ChatReply: streamed as chunks (text, reasoning, tool calls in fragments);
 * - `{ status, body }`: an HTTP error with a JSON body (`rawBody`: a text body instead);
 * - `{ sse }`: raw body chunks, sent as they are (`stall`: then wait until the request aborts);
 * - `{ noBody }`: a 200 response without a body;
 * - `{ hang }`: fetch never answers until the request aborts;
 * - an Error: fetch rejects with it (a network error);
 * - a function of the request body that returns one of these.
 */
export type FakeChatStep =
  | ChatReply
  | { status: number; body?: unknown; rawBody?: string; headers?: Record<string, string> }
  | { sse: string[]; stall?: boolean }
  | { noBody: true }
  | { hang: true }
  | Error
  | ((body: FakeChatBody) => FakeChatStep)

export type FakeChatCall = { url: string; headers: Record<string, string>; body: FakeChatBody }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const abortError = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })

/** Splits text into chunks of `size` characters, like streamed tokens. */
export function pieces(text: string, size = 12): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

/** One SSE frame with a Chat Completions chunk. */
export function sseFrame(delta: AnyRecord, finish: string | null = null, extra: AnyRecord = {}): string {
  return `data: ${JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`
}

/** The usage-only chunk some servers send after the finish chunk. */
export function usageFrame(usage: AnyRecord): string {
  return `data: ${JSON.stringify({ id: 'chatcmpl-fake', choices: [], usage })}\n\n`
}

export const DONE_FRAME = 'data: [DONE]\n\n'

/** A tool call delta: the first fragment has id and name, later fragments only arguments. */
export const callStart = (index: number, id: string, name: string, args = '') => ({ index, id, type: 'function', function: { name, arguments: args } })
export const callPart = (index: number, args: string) => ({ index, function: { arguments: args } })

/** Chat Completions SSE frames for a scripted reply. Tool arguments arrive in 7-character fragments. */
export function chatChunks(reply: ChatReply): string[] {
  const out = [sseFrame({ role: 'assistant', content: '' })]
  if (reply.reasoning) out.push(sseFrame({ reasoning: reply.reasoning }))
  for (const text of pieces(reply.text ?? '')) out.push(sseFrame({ content: text }))
  const calls = reply.toolCalls ?? []
  calls.forEach((call, index) => {
    out.push(sseFrame({ tool_calls: [callStart(index, call.id, call.name)] }))
    for (const part of pieces(JSON.stringify(call.input), 7)) out.push(sseFrame({ tool_calls: [callPart(index, part)] }))
  })
  out.push(sseFrame({}, reply.finish ?? (calls.length > 0 ? 'tool_calls' : 'stop')))
  out.push(usageFrame(reply.usage ?? { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }))
  out.push(DONE_FRAME)
  return out
}

/** A fetch that answers each request with the next scripted step. `calls` records url, headers and body. */
export function createFakeChatFetch(steps: FakeChatStep[] | ((body: FakeChatBody, call: number) => FakeChatStep), options: { delayMs?: number } = {}) {
  const calls: FakeChatCall[] = []
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}')) as FakeChatBody
    calls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) }, body })
    const index = calls.length - 1
    let step = typeof steps === 'function' ? steps(body, index) : steps[index]
    while (typeof step === 'function') step = step(body)
    if (!step) throw new Error(`Fake fetch: no scripted step for call ${index}`)
    if (step instanceof Error) throw step
    const signal = init?.signal ?? undefined
    if (signal?.aborted) throw abortError()
    if ('hang' in step) {
      await new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(abortError()), { once: true }))
    }
    if ('noBody' in step) return new Response(null, { status: 200 })
    if ('status' in step) {
      const text = step.rawBody ?? (step.body === undefined ? null : JSON.stringify(step.body))
      return new Response(text, { status: step.status, headers: { 'content-type': step.rawBody === undefined ? 'application/json' : 'text/plain', ...step.headers } })
    }
    const stall = 'sse' in step && step.stall === true
    const frames = 'sse' in step ? step.sse : chatChunks(step as ChatReply)
    const encoder = new TextEncoder()
    let i = 0
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (options.delayMs) await wait(options.delayMs)
        if (signal?.aborted) return controller.error(abortError())
        if (i >= frames.length) {
          if (!stall) return controller.close()
          // Stalled: no more data until the request aborts.
          await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }))
          return controller.error(abortError())
        }
        controller.enqueue(encoder.encode(frames[i++]))
      },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  return { fetch: fakeFetch as typeof fetch, calls }
}

// ---------------------------------------------------------------------------
// Recorded streams
// ---------------------------------------------------------------------------

const GEN = 'gen-1759663200-Xq3vH7kYtNf2LmZpA9Rc'

/** One chunk as OpenRouter sends it (with its extra fields). */
function orChunk(delta: AnyRecord, finish: string | null = null): string {
  const chunk = {
    id: GEN,
    provider: 'Anthropic',
    model: 'anthropic/claude-sonnet-4.5',
    object: 'chat.completion.chunk',
    created: 1759663201,
    choices: [{ index: 0, delta, finish_reason: finish, native_finish_reason: finish }],
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

const thinking = (text: string) => ({ type: 'reasoning.text', text, format: 'anthropic-claude-v1', index: 0 })

/**
 * OpenRouter, Anthropic model: processing comments, reasoning with `reasoning_details` (text pieces
 * and a signature), a text delta, a tool call split in fragments, a finish chunk, a usage chunk
 * with `cost` and cached tokens, then [DONE].
 */
export const OPENROUTER_STREAM: string[] = [
  ': OPENROUTER PROCESSING\n\n',
  ': OPENROUTER PROCESSING\n\n',
  orChunk({ role: 'assistant', content: '', reasoning: 'The user wants ', reasoning_details: [thinking('The user wants ')] }),
  orChunk({ role: 'assistant', content: '', reasoning: 'a hero section.', reasoning_details: [thinking('a hero section.')] }),
  orChunk({
    role: 'assistant',
    content: '',
    reasoning: '',
    reasoning_details: [{ type: 'reasoning.text', text: '', signature: 'EqQBCkYIBxgCKkD', format: 'anthropic-claude-v1', index: 0 }],
  }),
  orChunk({ role: 'assistant', content: "I'll add a hero " }),
  orChunk({ role: 'assistant', content: 'section at the top.' }),
  orChunk({ role: 'assistant', content: '', tool_calls: [callStart(0, 'toolu_01A09q90qw90lq917835lq9', 'insertSection')] }),
  orChunk({ role: 'assistant', content: '', tool_calls: [callPart(0, '{"sectionId"')] }),
  orChunk({ role: 'assistant', content: '', tool_calls: [callPart(0, ':"hero","in')] }),
  orChunk({ role: 'assistant', content: '', tool_calls: [callPart(0, 'dex":0}')] }),
  orChunk({ role: 'assistant', content: '' }, 'tool_calls'),
  `data: ${JSON.stringify({
    id: GEN,
    provider: 'Anthropic',
    model: 'anthropic/claude-sonnet-4.5',
    object: 'chat.completion.chunk',
    created: 1759663201,
    choices: [],
    usage: {
      prompt_tokens: 5231,
      completion_tokens: 142,
      total_tokens: 5373,
      cost: 0.0043815,
      is_byok: false,
      prompt_tokens_details: { cached_tokens: 4980, audio_tokens: 0 },
      cost_details: { upstream_inference_cost: null },
      completion_tokens_details: { reasoning_tokens: 64, image_tokens: 0 },
    },
  })}\n\n`,
  DONE_FRAME,
]

/** What the OpenRouter stream must produce. */
export const OPENROUTER_EXPECTED = {
  reasoning: 'The user wants a hero section.',
  details: [{ type: 'reasoning.text', text: 'The user wants a hero section.', format: 'anthropic-claude-v1', index: 0, signature: 'EqQBCkYIBxgCKkD' }],
  text: "I'll add a hero section at the top.",
  call: { id: 'toolu_01A09q90qw90lq917835lq9', name: 'insertSection', input: { sectionId: 'hero', index: 0 } },
  usage: { inputTokens: 5231, outputTokens: 142, cachedTokens: 4980, cost: 0.0043815 },
}

/**
 * Cloudflare Workers AI (OpenAI format): a role chunk, a tool call with the whole arguments in
 * one chunk, a finish chunk and a usage chunk. Workers AI sends the call id and name together with
 * the full arguments.
 */
export const WORKERS_AI_STREAM: string[] = [
  `data: ${JSON.stringify({ id: 'id-1759663210', object: 'chat.completion.chunk', created: 1759663210, model: '@cf/zai-org/glm-4.7-flash', choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`,
  `data: ${JSON.stringify({ id: 'id-1759663210', object: 'chat.completion.chunk', created: 1759663210, model: '@cf/zai-org/glm-4.7-flash', choices: [{ index: 0, delta: { content: 'Looking at the page.' }, finish_reason: null }] })}\n\n`,
  `data: ${JSON.stringify({
    id: 'id-1759663210',
    object: 'chat.completion.chunk',
    created: 1759663210,
    model: '@cf/zai-org/glm-4.7-flash',
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index: 0, id: 'chatcmpl-tool-8f2c1d9a7b3e4c5f', type: 'function', function: { name: 'findBlocks', arguments: '{"type":"heading"}' } }] },
        finish_reason: null,
      },
    ],
  })}\n\n`,
  `data: ${JSON.stringify({ id: 'id-1759663210', object: 'chat.completion.chunk', created: 1759663210, model: '@cf/zai-org/glm-4.7-flash', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`,
  `data: ${JSON.stringify({ id: 'id-1759663210', object: 'chat.completion.chunk', created: 1759663210, model: '@cf/zai-org/glm-4.7-flash', choices: [], usage: { prompt_tokens: 812, completion_tokens: 37, total_tokens: 849 } })}\n\n`,
  DONE_FRAME,
]

/** What the Workers AI stream must produce. */
export const WORKERS_AI_EXPECTED = {
  text: 'Looking at the page.',
  call: { id: 'chatcmpl-tool-8f2c1d9a7b3e4c5f', name: 'findBlocks', input: { type: 'heading' } },
  usage: { inputTokens: 812, outputTokens: 37 },
}

/** A stream that fails in the middle: some text, then an error chunk (OpenRouter and others send it with status 200). */
export const IN_STREAM_ERROR_STREAM: string[] = [
  ': OPENROUTER PROCESSING\n\n',
  orChunk({ role: 'assistant', content: 'Let me ' }),
  `data: ${JSON.stringify({
    id: GEN,
    provider: 'Anthropic',
    model: 'anthropic/claude-sonnet-4.5',
    error: { code: 502, message: 'Network connection lost.' },
    choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: 'error', native_finish_reason: 'error' }],
  })}\n\n`,
  DONE_FRAME,
]

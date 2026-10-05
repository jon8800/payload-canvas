// Any server that speaks the OpenAI Chat Completions format, as an AiAdapter: OpenAI, Groq,
// Together, Ollama, LM Studio, vLLM, …
//
//   import { openAICompatibleAdapter } from '@payload-toolkit/builder/ai/openai-compatible'
//   ai: {
//     adapter: openAICompatibleAdapter({
//       baseURL: 'https://api.groq.com/openai/v1',
//       apiKey: process.env.GROQ_API_KEY,
//       model: 'openai/gpt-oss-120b',
//     }),
//   }

import { bearer, chatCompletionsUrl, clean, createOpenAIFormatAdapter, type OpenAIFormatTransportOptions } from '../openai-format'
import type { AiAdapter } from '../types'

export type OpenAICompatibleAdapterOptions = OpenAIFormatTransportOptions & {
  /** e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1". `/chat/completions` is added unless the URL ends with it. */
  baseURL?: string | null
  /** The model id in the server's naming. Required. */
  model?: string | null
  /** Sent as `Authorization: Bearer …`. Leave it out for local servers (Ollama, LM Studio). */
  apiKey?: string | null
  /** Short id for the chat identity. Default "openai-compatible". */
  name?: string
  /** Shown in the panel. Default: the host of `baseURL`. */
  label?: string
  /** The env var that holds the key, for the setup card. */
  keyEnv?: string
  /** Send `ai.effort` as `reasoning_effort` (OpenAI and Groq reasoning models). "xhigh" and "max" become "high". */
  reasoningEffort?: boolean
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function openAICompatibleAdapter(options: OpenAICompatibleAdapterOptions = {}): AiAdapter {
  const { baseURL: rawBase, model: rawModel, apiKey: rawKey, name, label, keyEnv, reasoningEffort, ...transport } = options
  const baseURL = clean(rawBase) ?? ''
  const model = clean(rawModel) ?? ''
  const key = clean(rawKey)
  const host = hostOf(baseURL)
  let setupProblem: string | null = null
  if (!host) setupProblem = 'Set baseURL to the API base URL, for example https://api.openai.com/v1.'
  else if (!model) setupProblem = `Set the model for ${host}.`
  return createOpenAIFormatAdapter({
    ...transport,
    name: name ?? 'openai-compatible',
    label: label ?? host ?? 'OpenAI-compatible API',
    model,
    url: chatCompletionsUrl(baseURL),
    // No key is fine for local servers: a 401 then says what to set.
    authHeaders: key ? { Authorization: bearer(key) } : {},
    ready: setupProblem === null,
    setupProblem,
    keyEnv: keyEnv ?? null,
    keyHint: `Check the API key${keyEnv ? ` in ${keyEnv}` : ''} and restart the server.`,
    extraBody: ({ effort }) =>
      reasoningEffort && effort ? { reasoning_effort: effort === 'max' || effort === 'xhigh' ? 'high' : effort } : undefined,
  })
}

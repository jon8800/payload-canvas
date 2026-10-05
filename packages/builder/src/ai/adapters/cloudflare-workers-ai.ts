// Cloudflare Workers AI as an AiAdapter: models that run on Cloudflare's network, through the
// OpenAI-compatible REST endpoint
//   https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions
// Only models with function calling work (the assistant edits through tool calls), for example
// "@cf/zai-org/glm-4.7-flash", "@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast".
//
//   import { cloudflareWorkersAIAdapter } from '@payload-toolkit/builder/ai/cloudflare-workers-ai'
//   ai: {
//     adapter: cloudflareWorkersAIAdapter({
//       accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
//       apiToken: process.env.CLOUDFLARE_API_TOKEN,
//     }),
//   }

import { bearer, clean, createOpenAIFormatAdapter, type OpenAIFormatTransportOptions } from '../openai-format'
import type { AiAdapter } from '../types'

export const WORKERS_AI_DEFAULT_MODEL = '@cf/zai-org/glm-4.7-flash'
export const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4'

export type CloudflareWorkersAIAdapterOptions = OpenAIFormatTransportOptions & {
  /** Cloudflare account id. */
  accountId?: string | null
  /** A Cloudflare API token with the Workers AI permission. */
  apiToken?: string | null
  /** A Workers AI model with function calling. Default "@cf/zai-org/glm-4.7-flash". */
  model?: string | null
  /** Route the requests through this AI Gateway (`cf-aig-gateway-id`) for logs, caching and limits. */
  gatewayId?: string | null
}

export function cloudflareWorkersAIAdapter(options: CloudflareWorkersAIAdapterOptions = {}): AiAdapter {
  const { accountId: rawAccount, apiToken: rawToken, model: rawModel, gatewayId: rawGateway, ...transport } = options
  const accountId = clean(rawAccount)
  const token = clean(rawToken)
  const gatewayId = clean(rawGateway)
  const model = clean(rawModel) ?? WORKERS_AI_DEFAULT_MODEL
  const keyHint = 'Set CLOUDFLARE_API_TOKEN (an API token with the Workers AI permission) in .env and restart the server.'
  let setupProblem: string | null = null
  if (!accountId) setupProblem = 'Set the Cloudflare account id (CLOUDFLARE_ACCOUNT_ID in .env).'
  else if (!token) setupProblem = `No Cloudflare API token. ${keyHint}`
  return createOpenAIFormatAdapter({
    ...transport,
    name: 'cloudflare-workers-ai',
    label: 'Cloudflare Workers AI',
    model,
    url: `${CLOUDFLARE_API_URL}/accounts/${encodeURIComponent(accountId ?? '')}/ai/v1/chat/completions`,
    authHeaders: {
      ...(token ? { Authorization: bearer(token) } : {}),
      ...(gatewayId ? { 'cf-aig-gateway-id': gatewayId } : {}),
    },
    ready: setupProblem === null,
    setupProblem,
    keyEnv: 'CLOUDFLARE_API_TOKEN',
    keyUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    keyHint,
  })
}

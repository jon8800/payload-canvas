// Cloudflare AI Gateway as an AiAdapter. The gateway forwards each request to the provider named
// in the model id ("openai/gpt-5.2", "anthropic/claude-4-5-sonnet", "workers-ai/@cf/…"), with
// logs, caching, rate limits and spend limits. Uses the gateway's OpenAI-compatible endpoint.
//
//   import { cloudflareGatewayAdapter } from '@payload-toolkit/builder/ai/cloudflare-gateway'
//   ai: {
//     adapter: cloudflareGatewayAdapter({
//       accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
//       gatewayId: process.env.CLOUDFLARE_AI_GATEWAY_ID,
//       gatewayToken: process.env.CF_AIG_TOKEN,
//       model: 'openai/gpt-5.2',
//     }),
//   }

import { bearer, clean, createOpenAIFormatAdapter, type OpenAIFormatTransportOptions } from '../openai-format'
import type { AiAdapter } from '../types'

export const CLOUDFLARE_GATEWAY_URL = 'https://gateway.ai.cloudflare.com/v1'

export type CloudflareGatewayAdapterOptions = OpenAIFormatTransportOptions & {
  /** Cloudflare account id. */
  accountId?: string | null
  /** AI Gateway id (name). */
  gatewayId?: string | null
  /** `provider/model`, e.g. "openai/gpt-5.2" or "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast". Required. */
  model?: string | null
  /**
   * Gateway token, sent as `cf-aig-authorization`. Needed for authenticated gateways, stored
   * provider keys (BYOK) and unified billing (Cloudflare bills the provider usage).
   */
  gatewayToken?: string | null
  /** A provider key (e.g. an OpenAI key), sent as `Authorization`. Leave it out with stored keys or unified billing. */
  apiKey?: string | null
  /** Replaces the endpoint URL. Default `${CLOUDFLARE_GATEWAY_URL}/{accountId}/{gatewayId}/compat/chat/completions`. */
  url?: string
}

export function cloudflareGatewayAdapter(options: CloudflareGatewayAdapterOptions = {}): AiAdapter {
  const { accountId: rawAccount, gatewayId: rawGateway, model: rawModel, gatewayToken: rawToken, apiKey: rawKey, url, ...transport } = options
  const accountId = clean(rawAccount)
  const gatewayId = clean(rawGateway)
  const model = clean(rawModel) ?? ''
  const token = clean(rawToken)
  const key = clean(rawKey)
  const keyHint =
    'Set CF_AIG_TOKEN (the gateway token, for stored provider keys or unified billing) and/or a provider key in .env and restart the server.'
  let setupProblem: string | null = null
  if (!accountId || !gatewayId) setupProblem = 'Set the Cloudflare account id and gateway id (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_GATEWAY_ID in .env).'
  else if (!model) setupProblem = 'Set the model for Cloudflare AI Gateway, for example "openai/gpt-5.2".'
  else if (!token && !key) setupProblem = `No Cloudflare AI Gateway credentials. ${keyHint}`
  return createOpenAIFormatAdapter({
    ...transport,
    name: 'cloudflare-gateway',
    label: 'Cloudflare AI Gateway',
    model,
    url: url ?? `${CLOUDFLARE_GATEWAY_URL}/${encodeURIComponent(accountId ?? '')}/${encodeURIComponent(gatewayId ?? '')}/compat/chat/completions`,
    authHeaders: {
      ...(key ? { Authorization: bearer(key) } : {}),
      ...(token ? { 'cf-aig-authorization': bearer(token) } : {}),
    },
    ready: setupProblem === null,
    setupProblem,
    keyEnv: 'CF_AIG_TOKEN',
    keyUrl: 'https://dash.cloudflare.com/?to=/:account/ai/ai-gateway',
    keyHint,
  })
}

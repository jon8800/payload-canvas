# AI adapters for the editor assistant

The **Assistant** panel in the page builder talks to one model API on your server. An **adapter** makes that connection. You pick it in `payload.config.ts`, the same way you pick a database or storage adapter in Payload:

```ts
import { openRouterAdapter } from '@payload-toolkit/builder/ai/openrouter'

websiteBuilder({
  // ...
  ai: { adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }) },
})
```

Each adapter has its own import path. Your site loads only the adapter you import.

| Adapter | Import | What it is |
|---|---|---|
| `openRouterAdapter` | `@payload-toolkit/builder/ai/openrouter` | One key for hundreds of models (OpenAI, Google, Anthropic, DeepSeek, …). Easiest start. |
| `cloudflareGatewayAdapter` | `@payload-toolkit/builder/ai/cloudflare-gateway` | Cloudflare AI Gateway in front of many providers: logs, caching, rate limits, spend limits, unified billing. |
| `cloudflareWorkersAIAdapter` | `@payload-toolkit/builder/ai/cloudflare-workers-ai` | Models that run on Cloudflare's network (Workers AI). |
| `openAICompatibleAdapter` | `@payload-toolkit/builder/ai/openai-compatible` | Any server that speaks the OpenAI Chat Completions format: OpenAI, Groq, Together, Ollama, LM Studio, vLLM. |
| `anthropicAdapter` | `@payload-toolkit/builder/ai/anthropic` | The Anthropic Messages API, with prompt caching and adaptive thinking. Needs the `@anthropic-ai/sdk` package. |
| `fakeAdapter` | `@payload-toolkit/builder/ai/fake` | A scripted model for tests and demos. No network, no cost. |

The first four need no extra package: they call the API with `fetch` and read the streamed reply themselves.

The plugin reads no environment variables for the assistant. Your config code passes the keys to the adapter, so you choose the variable names. Without an adapter, or when the adapter has no key, the panel shows a setup card that says what to set.

No API key at all? Use Claude Code or Codex with your Claude or ChatGPT plan. See [connect-claude-code-and-codex.md](connect-claude-code-and-codex.md).

Image generation has its own adapter (`ai.images`), separate from the chat model. See [images.md](images.md).

To write your own adapter, see the README, [Write your own adapter](../../packages/builder/README.md#write-your-own-adapter).

## Options for every OpenAI-format adapter

OpenRouter, both Cloudflare adapters and `openAICompatibleAdapter` also take these options:

| Option | Default | What it does |
|---|---|---|
| `maxTokens` | not sent | Output limit per model call, sent as `max_tokens`. |
| `headers` | none | Extra request headers. |
| `timeoutMs` | `60000` | Time to wait for the response to start. |
| `idleTimeoutMs` | `120000` | Time to wait between two stream chunks. |
| `maxRetries` | `2` | Retries on 408, 429, 5xx and network errors, before the stream starts. |
| `retryDelayMs` | `1000` | First retry delay. It doubles each time. A `Retry-After` header wins (up to 20 seconds). |

## OpenRouter

1. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys) and add credit.
2. Put it in `.env`:

   ```bash
   OPENROUTER_API_KEY=sk-or-v1-...
   ```

3. Add the adapter and restart the server:

   ```ts
   import { openRouterAdapter } from '@payload-toolkit/builder/ai/openrouter'

   ai: {
     adapter: openRouterAdapter({
       apiKey: process.env.OPENROUTER_API_KEY,
       model: 'google/gemini-3.8-flash', // default: openai/gpt-6-luna
       siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
     }),
   }
   ```

| Option | Default | What it does |
|---|---|---|
| `apiKey` | none | The OpenRouter key. Without it the panel shows the setup card. |
| `model` | `openai/gpt-6-luna` | The model id on OpenRouter. |
| `siteUrl` | none | Sent as `HTTP-Referer`, so the app shows up in your OpenRouter activity. |
| `appTitle` | `Payload Website Builder` | Sent as `X-Title`. |
| `baseURL` | `https://openrouter.ai/api/v1` | Change it only for a proxy. |

- `ai.effort` is sent as `reasoning.effort` (`max` becomes `xhigh`). Leave it out to use the model's default.
- For `anthropic/…` and `google/…` models, the system prompt carries a `cache_control` breakpoint, so repeat requests read it from the cache. Other models cache on their own or not at all.
- Reasoning text from reasoning models is kept in the chat history and sent back, as OpenRouter asks. The panel does not show it.

### Cheap models that call tools well

The assistant works through tool calls, so the model must support them. These were on [openrouter.ai/models](https://openrouter.ai/models?supported_parameters=tools) in October 2026 (US dollars per million tokens, input / output):

| Model id | Price | Notes |
|---|---|---|
| `openai/gpt-6-luna` | $0.10 / $0.50 | The default. Cheapest good choice. |
| `z-ai/glm-5.3-flash` | $0.15 / $0.50 | Cheap, supports parallel tool calls. |
| `google/gemini-3.8-flash` | $0.75 / $3.75 | Better layouts and copy. Still cheap. |
| `anthropic/claude-sonnet-5.5` | $2 / $10 | Best results of this list. |

Prices change. Check the model page before you pick. A typical request ("add a pricing section") makes two to four model calls with about 10,000 to 20,000 input tokens each. With `openai/gpt-6-luna` that is well under one US cent.

## Cloudflare AI Gateway

The gateway forwards each request to the provider in the model id. The adapter uses the gateway's OpenAI-compatible endpoint:

```
https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat/chat/completions
```

Model ids are `provider/model`, for example `openai/gpt-5.2`, `anthropic/claude-4-5-sonnet`, `google/gemini-2.5-pro` or `workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast`. See Cloudflare's [OpenAI compatibility](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/) page for the list.

```ts
import { cloudflareGatewayAdapter } from '@payload-toolkit/builder/ai/cloudflare-gateway'

ai: {
  adapter: cloudflareGatewayAdapter({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: process.env.CLOUDFLARE_AI_GATEWAY_ID,
    gatewayToken: process.env.CF_AIG_TOKEN,
    model: 'openai/gpt-5.2',
  }),
}
```

| Option | What it does |
|---|---|
| `accountId`, `gatewayId` | Which gateway. Required. |
| `model` | `provider/model`. Required. |
| `gatewayToken` | The gateway token, sent as `cf-aig-authorization`. Needed for authenticated gateways, stored keys (BYOK) and unified billing. |
| `apiKey` | A provider key (for example an OpenAI key), sent as `Authorization`. Leave it out with stored keys or unified billing. |
| `url` | Replaces the endpoint URL. |

- **Unified billing:** Cloudflare pays the provider and bills you. Buy credits in the dashboard, then set only `gatewayToken`. It works for OpenAI, Anthropic, Google AI Studio, Vertex, xAI and Groq models.
- **Stored keys (BYOK):** store the provider key in the gateway, then set only `gatewayToken`.
- **Your own provider key:** set `apiKey`. Add `gatewayToken` too when the gateway is authenticated.
- Cloudflare now marks the `/compat` endpoint as deprecated for single-model requests, but it still serves multi-provider requests. If Cloudflare removes it, pass the new URL with `url`.

## Cloudflare Workers AI

Workers AI runs open models on Cloudflare's network. The adapter calls its OpenAI-compatible endpoint:

```
https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions
```

1. Create an API token with the **Workers AI** permission at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Add the adapter:

   ```ts
   import { cloudflareWorkersAIAdapter } from '@payload-toolkit/builder/ai/cloudflare-workers-ai'

   ai: {
     adapter: cloudflareWorkersAIAdapter({
       accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
       apiToken: process.env.CLOUDFLARE_API_TOKEN,
       model: '@cf/openai/gpt-oss-120b', // default: @cf/zai-org/glm-4.7-flash
     }),
   }
   ```

Only models with **function calling** work. Find them in the [model catalog](https://developers.cloudflare.com/workers-ai/models/) with the "Function calling" filter. These had it in October 2026 (US dollars per million tokens, input / output):

| Model id | Price | Notes |
|---|---|---|
| `@cf/zai-org/glm-4.7-flash` | about $0.06 / $0.40 | The default. Cheap, tool use confirmed. |
| `@cf/openai/gpt-oss-120b` | $0.35 / $0.75 | Stronger. |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.29 / $2.25 | Older, costs more for output. |

- `gatewayId` routes the requests through an AI Gateway (`cf-aig-gateway-id` header) for logs, caching and limits.
- Small models often fail at tool calls. If edits fail, try a larger model.

## Any OpenAI-compatible API

```ts
import { openAICompatibleAdapter } from '@payload-toolkit/builder/ai/openai-compatible'

ai: {
  adapter: openAICompatibleAdapter({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    model: 'openai/gpt-oss-120b',
  }),
}
```

Local models with Ollama (no key):

```ts
ai: { adapter: openAICompatibleAdapter({ baseURL: 'http://localhost:11434/v1', model: 'llama3.3' }) }
```

| Option | Default | What it does |
|---|---|---|
| `baseURL` | none | The API base URL. Required. The adapter appends `/chat/completions`, unless the URL already ends with it. |
| `model` | none | Required. |
| `apiKey` | none | Sent as `Authorization: Bearer …`. Without it no `Authorization` header is sent. |
| `label` | the host of `baseURL` | Shown in the panel. |
| `name` | `openai-compatible` | Part of the chat identity. Set it when you run two of these adapters. |
| `keyEnv` | none | The variable name the setup card shows after a rejected key. |
| `reasoningEffort` | `false` | Send `ai.effort` as `reasoning_effort` (OpenAI and Groq reasoning models). `xhigh` and `max` become `high`. |

- The model must support tool calling. Small local models often fail at it.
- The adapter asks for token usage with `stream_options`. A server that rejects it gets one retry without it.

## Anthropic

```bash
pnpm add @anthropic-ai/sdk
```

```ts
import { anthropicAdapter } from '@payload-toolkit/builder/ai/anthropic'

ai: { adapter: anthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }) }
```

| Option | Default | What it does |
|---|---|---|
| `apiKey` | the SDK's own lookup | Without it the SDK reads `ANTHROPIC_API_KEY` or an `ant auth login` profile. |
| `model` | `claude-opus-5-5` | The model id. |
| `maxTokens` | `32000` | Output limit per model call, thinking included. |
| `fallbacks` | on for `claude-opus-5-5` | When a safety classifier declines a request, the API retries it on Anthropic's recommended fallback model. |

When the fallback model takes over in the middle of a reply, the tool calls of the declining model never run. Their chips in the panel show "Not run".

This adapter uses prompt caching, adaptive thinking and `ai.effort` (default `medium`). Only this entry point loads `@anthropic-ai/sdk`, so other sites do not need the package.

## The fake adapter

```ts
import { fakeAdapter } from '@payload-toolkit/builder/ai/fake'

ai: { adapter: fakeAdapter() }
```

The scripted model lists the sections, inserts a hero section at the top of the page, changes its heading, and streams a few sentences. Use it to try the panel without a key. Never use it in production.

The starter turns it on with `BUILDER_AI_FAKE=1` in `apps/starter/.env`. The starter ignores the flag when `NODE_ENV=production`.

In tests, script each model call: `fakeAdapter({ steps: [{ content: [{ type: 'text', text: 'Hi.' }] }] })`.

## Moving from `ai.provider`

The `ai.provider` and `ai.model` options and the `BUILDER_AI_*` environment variables are gone. A config that still has `ai.provider` shows the setup card, and the card names the replacement.

| Before | After |
|---|---|
| `OPENROUTER_API_KEY` alone | `ai: { adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }) }` |
| `provider: { type: 'openrouter' }, model: 'x'` | `openRouterAdapter({ apiKey, model: 'x' })` |
| `provider: { type: 'cloudflare', accountId, gatewayId }` | `cloudflareGatewayAdapter({ accountId, gatewayId, gatewayToken, apiKey, model })` |
| `provider: { type: 'openai-compatible', baseURL }` | `openAICompatibleAdapter({ baseURL, apiKey, model })` |
| `provider: { type: 'anthropic' }`, `ai.apiKey`, `ai.maxTokens`, `ai.fallbacks` | `anthropicAdapter({ apiKey, model, maxTokens, fallbacks })` |
| `BUILDER_AI_FAKE=1` in the plugin | `fakeAdapter()`, picked in your config |

Changing the adapter or the model starts a new chat in the panel.

## How it behaves

- **Same tools, same prompt.** Every adapter gets the same tools, system prompt and editor context. OpenAI-format adapters send a flatter `applyOperations` schema, which smaller models handle better.
- **Repairs.** Smaller models make small mistakes: operations sent as a JSON string, `op` instead of `type`, `parentId: "root"`. The tool fixes these, applies the change, and tells the model what it fixed. Arguments that are not valid JSON are not run; the model gets the parse error and tries again.
- **Retries.** OpenAI-format adapters retry 408, 429 and 5xx responses and network errors twice, after 1 and 2 seconds, or after the time in `Retry-After` (up to 20 seconds).
- **Timeouts.** 60 seconds for the response to start, then 120 seconds between two stream chunks.
- **Stop.** The Stop button cancels the request. OpenRouter stops billing for most providers when the stream is cancelled.
- **Tool chips.** Every tool call the panel shows as running gets a final state: done, failed, or "Not run" (grey, dashed). "Not run" means the call never ran: the model dropped it, declined the request, or the reply was stopped or failed first. The server sends this state as `tool` events with `status: 'cancelled'`. If the stream breaks off, the panel marks the reply's running chips "Not run" itself.
- **Errors.** A rejected key (401) shows the setup card with the provider's message. Other errors show the provider's message, for example "No endpoints found that support tool use" for a model without tools.
- **Switching adapter or model** starts a new chat in the panel. Chat history from one adapter cannot be replayed on another.

## Privacy

The page content goes to the provider you pick: the layout JSON (all text, classes and media IDs), the conversation, media search results and, for templates, a summary of the sample document. With OpenRouter or Cloudflare, it also passes through their service. Check each provider's data policy. OpenRouter lets you restrict routing to providers that do not train on your data.

# AI providers for the editor assistant

The **Assistant** panel in the page builder talks to one model API on your server. You pick the API with the plugin option `ai.provider`, or with environment variables. Four choices:

| Provider | What it is | Key |
|---|---|---|
| `openrouter` | One key for hundreds of models (OpenAI, Google, Anthropic, DeepSeek, …). Easiest start. | `OPENROUTER_API_KEY` |
| `cloudflare` | Cloudflare AI Gateway. Logs, caching, rate limits and spend limits in front of many providers. | `CF_AIG_TOKEN` and/or a provider key |
| `openai-compatible` | Any server that speaks the OpenAI Chat Completions format: OpenAI, Groq, Together, Ollama, LM Studio, vLLM. | `BUILDER_AI_API_KEY` (optional for local servers) |
| `anthropic` | The Anthropic Messages API, with prompt caching and adaptive thinking. Needs the `@anthropic-ai/sdk` package. | `ANTHROPIC_API_KEY` |

The first three need no extra package: the plugin calls them with `fetch` and reads the streamed reply itself.

No API key at all? Use Claude Code or Codex with your Claude or ChatGPT plan. See [connect-claude-code-and-codex.md](connect-claude-code-and-codex.md).

## Quick start: OpenRouter

1. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys) and add credit.
2. Put it in `.env`:

   ```bash
   OPENROUTER_API_KEY=sk-or-v1-...
   ```

3. Restart the server.

That is all. When only `OPENROUTER_API_KEY` is set, the plugin picks OpenRouter and the model `openai/gpt-6-luna`.

### Cheap models that call tools well

The assistant works through tool calls, so the model must support them. These were on [openrouter.ai/models](https://openrouter.ai/models?supported_parameters=tools) in October 2026 (US dollars per million tokens, input / output):

| Model id | Price | Notes |
|---|---|---|
| `openai/gpt-6-luna` | $0.10 / $0.50 | The default. Cheapest good choice. |
| `z-ai/glm-5.3-flash` | $0.15 / $0.50 | Cheap, supports parallel tool calls. |
| `google/gemini-3.8-flash` | $0.75 / $3.75 | Better layouts and copy. Still cheap. |
| `anthropic/claude-sonnet-5.5` | $2 / $10 | Best results of this list. |

Prices change. Check the model page before you pick. A typical request ("add a pricing section") makes two to four model calls with about 10,000 to 20,000 input tokens each. With `openai/gpt-6-luna` that is well under one US cent.

Pick a model with `BUILDER_AI_MODEL`:

```bash
BUILDER_AI_MODEL=google/gemini-3.8-flash
```

## Environment variables

The plugin reads these when `ai.provider` is not set in code. Values in code always win.

| Variable | What it does |
|---|---|
| `BUILDER_AI_PROVIDER` | `anthropic`, `openrouter`, `cloudflare` or `openai-compatible`. Default: `openrouter` when only `OPENROUTER_API_KEY` is set, else `anthropic`. |
| `BUILDER_AI_MODEL` | The model id in the provider's naming. |
| `BUILDER_AI_BASE_URL` | Base URL for `openai-compatible`, e.g. `https://api.openai.com/v1`. |
| `BUILDER_AI_API_KEY` | Key for `openai-compatible` (falls back to `OPENAI_API_KEY`), or the provider key behind Cloudflare. |
| `OPENROUTER_API_KEY` | OpenRouter key. |
| `ANTHROPIC_API_KEY` | Anthropic key. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID` | Which Cloudflare gateway to use. |
| `CF_AIG_TOKEN` | Cloudflare gateway token, sent as `cf-aig-authorization`. |
| `BUILDER_AI_FAKE=1` | Test only: a scripted model answers, with no network and no cost. Ignored in production. |

## OpenRouter

```ts
websiteBuilder({
  // ...
  ai: { provider: { type: 'openrouter' }, model: 'google/gemini-3.8-flash' },
})
```

- URL: `https://openrouter.ai/api/v1/chat/completions`.
- The plugin sends `HTTP-Referer` (your `serverURL`) and `X-Title: Payload Website Builder`, so the app shows up in your OpenRouter activity.
- `ai.effort` is sent as `reasoning.effort` (`max` becomes `xhigh`). Leave it out to use the model's default.
- Options: `apiKey` (a key in code), `apiKeyEnv` (another variable name).
- Reasoning text from reasoning models is kept in the chat history and sent back, as OpenRouter asks. The panel does not show it.

## Cloudflare AI Gateway

The gateway forwards each request to the provider in the model id. The plugin uses its OpenAI-compatible endpoint:

```
https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat/chat/completions
```

Model ids are `provider/model`, for example `openai/gpt-5.2`, `anthropic/claude-4-5-sonnet`, `google/gemini-2.5-pro` or `workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast`. See Cloudflare's [OpenAI compatibility](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/) page for the list.

```bash
BUILDER_AI_PROVIDER=cloudflare
BUILDER_AI_MODEL=openai/gpt-5.2
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_AI_GATEWAY_ID=my-gateway
CF_AIG_TOKEN=...          # gateway token: authenticated gateways, stored keys (BYOK), unified billing
BUILDER_AI_API_KEY=...    # only when the gateway does not store the provider key
```

Or in code:

```ts
ai: {
  provider: { type: 'cloudflare', accountId: '...', gatewayId: 'my-gateway' },
  model: 'openai/gpt-5.2',
}
```

- With stored keys (BYOK) or unified billing, set only `CF_AIG_TOKEN`. The plugin then sends no `Authorization` header.
- With your own provider key, set `BUILDER_AI_API_KEY`. Add `CF_AIG_TOKEN` too when the gateway is authenticated.
- Options: `apiKey`, `apiKeyEnv`, `gatewayToken`, `gatewayTokenEnv`.

## Any OpenAI-compatible API

```ts
ai: {
  provider: { type: 'openai-compatible', baseURL: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY' },
  model: 'openai/gpt-oss-120b',
}
```

Local models with Ollama (no key):

```bash
BUILDER_AI_PROVIDER=openai-compatible
BUILDER_AI_BASE_URL=http://localhost:11434/v1
BUILDER_AI_MODEL=llama3.3
```

- The plugin appends `/chat/completions` to the base URL, unless the URL already ends with it.
- `headers` adds request headers. `apiKey` / `apiKeyEnv` set the key; default `BUILDER_AI_API_KEY`, then `OPENAI_API_KEY`. Without a key, no `Authorization` header is sent.
- The model must support tool calling. Small local models often fail at it.
- The plugin asks for token usage with `stream_options`. A server that rejects it gets one retry without it.

## Anthropic

```bash
pnpm add @anthropic-ai/sdk
```

```bash
BUILDER_AI_PROVIDER=anthropic   # only needed when OPENROUTER_API_KEY is also set
ANTHROPIC_API_KEY=sk-ant-...
```

The default model is `claude-opus-5-5`. This path uses prompt caching, adaptive thinking, `effort` and the server-side refusal fallback. See the [README](../../packages/builder/README.md#ai-assistant) for the options.

## How it behaves

- **Same tools, same prompt.** All providers get the same tools, system prompt and editor context. OpenAI-compatible models get a flatter `applyOperations` schema, which smaller models handle better.
- **Repairs.** Smaller models make small mistakes: operations sent as a JSON string, `op` instead of `type`, `parentId: "root"`. The tool fixes these, applies the change, and tells the model what it fixed. Arguments that are not valid JSON are not run; the model gets the parse error and tries again.
- **Retries.** 408, 429 and 5xx responses and network errors are retried twice, after 1 and 2 seconds, or after the time in `Retry-After` (up to 20 seconds).
- **Timeouts.** 60 seconds for the response to start, then 120 seconds between two stream chunks.
- **Stop.** The Stop button cancels the request. OpenRouter stops billing for most providers when the stream is cancelled.
- **Errors.** A rejected key (401) shows the setup card with the provider's message. Other errors show the provider's message, for example "No endpoints found that support tool use" for a model without tools.
- **Switching provider or model** starts a new chat in the panel. Chat history from one provider cannot be replayed on another.

## Privacy

The page content goes to the provider you pick: the layout JSON (all text, classes and media IDs), the conversation, media search results and, for templates, a summary of the sample document. With OpenRouter or Cloudflare, it also passes through their service. Check each provider's data policy. OpenRouter lets you restrict routing to providers that do not train on your data.

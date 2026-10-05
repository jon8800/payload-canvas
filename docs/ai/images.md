# AI image generation

The builder can make new images from a text description. It saves each image in your media collection, with alt text. Three places use it:

- **The Assistant panel.** Ask "add a hero image of fresh coffee beans". The assistant calls the `generateImage` tool and puts the image in a block. The tool chip shows a thumbnail.
- **The inspector.** Every upload field gets a **Generate image** button. Type a description, pick an aspect ratio, and click **Generate**. The field gets the new image.
- **MCP clients** such as Claude Code or Codex. They call the `generateImage` tool. Your site makes the image with its own image adapter, so the client needs no image model.

## Turn it on

Image generation has its own adapter, next to the chat adapter:

```ts
import { openRouterAdapter } from '@payload-toolkit/builder/ai/openrouter'
import { openRouterImageAdapter } from '@payload-toolkit/builder/ai/images/openrouter'

websiteBuilder({
  // ...
  ai: {
    adapter: openRouterAdapter({ apiKey: process.env.OPENROUTER_API_KEY }),
    images: openRouterImageAdapter({ apiKey: process.env.OPENROUTER_API_KEY }),
  },
})
```

Restart the server after you change it. Without `ai.images`, the **Generate image** button stays hidden, and the `generateImage` tool tells the model what to set up.

`ai.images` works without `ai.adapter`. Then only the inspector and MCP clients generate images, and the Assistant panel shows its setup card.

## Why a separate adapter

A model that makes images in ChatGPT or Gemini apps does not return images through the plain chat API. The apps call a separate image model for you. Through the API, only **image-output models** return images, for example `black-forest-labs/flux.2-klein-4b` or `google/gemini-3.1-flash-image`. These models are poor at tool calls, so they cannot run the assistant.

So the chat model and the image model are two settings:

- The chat model plans the page and calls tools. It can be any model, also Claude Code or Codex over MCP.
- The image adapter draws the pictures. The chat model only writes the description.

The plugin does not reuse the chat adapter for images, even when its provider sells image models. An image model needs its own model id, and you choose it on purpose, because each image costs money.

## Adapters

| Adapter | Import | Default model | What it is |
|---|---|---|---|
| `openRouterImageAdapter` | `@payload-toolkit/builder/ai/images/openrouter` | `black-forest-labs/flux.2-klein-4b` | Every image model on OpenRouter with one key. Easiest start. |
| `openAIImageAdapter` | `@payload-toolkit/builder/ai/images/openai` | `gpt-image-2.5-flare` | The OpenAI Images API, and servers that copy it. |
| `cloudflareWorkersAIImageAdapter` | `@payload-toolkit/builder/ai/images/cloudflare-workers-ai` | `@cf/black-forest-labs/flux-2-klein-4b` | Image models on Cloudflare's network. |
| `fakeImageAdapter` | `@payload-toolkit/builder/ai/images/fake` | `gradient` | Draws a color gradient PNG locally. For tests and demos. No network, no cost. |

Every built-in adapter also takes `headers`, `timeoutMs` (default 120 seconds), `maxRetries` (default 1, for 408, 429, 5xx and network errors) and `retryDelayMs`.

### OpenRouter

The adapter calls OpenRouter's Images API, `POST https://openrouter.ai/api/v1/images`. One request shape works for every image model there. Before the first image, the adapter reads the model's parameters from `GET /api/v1/images/models`. Then it sends only the parameters the model has, and it maps the aspect ratio to the closest one the model supports.

```ts
openRouterImageAdapter({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: 'recraft/recraft-v4.1-flash', // default: black-forest-labs/flux.2-klein-4b
  siteUrl: process.env.NEXT_PUBLIC_SERVER_URL,
})
```

| Option | Default | What it does |
|---|---|---|
| `apiKey` | none | The OpenRouter key. Without it the adapter is not ready. |
| `model` | `black-forest-labs/flux.2-klein-4b` | An image model id. |
| `outputFormat` | the model's default | `png`, `jpeg` or `webp`, when the model takes it. |
| `resolution` | the model's default | For example `1K` or `2K`, when the model takes it. |
| `siteUrl`, `appTitle` | none, `Payload Website Builder` | Sent as `HTTP-Referer` and `X-Title`. |
| `extraBody` | none | Extra request fields, for example `{ provider: { sort: 'price' } }`. |

Cheap image models on OpenRouter in October 2026 (US dollars):

| Model id | Price | Notes |
|---|---|---|
| `black-forest-labs/flux.2-klein-4b` | $0.014 per megapixel | The default. Photo-real. We measured $0.015 and about 5 seconds per image. |
| `recraft/recraft-v4.1-flash` | $0.007 per image | Cheapest. Design and illustration style. Ratios: 1:1, 4:3, 3:4, 16:9, 9:16. |
| `bytedance-seed/seedream-5-0-flash` | $0.018 per image | Good with text inside images. |
| `google/gemini-3.1-flash-image` | about $0.07 per image | An image-and-text model. |

The full list: [openrouter.ai/models?output_modalities=image](https://openrouter.ai/models?output_modalities=image). Prices change. Check the model page before you pick.

The starter reads `OPENROUTER_IMAGE_MODEL` from `.env`.

### OpenAI

```ts
openAIImageAdapter({ apiKey: process.env.OPENAI_API_KEY, quality: 'medium' })
```

| Option | Default | What it does |
|---|---|---|
| `apiKey` | none | Needed for OpenAI itself. A local server may need none. |
| `model` | `gpt-image-2.5-flare` | `gpt-image-2.5-sunburst`, `gpt-image-2`, `gpt-image-1-mini`, … |
| `baseURL` | `https://api.openai.com/v1` | Any server with the same `/images/generations` API. |
| `quality` | not sent | `low`, `medium`, `high` or `auto`. Low costs much less. |
| `outputFormat` | not sent (PNG) | `png`, `jpeg` or `webp`. |
| `size` | see below | A function `(ratio, model) => 'WIDTHxHEIGHT' \| null` that replaces the size mapping. |

`gpt-image-2` and newer take any size in steps of 16 pixels: the adapter sends a long edge of 1536 pixels, for example `1536x864` for 16:9. Older models take only `1024x1024`, `1536x1024` and `1024x1536`: the adapter picks the closest.

### Cloudflare Workers AI

```ts
cloudflareWorkersAIImageAdapter({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
})
```

The adapter calls `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}`. The models differ, and the adapter handles each kind:

- FLUX.2 models (`@cf/black-forest-labs/flux-2-klein-4b`, `flux-2-klein-9b`, `flux-2-dev`) get a multipart form with the size.
- `@cf/black-forest-labs/flux-1-schnell` gets only the prompt. It always makes a square image.
- Other models (`@cf/leonardo/lucid-origin`, `@cf/leonardo/phoenix-1.0`, Stable Diffusion) get JSON with the size.
- The adapter reads both answer kinds: JSON with base64 data, or the image bytes.

| Option | Default | What it does |
|---|---|---|
| `accountId`, `apiToken` | none | Required. The token needs the Workers AI permission. |
| `model` | `@cf/black-forest-labs/flux-2-klein-4b` | About 0.1 US cent per image. |
| `longEdge` | `1280` | The long edge in pixels, for models that take a size. |
| `gatewayId` | none | Sends the requests through an AI Gateway. |
| `extraInput` | none | Extra input fields, for example `{ steps: 8 }`. |

### Fake

`fakeImageAdapter({ delayMs, longEdge, costPerImage })` draws a gradient PNG whose colors come from the prompt. The starter uses it when `BUILDER_AI_FAKE=1` is set and there is no `OPENROUTER_API_KEY`. The starter ignores the flag in production.

## Limits and cost

Each image costs money, so the plugin caps them:

```ts
ai: {
  images: openRouterImageAdapter({ apiKey }),
  imageLimits: { perRequest: 3, perHour: 20 }, // the defaults
}
```

- `perRequest`: the most images one assistant reply may make.
- `perHour`: the most images one user may make in one hour. The assistant, the inspector and MCP share this count. `0` turns image generation off.
- A failed generation does not count.
- The count lives in server memory, so a restart clears it. With more than one app server, each server counts on its own.

The server log gets one line per image, with the adapter, model, time and cost.

## Where images go, and access

- Images go to `ai.mediaCollection` (default `media`). The inspector uses the upload collection of the field.
- The plugin uploads as the signed-in user, with `overrideAccess: false`. It checks the collection's `create` access before it calls the image API, so a user without access costs nothing.
- The collection must be an upload collection that accepts images. A collection with `upload.mimeTypes` that leaves out images is refused.
- The file name starts with `ai-` and the words of the prompt, for example `ai-fresh-coffee-beans-k3x9qa.jpg`.
- The `alt` field (when the collection has one) gets the given alt text, or else the first sentence of the prompt.

### Marking generated images

The plugin never adds fields to your media collection. To keep a note on each generated image, add a field yourself:

```ts
// collections/Media.ts
fields: [
  { name: 'alt', type: 'text' },
  { name: 'generatedBy', type: 'textarea', admin: { readOnly: true, description: 'Set when AI made this image.' } },
]
```

When the collection has a text, textarea or JSON field named `generatedBy`, the plugin writes the adapter, model, date and prompt into it. A text field gets one line. A JSON field gets an object. To use another field name, set `ai.imageMarkerField: 'aiNote'`. To turn it off, set `ai.imageMarkerField: false`.

## MCP: Claude Code, Codex and other clients

`builderMcpTools()` adds the `generateImage` tool. Arguments:

| Argument | What it is |
|---|---|
| `collection` | The upload collection. Always `media` (or `builderMcpTools({ mediaCollection })`). |
| `prompt` | What the image shows. |
| `aspectRatio` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3` or `21:9`. Default `1:1`. |
| `alt` | Optional alt text. |

The tool returns the media `id`, `url`, size and alt text. The client then puts the id in a block with `applyOperations`, for example `{"type":"update","id":"b_hero01","props":{"image":64}}`.

The tool runs as the API key's user or the signed-in OAuth user. The key needs `create` on the media collection: the **Editor** preset has it. Claude Code with a Claude plan cannot make images itself. With this tool, the site makes them with its own key.

## Write your own adapter

An image adapter is a plain object of type `AiImageAdapter` from `@payload-toolkit/builder/ai`:

```ts
import { AiImageError, toGeneratedImage, type AiImageAdapter } from '@payload-toolkit/builder/ai'

export function myImageAdapter({ apiKey }: { apiKey?: string }): AiImageAdapter {
  return {
    name: 'my-images',
    label: 'My image API',
    model: 'my-model-1',
    ready: Boolean(apiKey),
    setupProblem: apiKey ? null : 'Set MY_IMAGE_KEY in .env and restart the server.',
    async generate({ prompt, aspectRatio, n, signal }) {
      const response = await fetch('https://images.example.com/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, n }),
        signal,
      })
      if (!response.ok) throw new AiImageError(response.status === 401 ? 'auth' : 'api_error', `My image API returned ${response.status}.`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      return { images: [toGeneratedImage(bytes, response.headers.get('content-type'))], usage: { cost: 0.01 } }
    },
  }
}
```

- `generate` gets `prompt`, `aspectRatio`, `n` (the plugin asks for 1) and `signal`.
- It returns `images` (each with `data` as a `Uint8Array` and a `mimeType`), and optional `revisedPrompt` and `usage` (`cost` in US dollars).
- On failure, throw an `AiImageError` with a code: `auth`, `aborted`, `rate_limit`, `no_image`, `invalid_request` or `api_error`. The message goes to the user.
- `closestRatio`, `sizeForRatio`, `decodeImageData` and `toGeneratedImage` from the same import help with sizes and image data.

## Privacy

The prompt goes to the image provider you pick. The assistant writes the prompt from the conversation and the page. The image provider does not get the page itself.

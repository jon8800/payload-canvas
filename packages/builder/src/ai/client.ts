// Loads the Anthropic SDK lazily, so the plugin works without it when `ai` is not configured.

import type Anthropic from '@anthropic-ai/sdk'

import type { AiClient, DescribeError } from './agent'

type Sdk = typeof import('@anthropic-ai/sdk')

// A variable specifier the bundler does not follow: apps without the optional SDK still build.
const SDK_MODULE = '@anthropic-ai/sdk'

let sdkPromise: Promise<Sdk | null> | null = null

function loadSdk(): Promise<Sdk | null> {
  sdkPromise ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ SDK_MODULE).then(
    (mod: Sdk) => mod,
    () => null,
  )
  return sdkPromise
}

export const NO_KEY_MESSAGE =
  'No Anthropic credentials found. Set ANTHROPIC_API_KEY in the server environment (for example in .env) and restart the server, or run `ant auth login` on the server.'

export type LoadedClient = { client: AiClient; describeError: DescribeError } | { error: string }

let cached: { key: string; client: Anthropic } | null = null

/**
 * The Anthropic client (one per server and API key). Credentials resolve once per client, so a
 * client that had none is dropped after a failure and the next request builds a new one.
 */
export async function loadClient(apiKey: string | undefined): Promise<LoadedClient> {
  const sdk = await loadSdk()
  if (!sdk) return { error: 'The AI assistant needs the @anthropic-ai/sdk package. Install it in the app: pnpm add @anthropic-ai/sdk' }
  const key = apiKey ?? ''
  if (!cached || cached.key !== key) {
    const Client = sdk.default
    cached = { key, client: apiKey ? new Client({ apiKey }) : new Client() }
  }
  const client = cached.client
  const hasCredentials = () => Boolean(client.apiKey || client.authToken || client.credentials)

  const describeError: DescribeError = (error, { streamStarted }) => {
    if (error instanceof sdk.AuthenticationError) {
      cached = null
      return { type: 'error', code: 'no_api_key', message: `The Anthropic API rejected the credentials (401). ${NO_KEY_MESSAGE}` }
    }
    if (error instanceof sdk.RateLimitError) {
      return { type: 'error', code: 'api_error', message: 'The Anthropic API rate limit was reached. Wait a moment and try again.' }
    }
    if (error instanceof sdk.APIUserAbortError) return { type: 'error', code: 'aborted', message: 'The request was cancelled.' }
    if (error instanceof sdk.APIError) {
      const status = error.status ? ` (${error.status})` : ''
      return { type: 'error', code: 'api_error', message: `The Anthropic API returned an error${status}: ${error.message}` }
    }
    // Not an API error: before any stream event this is a missing credential; after events it is
    // a tool input the SDK could not parse (eager input streaming), which the loop retries.
    if (!streamStarted && !hasCredentials()) {
      cached = null
      return { type: 'error', code: 'no_api_key', message: NO_KEY_MESSAGE }
    }
    if (streamStarted) return null
    return { type: 'error', code: 'api_error', message: error instanceof Error ? error.message : String(error) }
  }

  return { client: client as unknown as AiClient, describeError }
}

import type { CollectionSlug, PayloadRequest, TaskConfig } from 'payload'

import { revalidateSitePath } from './revalidate'

// Tasks for the workflow builder (payload-workflows). The builder shows each task in its palette
// and builds the task's form from `inputSchema`. `outputSchema` names become references for later
// steps, such as `{{steps.<stepId>.output.id}}`. Add your own tasks here and list them in `workflowTasks`.

/** Collections that workflows may not create or update: user accounts and Payload's own collections. */
function writableCollection(req: PayloadRequest, slug: string): CollectionSlug {
  const collection = req.payload.collections[slug as CollectionSlug]
  if (!collection) throw new Error(`There is no collection "${slug}".`)
  if (collection.config.auth || slug.startsWith('payload-') || slug === 'workflows') {
    throw new Error(`Workflows may not write to "${slug}".`)
  }
  return slug as CollectionSlug
}

/** The task form turns JSON text into a value. A JSON field may still hold text, for example after a reference. */
function asObject(value: unknown, name: string): Record<string, unknown> {
  const parsed = typeof value === 'string' && value.trim() ? (JSON.parse(value) as unknown) : value
  if (parsed === undefined || parsed === null) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`"${name}" must be a JSON object.`)
  return parsed as Record<string, unknown>
}

export const sendEmailTask: TaskConfig<'sendEmail'> = {
  slug: 'sendEmail',
  label: 'Send email',
  inputSchema: [
    { name: 'to', type: 'email', required: true },
    { name: 'subject', type: 'text', required: true },
    { name: 'body', type: 'textarea', required: true, admin: { description: 'Plain text.' } },
    { name: 'replyTo', type: 'email' },
  ],
  outputSchema: [{ name: 'messageId', type: 'text' }],
  retries: 2,
  handler: async ({ input, req }) => {
    // Without SMTP_HOST in .env, Payload's console adapter only logs the email.
    const result = (await req.payload.sendEmail({
      to: input.to,
      subject: input.subject,
      text: input.body,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    })) as { messageId?: string } | undefined
    return { output: { messageId: result?.messageId ?? '' } }
  },
}

export const createDocumentTask: TaskConfig<'createDocument'> = {
  slug: 'createDocument',
  label: 'Create document',
  inputSchema: [
    { name: 'collection', type: 'text', required: true, admin: { description: 'Collection slug, for example "posts".' } },
    { name: 'data', type: 'json', required: true, admin: { description: 'The fields, for example { "title": "Hello" }.' } },
    { name: 'draft', type: 'checkbox', defaultValue: true, admin: { description: 'Save as a draft when the collection has drafts.' } },
  ],
  outputSchema: [{ name: 'id', type: 'text' }],
  retries: 1,
  handler: async ({ input, req }) => {
    const doc = await req.payload.create({
      collection: writableCollection(req, input.collection),
      data: asObject(input.data, 'data'),
      draft: input.draft ?? true,
      req,
      overrideAccess: true,
    })
    return { output: { id: String(doc.id) } }
  },
}

export const updateDocumentTask: TaskConfig<'updateDocument'> = {
  slug: 'updateDocument',
  label: 'Update document',
  inputSchema: [
    { name: 'collection', type: 'text', required: true, admin: { description: 'Collection slug, for example "posts".' } },
    { name: 'id', type: 'text', required: true, admin: { description: 'For example {{trigger.doc.id}}.' } },
    { name: 'data', type: 'json', required: true, admin: { description: 'Only the fields to change.' } },
  ],
  outputSchema: [{ name: 'id', type: 'text' }],
  retries: 1,
  handler: async ({ input, req }) => {
    // Pass `req`, so a workflow that updates a document counts toward the plugin's chain limit.
    const doc = await req.payload.update({
      collection: writableCollection(req, input.collection),
      id: input.id,
      data: asObject(input.data, 'data'),
      req,
      overrideAccess: true,
    })
    return { output: { id: String(doc.id) } }
  },
}

const WEBHOOK_METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'] as const
type WebhookMethod = (typeof WEBHOOK_METHODS)[number]

export const callWebhookTask: TaskConfig<'callWebhook'> = {
  slug: 'callWebhook',
  label: 'Call webhook',
  inputSchema: [
    { name: 'url', type: 'text', required: true, admin: { description: 'An http or https address.' } },
    { name: 'method', type: 'select', options: [...WEBHOOK_METHODS], defaultValue: 'POST' },
    { name: 'body', type: 'json', admin: { description: 'Sent as JSON. Not sent with GET.' } },
    { name: 'headers', type: 'json', admin: { description: 'For example { "Authorization": "Bearer ..." }.' } },
  ],
  outputSchema: [
    { name: 'status', type: 'number' },
    { name: 'response', type: 'textarea' },
  ],
  retries: 3,
  handler: async ({ input, req }) => {
    const url = new URL(input.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('The URL must start with http:// or https://.')
    const method: WebhookMethod = (input.method as WebhookMethod | undefined) ?? 'POST'
    const headers = Object.fromEntries(Object.entries(asObject(input.headers, 'headers')).map(([key, value]) => [key, String(value)]))
    const sendsBody = method !== 'GET' && input.body !== undefined && input.body !== null
    const response = await fetch(url, {
      method,
      headers: sendsBody ? { 'content-type': 'application/json', ...headers } : headers,
      body: sendsBody ? (typeof input.body === 'string' ? input.body : JSON.stringify(input.body)) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const text = (await response.text()).slice(0, 10_000)
    // A failed call throws, so Payload retries the step.
    if (!response.ok) throw new Error(`${method} ${url.host} returned ${response.status}: ${text.slice(0, 500)}`)
    req.payload.logger.info({ msg: 'Webhook called', url: url.origin + url.pathname, status: response.status })
    return { output: { status: response.status, response: text } }
  },
}

export const revalidatePathTask: TaskConfig<'revalidatePath'> = {
  slug: 'revalidatePath',
  label: 'Revalidate page path',
  inputSchema: [{ name: 'path', type: 'text', required: true, admin: { description: 'A site path, for example /about or /blog.' } }],
  outputSchema: [{ name: 'path', type: 'text' }],
  retries: 2,
  handler: async ({ input, req }) => {
    if (!input.path.startsWith('/')) throw new Error('The path must start with "/".')
    await revalidateSitePath(input.path, req)
    return { output: { path: input.path } }
  },
}

/** The tasks the workflow builder offers. `jobs.tasks` in payload.config.ts. */
export const workflowTasks = [sendEmailTask, createDocumentTask, updateDocumentTask, callWebhookTask, revalidatePathTask] as TaskConfig[]

import { createHash, timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { Endpoint, PayloadRequest } from 'payload'

/**
 * Clears Next's cache for one site path, from a job.
 *
 * A job cannot call `revalidatePath` itself. It works only inside a live Next request, and a job run
 * by `jobs.autoRun` runs on a timer that keeps the context of the request that started the timer:
 * Next then throws ("used during render") or drops the call. So the job always calls the site's own
 * `POST /api/revalidate-path`, which is a fresh request every time.
 */
export async function revalidateSitePath(path: string, req: PayloadRequest): Promise<void> {
  const serverURL = req.payload.config.serverURL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
  const response = await fetch(new URL('/api/revalidate-path', serverURL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-token': revalidateToken(req.payload.secret) },
    body: JSON.stringify({ path }),
  })
  if (!response.ok) throw new Error(`POST /api/revalidate-path returned ${response.status}: ${await response.text()}`)
}

/** A token made from the Payload secret, so the secret itself never travels. */
function revalidateToken(secret: string): string {
  return createHash('sha256').update(`revalidate-path:${secret}`).digest('hex')
}

function sameToken(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

/** `POST /api/revalidate-path` with `{ "path": "/about" }`. Signed-in users or the job token only. */
export const revalidatePathEndpoint: Endpoint = {
  path: '/revalidate-path',
  method: 'post',
  handler: async (req) => {
    const allowed = Boolean(req.user) || sameToken(req.headers.get('x-revalidate-token'), revalidateToken(req.payload.secret))
    if (!allowed) return Response.json({ error: 'Not allowed.' }, { status: 401 })
    const body = (await req.json?.().catch(() => null)) as { path?: unknown } | null
    const path = typeof body?.path === 'string' ? body.path : ''
    if (!path.startsWith('/')) return Response.json({ error: 'Send { "path": "/some-page" }.' }, { status: 400 })
    revalidatePath(path)
    return Response.json({ revalidated: path })
  },
}

import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import configPromise from '@payload-config'

/**
 * Turns on draft mode and opens `path`. Only for a signed-in admin user (the Payload session
 * cookie): no shared secret in the URL, so nothing secret reaches the admin's client HTML.
 */
export async function GET(req: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')

  if (!path) {
    return new Response('Insufficient search params', { status: 404 })
  }
  // Same-site paths only ("/x", not "//evil.example").
  if (!path.startsWith('/') || path.startsWith('//')) {
    return new Response('This endpoint can only be used for relative previews', { status: 400 })
  }

  const draft = await draftMode()
  let user: unknown = null
  try {
    ;({ user } = await payload.auth({ headers: req.headers }))
  } catch (error) {
    payload.logger.error({ err: error }, 'Error verifying token for live preview')
  }
  if (!user) {
    draft.disable()
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  draft.enable()
  redirect(path)
}

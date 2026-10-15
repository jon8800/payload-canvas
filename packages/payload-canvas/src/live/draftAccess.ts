// Read access to the latest draft. The live session holds the newest draft and sends it to every
// editor (events, operations, MCP). Payload's draft read falls back to an older version the user
// may read (for example the published one, when read access allows only published documents), so
// "the user can read the document" does not mean "the user can read this draft". This compares the
// draft Payload gives the user with the newest draft.

import type { PayloadRequest } from 'payload'

/** Why the builder refuses a user who may read only an older version of the document. */
export const DRAFT_NOT_READABLE_MESSAGE = 'You may not read the latest draft of this document, so the builder cannot show it.'

/**
 * Null when the request's user reads the newest draft of the document (or the collection has no
 * drafts), else why the builder refuses. Throws when the user may not read the document at all.
 */
export async function draftReadProblem(req: PayloadRequest, target: { collection: string; id: string | number; drafts: boolean }): Promise<string | null> {
  if (!target.drafts) return null
  const read = async (overrideAccess: boolean) =>
    (await req.payload.findByID({
      collection: target.collection as never,
      id: target.id,
      depth: 0,
      draft: true,
      overrideAccess,
      user: req.user,
      req,
      select: { updatedAt: true } as never,
    })) as { updatedAt?: unknown }
  const own = await read(false)
  const newest = await read(true)
  return String(own.updatedAt) === String(newest.updatedAt) ? null : DRAFT_NOT_READABLE_MESSAGE
}

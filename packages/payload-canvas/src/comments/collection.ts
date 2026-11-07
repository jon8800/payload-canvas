// The comments collection: one document per comment. A thread is a comment on a block; replies
// point to their thread. The editor reads and writes it over Payload's REST API, and every save or
// delete goes out on the document's live channel (`comments` events). Comments never touch the
// layout, its undo history, saves or publishing.

import {
  APIError,
  parseDocumentID,
  type Access,
  type CollectionSlug,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload'

import { builderConfigOf } from '../live/document'
import { liveRuntimeOf } from '../live/runtime'
import { collaboratorName } from '../live/session'
import type { LiveCommentsEvent } from '../live/types'
import type { CommentsOptions } from './config'
import { authorKeyOf, COMMENT_MAX, toComment } from './shared'

/** Fields a save never changes after the comment exists: where it is and who wrote it. */
const FIXED_FIELDS = ['docCollection', 'docId', 'parent', 'blockId', 'x', 'y', 'author', 'authorKey', 'authorName'] as const

const signedIn: Access = ({ req }) => Boolean(req.user)

/** Only the author deletes a comment (a thread's replies go with it). */
const ownComment: Access = ({ req }) => {
  const key = authorKeyOf(req.user)
  return key ? { authorKey: { equals: key } } : false
}

/** What a save does, decided from plain values. Pure, so the rules are tested without Payload. */
export type CommentWrite = {
  operation: 'create' | 'update'
  data: Record<string, unknown>
  /** The stored comment (updates). */
  original?: Record<string, unknown> | null
  /** The thread a new reply answers. Undefined when `data.parent` is empty; null when it is not found. */
  parent?: Record<string, unknown> | null
  user: unknown
  /** The builder collections. */
  collections: readonly string[]
  /** The author's auth collection is this one: `author` links to the user. */
  userSlug: string | null
  now: string
}

export type CommentWriteResult = { ok: true; data: Record<string, unknown>; target: { collection: string; id: string } } | { ok: false; status: 400 | 403; error: string }

const str = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')

/**
 * The data to store, and the document whose update access the user needs. A new comment gets its
 * author from the user; a reply takes its document from its thread. On updates, only the text
 * (by its author) and the resolved state (of a thread) change.
 */
export function commentWrite(input: CommentWrite): CommentWriteResult {
  const { operation, user, now } = input
  const data = { ...input.data }
  if (typeof data.body === 'string') data.body = data.body.trim()

  if (operation === 'create') {
    const key = authorKeyOf(user)
    if (!key) return { ok: false, status: 403, error: 'Sign in to comment.' }
    if (!data.body) return { ok: false, status: 400, error: 'Write a comment.' }
    data.authorKey = key
    data.authorName = collaboratorName(user)
    const u = user as { id?: unknown; collection?: unknown }
    if (input.userSlug) data.author = u.collection === input.userSlug ? u.id : null
    data.resolved = false
    data.resolvedByName = null
    data.resolvedAt = null
    data.editedAt = null
    if (input.parent !== undefined) {
      const parent = input.parent
      if (!parent || parent.parent) return { ok: false, status: 400, error: 'Reply to a thread that exists.' }
      data.docCollection = parent.docCollection
      data.docId = parent.docId
      data.blockId = null
      data.x = null
      data.y = null
    } else {
      data.parent = null
      if (!input.collections.includes(str(data.docCollection))) return { ok: false, status: 400, error: 'Comment on a builder document.' }
      if (!str(data.docId) || !str(data.blockId)) return { ok: false, status: 400, error: 'Comment on a block.' }
    }
    return { ok: true, data, target: { collection: str(data.docCollection), id: str(data.docId) } }
  }

  const original = input.original ?? {}
  for (const field of FIXED_FIELDS) {
    if (field in original) data[field] = original[field]
    else delete data[field]
  }
  const key = authorKeyOf(user)
  if (typeof data.body === 'string' && data.body !== original.body) {
    if (!key || key !== original.authorKey) return { ok: false, status: 403, error: 'Only the author can change a comment.' }
    if (!data.body) return { ok: false, status: 400, error: 'Write a comment.' }
    data.editedAt = now
  } else {
    data.body = original.body
    data.editedAt = original.editedAt ?? null
  }
  if (typeof data.resolved === 'boolean' && data.resolved !== (original.resolved === true)) {
    if (original.parent) return { ok: false, status: 400, error: 'Resolve the thread, not a reply.' }
    data.resolvedByName = data.resolved ? collaboratorName(user) : null
    data.resolvedAt = data.resolved ? now : null
  } else {
    data.resolved = original.resolved === true
    data.resolvedByName = original.resolvedByName ?? null
    data.resolvedAt = original.resolvedAt ?? null
  }
  return { ok: true, data, target: { collection: str(original.docCollection), id: str(original.docId) } }
}

function fail(result: { status: 400 | 403; error: string }): never {
  throw new APIError(result.error, result.status, null, true)
}

function broadcast(req: PayloadRequest, doc: Record<string, unknown>, event: LiveCommentsEvent): void {
  const collection = str(doc.docCollection)
  const id = str(doc.docId)
  if (!collection || !id) return
  // Only editors with the document open hear it. The stream checks their read access per event.
  liveRuntimeOf(req.payload).sessions.broadcast(collection, id, event)
}

/** Editors with the document open see the saved comment at once. */
const afterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  const comment = toComment(doc)
  if (comment) broadcast(req, doc, { type: 'comments', change: 'saved', comment })
  return doc
}

/** Editors with the document open drop the comment at once. */
const afterDelete: CollectionAfterDeleteHook = ({ doc, id, req }) => {
  broadcast(req, doc, { type: 'comments', change: 'deleted', id: String(id) })
  return doc
}

export function commentsCollection(slug: string, options: CommentsOptions = {}, args: { userSlug: string | null }): CollectionConfig {
  // REST bodies carry ids as text; the relationship check wants the database's id type.
  const beforeValidate: CollectionBeforeValidateHook = ({ data, req }) => {
    if (data && (typeof data.parent === 'string' || typeof data.parent === 'number')) {
      data.parent = parseDocumentID({ collectionSlug: slug as CollectionSlug, id: data.parent, payload: req.payload }) ?? data.parent
    }
    return data
  }

  const beforeChange: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
    // Server code without a user (seeds, jobs) writes as it likes.
    if (!req.user || (operation !== 'create' && operation !== 'update')) return data
    const parentId = operation === 'create' ? data.parent : undefined
    const parent =
      parentId === undefined || parentId === null || parentId === ''
        ? undefined
        : ((await req.payload.findByID({ collection: slug as never, id: parentId as string, depth: 0, overrideAccess: true, req }).catch(() => null)) as Record<
            string,
            unknown
          > | null)
    const result = commentWrite({
      operation,
      data,
      original: originalDoc as Record<string, unknown> | undefined,
      parent,
      user: req.user,
      collections: Object.keys(builderConfigOf(req.payload)?.collections ?? {}),
      userSlug: args.userSlug,
      now: new Date().toISOString(),
    })
    if (!result.ok) fail(result)
    // Users who may change the document may comment on it, resolve and reply.
    const { collection, id } = result.target
    const docId = parseDocumentID({ collectionSlug: collection as CollectionSlug, id, payload: req.payload }) ?? id
    if (!(await liveRuntimeOf(req.payload).canUpdate(req, collection, docId))) {
      fail({ status: 403, error: 'You cannot comment on this page: you are not allowed to change it.' })
    }
    return result.data
  }

  // A thread takes its replies with it. Before the delete: the database clears the replies'
  // `parent` link when the thread goes, so afterwards they could not be found.
  const beforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
    await req.payload.delete({ collection: slug as never, where: { parent: { equals: id } }, overrideAccess: true, req })
  }

  return {
    slug,
    labels: { singular: 'Comment', plural: 'Comments' },
    access: { read: signedIn, create: signedIn, update: signedIn, delete: ownComment, ...options.access },
    admin: {
      useAsTitle: 'body',
      defaultColumns: ['body', 'authorName', 'docCollection', 'resolved', 'createdAt'],
      description: 'Comments people leave on blocks in the builder. Open the page in the builder to discuss and resolve them.',
      ...options.admin,
    },
    indexes: [{ fields: ['docCollection', 'docId'] }],
    hooks: {
      ...options.hooks,
      beforeValidate: [beforeValidate, ...(options.hooks?.beforeValidate ?? [])],
      beforeChange: [beforeChange, ...(options.hooks?.beforeChange ?? [])],
      afterChange: [afterChange, ...(options.hooks?.afterChange ?? [])],
      beforeDelete: [beforeDelete, ...(options.hooks?.beforeDelete ?? [])],
      afterDelete: [afterDelete, ...(options.hooks?.afterDelete ?? [])],
    },
    fields: [
      { name: 'body', label: 'Comment', type: 'textarea', required: true, maxLength: COMMENT_MAX },
      {
        name: 'parent',
        label: 'Reply to',
        type: 'relationship',
        relationTo: slug as never,
        index: true,
        admin: { position: 'sidebar', readOnly: true },
      },
      {
        name: 'resolved',
        type: 'checkbox',
        defaultValue: false,
        admin: { position: 'sidebar' },
      },
      { name: 'resolvedByName', label: 'Resolved by', type: 'text', admin: { position: 'sidebar', readOnly: true } },
      { name: 'resolvedAt', label: 'Resolved at', type: 'date', admin: { position: 'sidebar', readOnly: true } },
      {
        type: 'collapsible',
        label: 'Where',
        admin: { initCollapsed: true },
        fields: [
          {
            type: 'row',
            fields: [
              { name: 'docCollection', label: 'Collection', type: 'text', required: true, index: true, admin: { readOnly: true } },
              { name: 'docId', label: 'Document', type: 'text', required: true, index: true, admin: { readOnly: true } },
              { name: 'blockId', label: 'Block', type: 'text', admin: { readOnly: true } },
            ],
          },
          {
            type: 'row',
            fields: [
              { name: 'x', type: 'number', min: 0, max: 1, admin: { readOnly: true } },
              { name: 'y', type: 'number', min: 0, max: 1, admin: { readOnly: true } },
            ],
          },
        ],
      },
      ...(args.userSlug
        ? [{ name: 'author', type: 'relationship' as const, relationTo: args.userSlug as never, admin: { position: 'sidebar' as const, readOnly: true } }]
        : []),
      { name: 'authorName', label: 'Author', type: 'text', admin: { position: 'sidebar', readOnly: true } },
      { name: 'authorKey', type: 'text', index: true, admin: { hidden: true } },
      { name: 'editedAt', label: 'Edited at', type: 'date', admin: { position: 'sidebar', readOnly: true } },
    ],
  }
}

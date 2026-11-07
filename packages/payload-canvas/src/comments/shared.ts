// Comments on the canvas (the `builder-comments` collection): shared types, keys and pure helpers.
// Browser-safe: no Node built-ins and no Payload runtime imports. The editor, the server and the
// live channel use these. See the README section "Comments on the canvas".

/** Default slug of the comments collection. */
export const DEFAULT_COMMENTS_SLUG = 'builder-comments'

/** Server-only key in `config.custom` that holds `CommentsServerConfig`. */
export const COMMENTS_CONFIG_KEY = 'websiteBuilderComments'

/** Longest comment text, in characters. */
export const COMMENT_MAX = 5000

/** What the editor needs: the collection it reads and writes over Payload's REST API. */
export type CommentsClientConfig = { collection: string }

/**
 * One comment as the editor and the live channel see it. A thread is a comment without `parent`;
 * its replies point to it. Only a thread has a block, a pin position and a resolved state.
 */
export type BuilderComment = {
  id: string
  /** The thread this comment replies to. Null for the thread's first comment. */
  parent: string | null
  /** The block the pin is on. Null for replies. */
  blockId: string | null
  /** The pin, relative to the block's box: 0..1 from its left and top edges. */
  x: number
  y: number
  body: string
  /** Who wrote it: `<auth collection>:<user id>`. The author may edit and delete it. */
  authorKey: string
  authorName: string
  resolved: boolean
  resolvedByName: string | null
  resolvedAt: string | null
  createdAt: string
  /** Set when the author changed the text. */
  editedAt: string | null
}

/** A thread: its first comment and the replies, oldest first. */
export type CommentThread = { root: BuilderComment; replies: BuilderComment[] }

export type CommentFilter = 'all' | 'open' | 'resolved'

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

const idOf = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

const unit = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5)

/** A stored comment document (depth 0 or more) as a `BuilderComment`. Null when it is not one. */
export function toComment(doc: unknown): BuilderComment | null {
  if (!doc || typeof doc !== 'object') return null
  const d = doc as Record<string, unknown>
  const id = idOf(d.id)
  if (!id) return null
  return {
    id,
    parent: idOf(d.parent),
    blockId: text(d.blockId),
    x: unit(d.x),
    y: unit(d.y),
    body: typeof d.body === 'string' ? d.body : '',
    authorKey: typeof d.authorKey === 'string' ? d.authorKey : '',
    authorName: text(d.authorName) ?? 'Someone',
    resolved: d.resolved === true,
    resolvedByName: text(d.resolvedByName),
    resolvedAt: text(d.resolvedAt),
    createdAt: text(d.createdAt) ?? new Date(0).toISOString(),
    editedAt: text(d.editedAt),
  }
}

/** The user's author key, as the server stores it: `<auth collection>:<id>`. */
export function authorKeyOf(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const u = user as { id?: unknown; collection?: unknown }
  const id = idOf(u.id)
  return id ? `${typeof u.collection === 'string' ? u.collection : ''}:${id}` : null
}

/** Adds the comment, or replaces the one with its id. Keeps the list in creation order. */
export function upsertComment(list: readonly BuilderComment[], comment: BuilderComment): BuilderComment[] {
  const index = list.findIndex((c) => c.id === comment.id)
  if (index === -1) return [...list, comment].toSorted(byCreated)
  const next = [...list]
  next[index] = comment
  return next
}

/** Removes the comment and, for a thread, its replies. */
export function removeComment(list: readonly BuilderComment[], id: string): BuilderComment[] {
  return list.filter((c) => c.id !== id && c.parent !== id)
}

function byCreated(a: BuilderComment, b: BuilderComment): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id, undefined, { numeric: true })
}

/** Open threads sort by their start, resolved ones by when they were resolved. */
const sortTime = (t: CommentThread) => (t.root.resolved ? (t.root.resolvedAt ?? t.root.createdAt) : t.root.createdAt)

/** Open threads first (newest first), then resolved ones (newest resolved first). */
export function threadsOf(list: readonly BuilderComment[], filter: CommentFilter = 'all'): CommentThread[] {
  const replies = new Map<string, BuilderComment[]>()
  for (const c of list) {
    if (!c.parent) continue
    const group = replies.get(c.parent) ?? []
    group.push(c)
    replies.set(c.parent, group)
  }
  const threads = list
    .filter((c) => !c.parent)
    .filter((c) => filter === 'all' || (filter === 'resolved') === c.resolved)
    .map((root) => ({ root, replies: (replies.get(root.id) ?? []).toSorted(byCreated) }))
  return threads.toSorted((a, b) => {
    if (a.root.resolved !== b.root.resolved) return a.root.resolved ? 1 : -1
    return sortTime(b).localeCompare(sortTime(a))
  })
}

/** Number of open threads: the top bar's badge. */
export function openCount(list: readonly BuilderComment[]): number {
  return list.reduce((n, c) => (!c.parent && !c.resolved ? n + 1 : n), 0)
}

/** The REST query that lists one document's comments, oldest first. */
export function commentsQuery(collection: string, docId: string | number): string {
  const params = new URLSearchParams({
    'where[docCollection][equals]': collection,
    'where[docId][equals]': String(docId),
    sort: 'createdAt',
    depth: '0',
    limit: '0',
    pagination: 'false',
  })
  return params.toString()
}

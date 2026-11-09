import { MessageSquare } from 'lucide-react'
import type { CollectionSlug, Where } from 'payload'
import { builderViewPath, DEFAULT_COMMENTS_SLUG } from 'payload-canvas'

import { docTitle, listURL, relativeTime, replyCounts, shortText } from '../lib'
import { can, settingNumber, type WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty, WidgetList, type ListRow } from '../WidgetCard'

const DEFAULT_LIMIT = 6
const TITLE = 'Open comments'

type Thread = { id: string | number; body?: string; authorName?: string | null; docCollection: string; docId: string; createdAt: string }

/**
 * Comment threads from the builder that nobody resolved, newest first. Each row opens the page in
 * the builder with the thread open. Threads on pages the user cannot read are left out.
 */
export async function OpenComments({ req, permissions, widgetData }: WidgetProps) {
  const slug = DEFAULT_COMMENTS_SLUG
  if (!can(req, permissions, slug)) {
    return (
      <WidgetCard title={TITLE}>
        <WidgetEmpty>You cannot read comments.</WidgetEmpty>
      </WidgetCard>
    )
  }
  const limit = settingNumber(widgetData?.limit, DEFAULT_LIMIT)
  const open: Where = { and: [{ parent: { exists: false } }, { resolved: { not_equals: true } }] }
  // More than shown: threads on pages the user cannot read drop out below.
  const threads = await req.payload.find({ collection: slug, depth: 0, limit: limit * 2, overrideAccess: false, req, sort: '-createdAt', where: open })
  const docs = threads.docs as unknown as Thread[]

  const [replies, titles] = await Promise.all([
    docs.length
      ? req.payload
          .find({ collection: slug, depth: 0, overrideAccess: false, pagination: false, req, select: { parent: true }, where: { parent: { in: docs.map((doc) => doc.id) } } })
          .then((result) => replyCounts(result.docs as unknown as Array<{ parent?: unknown }>))
      : new Map<string, number>(),
    pageTitles(req, permissions, docs),
  ])

  const adminRoute = req.payload.config.routes.admin
  const rows = docs
    .flatMap((thread): ListRow[] => {
      const page = titles.get(`${thread.docCollection}:${thread.docId}`)
      if (!page) return []
      const count = replies.get(String(thread.id)) ?? 0
      const meta = [thread.authorName || 'Someone', page, count ? `${count} ${count === 1 ? 'reply' : 'replies'}` : null, relativeTime(thread.createdAt, undefined, req.i18n.language)]
      return [
        {
          key: String(thread.id),
          href: builderViewPath(adminRoute, thread.docCollection, thread.docId, { comment: thread.id }),
          title: shortText(thread.body) || 'Comment',
          meta: meta.filter(Boolean).join(' · '),
          icon: <MessageSquare aria-hidden size={16} strokeWidth={1.75} />,
        },
      ]
    })
    .slice(0, limit)

  return (
    <WidgetCard title={TITLE} action={threads.totalDocs > rows.length ? { href: listURL(adminRoute, slug, open), label: `View all ${threads.totalDocs}` } : undefined}>
      {rows.length ? <WidgetList rows={rows} /> : <WidgetEmpty>No open comments.</WidgetEmpty>}
    </WidgetCard>
  )
}

/** The titles of the threads' pages that the user can read, by `collection:id`. */
async function pageTitles(req: WidgetProps['req'], permissions: WidgetProps['permissions'], threads: Thread[]): Promise<Map<string, string>> {
  const byCollection = new Map<string, Set<string>>()
  for (const thread of threads) byCollection.set(thread.docCollection, (byCollection.get(thread.docCollection) ?? new Set()).add(thread.docId))
  const titles = new Map<string, string>()
  await Promise.all(
    [...byCollection].map(async ([collection, ids]) => {
      if (!can(req, permissions, collection)) return
      const { config } = req.payload.collections[collection as CollectionSlug]
      const result = await req.payload
        .find({
          collection: collection as CollectionSlug,
          depth: 0,
          draft: Boolean(config.versions?.drafts),
          overrideAccess: false,
          pagination: false,
          req,
          where: { id: { in: [...ids] } },
        })
        .catch(() => null)
      for (const doc of (result?.docs ?? []) as unknown as Array<Record<string, unknown>>) {
        titles.set(`${collection}:${String(doc.id)}`, docTitle(doc, config.admin.useAsTitle))
      }
    }),
  )
  return titles
}

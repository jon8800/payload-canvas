import { FileX, Unlink } from 'lucide-react'
import type { CollectionSlug } from 'payload'

import { NOT_FOUND_LOG } from '@/lib/notFoundLog'
import { docURL, listURL, REDIRECTS_COLLECTION, redirectCreateURL, relativeTime, shortText } from '../lib'
import { brokenLinks, can, settingNumber, type WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty, WidgetList, WidgetSection, type ListRow } from '../WidgetCard'

const DEFAULT_LIMIT = 5

type NotFoundDoc = { id: string | number; path: string; hits: number; lastSeen?: string | null; lastReferrer?: string | null }

/**
 * Two lists: the addresses visitors opened most that do not exist (the 404 log, admins only), each
 * with "Create redirect"; and links in builder layouts to deleted or unpublished documents.
 */
export async function BrokenLinks({ req, permissions, widgetData }: WidgetProps) {
  const limit = settingNumber(widgetData?.limit, DEFAULT_LIMIT)
  const [notFound, broken] = await Promise.all([topNotFound(req, permissions, limit), brokenLinks(req, permissions, limit)])
  const adminRoute = req.payload.config.routes.admin

  const linkRows = (broken?.links ?? []).map(
    (link): ListRow => ({
      key: link.key,
      href: link.href,
      title: link.title,
      meta: link.detail,
      badge: { label: link.problem === 'deleted' ? 'Deleted' : 'Unpublished', tone: link.problem === 'deleted' ? 'draft' : 'neutral' },
      icon: <Unlink aria-hidden size={16} strokeWidth={1.75} />,
    }),
  )

  return (
    <WidgetCard title="Broken links" action={notFound ? { href: listURL(adminRoute, NOT_FOUND_LOG), label: '404 log' } : undefined}>
      {notFound && (
        <WidgetSection title="Pages not found" count={notFound.total}>
          {notFound.rows.length ? <WidgetList rows={notFound.rows} /> : <WidgetEmpty>No visitor hit a missing page.</WidgetEmpty>}
        </WidgetSection>
      )}
      <WidgetSection title="Links to missing pages" count={broken?.total ?? 0}>
        {!broken ? (
          <WidgetEmpty>Checking the links. This takes a few minutes after the first start.</WidgetEmpty>
        ) : linkRows.length ? (
          <WidgetList rows={linkRows} />
        ) : (
          <WidgetEmpty>Every link points to a published page.</WidgetEmpty>
        )}
      </WidgetSection>
    </WidgetCard>
  )
}

/**
 * The 404 paths with the most hits, without the ones a redirect handles now. Null when the user
 * cannot read the log.
 */
async function topNotFound(req: WidgetProps['req'], permissions: WidgetProps['permissions'], limit: number): Promise<{ rows: ListRow[]; total: number } | null> {
  if (!can(req, permissions, NOT_FOUND_LOG)) return null
  const log = await req.payload.find({ collection: NOT_FOUND_LOG as CollectionSlug, depth: 0, limit: limit * 2, overrideAccess: false, req, sort: '-hits' })
  const entries = log.docs as unknown as NotFoundDoc[]
  const canRedirect = can(req, permissions, REDIRECTS_COLLECTION, 'create')
  const redirected = new Set<string>()
  if (entries.length && can(req, permissions, REDIRECTS_COLLECTION)) {
    const redirects = await req.payload.find({
      collection: REDIRECTS_COLLECTION as CollectionSlug,
      depth: 0,
      overrideAccess: false,
      pagination: false,
      req,
      where: { from: { in: entries.map((entry) => entry.path) } },
    })
    for (const doc of redirects.docs as unknown as Array<{ from?: string | null }>) if (doc.from) redirected.add(doc.from)
  }

  const adminRoute = req.payload.config.routes.admin
  const rows = entries
    .filter((entry) => !redirected.has(entry.path))
    .slice(0, limit)
    .map((entry): ListRow => {
      const meta = [
        `${entry.hits} ${entry.hits === 1 ? 'hit' : 'hits'}`,
        entry.lastSeen ? `last ${relativeTime(entry.lastSeen, new Date(), req.i18n.language)}` : null,
        entry.lastReferrer ? `from ${shortText(entry.lastReferrer, 48)}` : null,
      ]
      return {
        key: String(entry.id),
        href: docURL(adminRoute, NOT_FOUND_LOG, entry.id),
        title: entry.path,
        meta: meta.filter(Boolean).join(' · '),
        icon: <FileX aria-hidden size={16} strokeWidth={1.75} />,
        ...(canRedirect ? { action: { href: redirectCreateURL(adminRoute, entry.path), label: 'Create redirect' } } : {}),
      }
    })
  // Paths a redirect handles now are not counted (among the ones read here).
  return { rows, total: log.totalDocs - entries.filter((entry) => redirected.has(entry.path)).length }
}

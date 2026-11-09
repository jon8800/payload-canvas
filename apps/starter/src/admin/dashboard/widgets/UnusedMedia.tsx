import { File } from 'lucide-react'
import type { CollectionSlug } from 'payload'

import { docURL, listURL, MEDIA_COLLECTION, relativeTime, thumbnailOf, unusedDocs } from '../lib'
import { can, referencedIds, settingNumber, type WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty, WidgetList, type ListRow } from '../WidgetCard'

const DEFAULT_LIMIT = 6
const TITLE = 'Unused media'
/** The "View all" link filters the media list by id; past this many ids the URL gets too long. */
const MAX_LINKED = 200

type MediaDoc = { id: string | number; filename?: string | null; alt?: string | null; createdAt: string; url?: unknown; thumbnailURL?: unknown; mimeType?: unknown; sizes?: unknown }

/**
 * Media files that no page, post, template, section, other document or global uses: candidates
 * to delete. Newest first, with thumbnails; each row opens the media document.
 */
export async function UnusedMedia({ req, permissions, widgetData }: WidgetProps) {
  if (!can(req, permissions, MEDIA_COLLECTION)) {
    return (
      <WidgetCard title={TITLE}>
        <WidgetEmpty>You cannot read media.</WidgetEmpty>
      </WidgetCard>
    )
  }
  const [media, used] = await Promise.all([
    req.payload.find({ collection: MEDIA_COLLECTION as CollectionSlug, depth: 0, overrideAccess: false, pagination: false, req, sort: '-createdAt' }),
    referencedIds(req, MEDIA_COLLECTION),
  ])
  const unused = unusedDocs(media.docs as unknown as MediaDoc[], used)
  const limit = settingNumber(widgetData?.limit, DEFAULT_LIMIT)
  const adminRoute = req.payload.config.routes.admin

  const rows = unused.slice(0, limit).map((doc): ListRow => {
    const thumbnail = thumbnailOf(doc)
    return {
      key: String(doc.id),
      href: docURL(adminRoute, MEDIA_COLLECTION, doc.id),
      title: doc.filename || doc.alt || `File ${String(doc.id)}`,
      meta: `Uploaded ${relativeTime(doc.createdAt, undefined, req.i18n.language)}`,
      icon: thumbnail ? (
        // oxlint-disable-next-line nextjs/no-img-element -- admin thumbnails are already small sizes
        <img className="dash-thumb" src={thumbnail} alt="" loading="lazy" />
      ) : (
        <span className="dash-thumb dash-thumb--file">
          <File aria-hidden size={16} strokeWidth={1.75} />
        </span>
      ),
    }
  })
  const viewAll =
    unused.length > rows.length && unused.length <= MAX_LINKED
      ? { href: listURL(adminRoute, MEDIA_COLLECTION, { id: { in: unused.map((doc) => String(doc.id)).join(',') } }), label: 'View all' }
      : undefined

  return (
    <WidgetCard title={TITLE} action={viewAll}>
      {unused.length ? (
        <>
          <p className="dash-total">
            <strong>{unused.length}</strong>
            {unused.length === 1 ? 'file is not used anywhere' : 'files are not used anywhere'}
          </p>
          <WidgetList rows={rows} />
        </>
      ) : (
        <WidgetEmpty>Every file is in use.</WidgetEmpty>
      )}
    </WidgetCard>
  )
}

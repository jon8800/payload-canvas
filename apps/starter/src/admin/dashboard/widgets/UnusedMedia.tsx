import { File } from 'lucide-react'
import type { PayloadRequest } from 'payload'

import { docURL, MEDIA_COLLECTION, relativeTime, thumbnailOf } from '../lib'
import { can, settingNumber, UNUSED_MEDIA_PATH, unusedMedia, type MediaDoc, type WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty, WidgetList, type ListRow } from '../WidgetCard'

const DEFAULT_LIMIT = 6
const TITLE = 'Unused media'

/** One file as a list row: thumbnail, file name and upload time; it opens the media document. */
export function mediaRow(req: PayloadRequest, doc: MediaDoc): ListRow {
  const thumbnail = thumbnailOf(doc)
  return {
    key: String(doc.id),
    href: docURL(req.payload.config.routes.admin, MEDIA_COLLECTION, doc.id),
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
}

/**
 * Media files that no page, post, template, section, other document or global uses: candidates
 * to delete. Newest first, with thumbnails; each row opens the media document. One query on the
 * reference index (src/admin/references), however many pages and files the site has.
 */
export async function UnusedMedia({ req, permissions, widgetData }: WidgetProps) {
  if (!can(req, permissions, MEDIA_COLLECTION)) {
    return (
      <WidgetCard title={TITLE}>
        <WidgetEmpty>You cannot read media.</WidgetEmpty>
      </WidgetCard>
    )
  }
  const limit = settingNumber(widgetData?.limit, DEFAULT_LIMIT)
  const unused = await unusedMedia(req, limit)
  if (!unused) {
    return (
      <WidgetCard title={TITLE}>
        <WidgetEmpty>Checking which files are in use. This takes a few minutes after the first start.</WidgetEmpty>
      </WidgetCard>
    )
  }
  const adminRoute = req.payload.config.routes.admin
  const rows = unused.docs.map((doc) => mediaRow(req, doc))
  const viewAll = unused.total > rows.length ? { href: `${adminRoute === '/' ? '' : adminRoute}${UNUSED_MEDIA_PATH}`, label: 'View all' } : undefined

  return (
    <WidgetCard title={TITLE} action={viewAll}>
      {unused.total ? (
        <>
          <p className="dash-total">
            <strong>{unused.total}</strong>
            {unused.total === 1 ? 'file is not used anywhere' : 'files are not used anywhere'}
          </p>
          <WidgetList rows={rows} />
        </>
      ) : (
        <WidgetEmpty>Every file is in use.</WidgetEmpty>
      )}
    </WidgetCard>
  )
}

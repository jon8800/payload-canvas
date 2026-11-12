import type { SchedulePublishTaskInput } from 'payload'

import { docTitle, docURL } from '../lib'
import { can, type WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty, WidgetList, type ListRow } from '../WidgetCard'

const LIMIT = 6

/**
 * Publishes and unpublishes that wait for their time (Payload's "Schedule publish").
 * They are jobs in the `payload-jobs` collection; the documents show only if the user can read them.
 */
export async function Scheduled({ req, permissions }: WidgetProps) {
  const jobs = await req.payload.find({
    collection: 'payload-jobs',
    depth: 0,
    limit: LIMIT,
    pagination: false,
    req,
    sort: 'waitUntil',
    where: {
      and: [{ taskSlug: { equals: 'schedulePublish' } }, { completedAt: { exists: false } }, { hasError: { not_equals: true } }],
    },
    overrideAccess: true,
  })

  const adminRoute = req.payload.config.routes.admin
  const format = new Intl.DateTimeFormat(req.i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
  const rows = await Promise.all(
    jobs.docs.map(async (job): Promise<ListRow | null> => {
      const input = (job.input ?? {}) as SchedulePublishTaskInput
      const action = input.type === 'unpublish' ? 'Unpublish' : 'Publish'
      const when = job.waitUntil ? format.format(new Date(job.waitUntil)) : 'Soon'
      if (input.global) {
        return { key: String(job.id), href: `${adminRoute === '/' ? '' : adminRoute}/globals/${input.global}`, title: input.global, meta: when, badge: { label: action, tone: 'scheduled' } }
      }
      const target = input.doc
      if (!target || !can(req, permissions, target.relationTo)) return null
      const doc = await req.payload
        .findByID({ collection: target.relationTo, id: target.value, depth: 0, draft: true, overrideAccess: false, req, disableErrors: true })
        .catch(() => null)
      if (!doc) return null
      const { useAsTitle } = req.payload.collections[target.relationTo].config.admin
      return {
        key: String(job.id),
        href: docURL(adminRoute, target.relationTo, target.value),
        title: docTitle(doc as unknown as Record<string, unknown>, useAsTitle),
        meta: when,
        badge: { label: action, tone: 'scheduled' },
      }
    }),
  )
  const list = rows.filter((row): row is ListRow => row !== null)

  return (
    <WidgetCard title="Scheduled">
      {list.length ? <WidgetList rows={list} /> : <WidgetEmpty>Nothing is scheduled.</WidgetEmpty>}
    </WidgetCard>
  )
}

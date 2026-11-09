import type { CollectionSlug } from 'payload'

import { FORM_SUBMISSIONS, listURL, submissionRows, type SubmissionRowDoc } from '../lib'
import { can, settingNumber, type WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty, WidgetList } from '../WidgetCard'

const DEFAULT_LIMIT = 5

/** The newest messages sent through the site's forms, with "New" on the ones nobody opened yet. */
export async function FormMessages({ req, permissions, widgetData }: WidgetProps) {
  if (!can(req, permissions, FORM_SUBMISSIONS)) return null
  const adminRoute = req.payload.config.routes.admin
  const result = await req.payload.find({
    collection: FORM_SUBMISSIONS as CollectionSlug,
    // The form's title and field labels and types, for the summary.
    depth: 1,
    limit: settingNumber(widgetData?.limit, DEFAULT_LIMIT),
    overrideAccess: false,
    req,
    sort: '-createdAt',
  })
  const rows = submissionRows(result.docs as unknown as SubmissionRowDoc[], adminRoute, req.i18n.language)

  return (
    <WidgetCard
      action={result.totalDocs > rows.length ? { href: listURL(adminRoute, FORM_SUBMISSIONS), label: `All ${result.totalDocs}` } : undefined}
      title="Form messages"
    >
      {rows.length ? <WidgetList rows={rows} /> : <WidgetEmpty>No messages yet.</WidgetEmpty>}
    </WidgetCard>
  )
}

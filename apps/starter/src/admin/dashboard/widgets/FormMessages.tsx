import type { CollectionSlug } from 'payload'

import { docURL, FORM_SUBMISSIONS, listURL, relativeTime, submissionSummary } from '../lib'
import { can, settingNumber, type WidgetProps } from '../server'
import { WidgetCard, WidgetEmpty, WidgetList } from '../WidgetCard'

const DEFAULT_LIMIT = 5

function submissionRows(docs: Submission[], adminRoute: string, language: string) {
  const now = new Date()
  return docs.map((doc) => {
    const { from, text } = submissionSummary(doc.submissionData)
    const form = typeof doc.form === 'object' && doc.form?.title ? doc.form.title : 'Form'
    return {
      key: String(doc.id),
      href: docURL(adminRoute, FORM_SUBMISSIONS, doc.id),
      title: text ?? from ?? 'Empty message',
      meta: [from && text ? from : null, form, relativeTime(doc.createdAt, now, language)].filter(Boolean).join(' · '),
    }
  })
}

type Submission = {
  id: string | number
  createdAt: string
  form?: { title?: string | null } | string | number | null
  submissionData?: Array<{ field?: string | null; value?: string | null }> | null
}

/** The newest messages sent through the site's forms. */
export async function FormMessages({ req, permissions, widgetData }: WidgetProps) {
  if (!can(req, permissions, FORM_SUBMISSIONS)) return null
  const adminRoute = req.payload.config.routes.admin
  const result = await req.payload.find({
    collection: FORM_SUBMISSIONS as CollectionSlug,
    depth: 1,
    limit: settingNumber(widgetData?.limit, DEFAULT_LIMIT),
    overrideAccess: false,
    req,
    sort: '-createdAt',
  })
  const rows = submissionRows(result.docs as unknown as Submission[], adminRoute, req.i18n.language)

  return (
    <WidgetCard
      action={result.totalDocs > rows.length ? { href: listURL(adminRoute, FORM_SUBMISSIONS), label: `All ${result.totalDocs}` } : undefined}
      title="Form messages"
    >
      {rows.length ? <WidgetList rows={rows} /> : <WidgetEmpty>No messages yet.</WidgetEmpty>}
    </WidgetCard>
  )
}

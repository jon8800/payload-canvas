// List cells of the submissions collection (forms/submissionsAdmin.ts): the message summary and
// the "New" badge. Server components: the summary reads the form's field types and labels.

import { Link } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import type { DefaultServerCellComponentProps } from 'payload'
import type { ReactNode } from 'react'

import { shortAnswer, submissionSummary, type SubmissionDataRow } from '../../forms/summary'
import { formatDateTime, formOf, formsSlugOf } from './submissionData'
import './submissions.css'

/** The cell's content, linked to the document when it is the list's link column. */
function Linked({ props, children }: { props: DefaultServerCellComponentProps; children: ReactNode }) {
  const { link, linkURL, payload, collectionConfig, rowData } = props
  if (!link || rowData?.id === undefined) return <>{children}</>
  const href =
    linkURL ??
    formatAdminURL({ adminRoute: payload.config.routes.admin, path: `/collections/${collectionConfig.slug}/${String(rowData.id)}`, relative: true })
  return (
    <Link href={href} prefetch={false}>
      {children}
    </Link>
  )
}

/** "Ada Lovelace · ada@example.com" and the start of the message below it. */
export async function SubmissionSummaryCell(props: DefaultServerCellComponentProps) {
  const { payload, collectionConfig, rowData } = props
  const form = await formOf(payload, formsSlugOf(collectionConfig), rowData?.form)
  const summary = submissionSummary(rowData?.submissionData as SubmissionDataRow[] | undefined, form?.fields)
  const line = summary.line ? shortAnswer(summary.line, 70) : 'Empty message'
  const text = summary.text && summary.text !== summary.line ? shortAnswer(summary.text, 90) : null
  return (
    <Linked props={props}>
      <span className="form-submission-cell">
        <span className="form-submission-cell__line">{line}</span>
        {text ? <span className="form-submission-cell__text">{text}</span> : null}
      </span>
    </Linked>
  )
}

/** "New" until someone opened the submission, then the date it was opened. */
export function SubmissionReadCell(props: DefaultServerCellComponentProps) {
  const opened = formatDateTime(props.cellData, props.i18n?.language)
  return (
    <Linked props={props}>
      {opened ? <span className="form-submission-cell__opened">{opened}</span> : <span className="form-submission-badge">New</span>}
    </Linked>
  )
}

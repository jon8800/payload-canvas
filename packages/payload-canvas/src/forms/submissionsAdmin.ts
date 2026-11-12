// The admin of the form-builder plugin's submissions collection, for people who read messages:
// a list with the summary, the form and a "New" badge, and a detail view with the answers as a
// table (the form's labels), the files, the page it came from and "Reply by email". The raw
// `submissionData` stays in a collapsed "Raw data" group. Server config: component paths only.
//
//   const submissionsAdmin = formSubmissionsAdmin()
//   formBuilderPlugin({
//     formSubmissionOverrides: {
//       admin: { ...submissionsAdmin.admin },
//       fields: ({ defaultFields }) => submissionsAdmin.fields([...defaultFields, myAttachmentsField]),
//     },
//   })

import type { CollectionConfig, Field, FieldHook } from 'payload'

import { withoutFormResult } from './noScript'
import { safePageUrl } from './summary'

/** The date an admin first opened the submission. Empty: the list shows "New". */
export const SUBMISSION_READ_FIELD = 'readAt'
/** The page the visitor sent the form from. */
export const SUBMISSION_PAGE_FIELD = 'sourceUrl'
/** The detail view (a `ui` field). */
export const SUBMISSION_ANSWERS_FIELD = 'answers'
/** The list's summary column (a `ui` field). */
export const SUBMISSION_SUMMARY_FIELD = 'summary'

/** The fields the "Raw data" group holds: the plugin's own storage and the attachments. */
const RAW_FIELDS = ['submissionData', 'submissionUploads']

export type FormSubmissionsAdminOptions = {
  /** An upload field (hasMany) with files sent with the submission. Default "attachments"; false: none. */
  attachments?: string | false
}

/** What the detail view and the cells read from `admin.custom`. */
export type SubmissionsAdminCustom = { attachments: string | null }

/** The page address on create: the one the form sent, else the request's Referer. Only links that are safe to show. */
const pageOnCreate: FieldHook = ({ operation, req, value }) => {
  if (operation !== 'create') return value
  const page = safePageUrl(value) ?? safePageUrl(req.headers?.get?.('referer'))
  // A form sent again from a no-JavaScript result view: the page, without the result.
  return page ? withoutFormResult(page) : null
}

const nameOf = (field: Field): string | null => ('name' in field && typeof field.name === 'string' ? field.name : null)

/**
 * The `admin` options and a `fields` function for `formSubmissionOverrides`. `fields` takes the
 * collection's fields (the plugin's `defaultFields` plus your own) and returns them arranged for
 * reading, with the read date, the source page and the two view fields added.
 */
export function formSubmissionsAdmin(options: FormSubmissionsAdminOptions = {}): {
  admin: Pick<NonNullable<CollectionConfig['admin']>, 'defaultColumns'>
  fields: (fields: Field[]) => Field[]
} {
  const attachments = options.attachments === false ? null : (options.attachments ?? 'attachments')
  const custom: SubmissionsAdminCustom = { attachments }
  const raw = new Set([...RAW_FIELDS, ...(attachments ? [attachments] : [])])

  return {
    admin: { defaultColumns: [SUBMISSION_SUMMARY_FIELD, 'form', SUBMISSION_READ_FIELD, 'createdAt'] },
    fields: (fields) => {
      const names = new Set(fields.map(nameOf).filter(Boolean))
      const rawFields = fields.filter((field) => raw.has(nameOf(field) ?? ''))
      const rest = fields
        .filter((field) => !raw.has(nameOf(field) ?? ''))
        .map((field): Field => (nameOf(field) === 'form' ? ({ ...field, admin: { ...field.admin, position: 'sidebar' } } as Field) : field))
      const added: Field[] = [
        {
          name: SUBMISSION_ANSWERS_FIELD,
          type: 'ui',
          admin: { components: { Field: 'payload-canvas/rsc#SubmissionView' }, disabled: { column: true }, custom },
        },
        {
          name: SUBMISSION_SUMMARY_FIELD,
          type: 'ui',
          label: 'Message',
          // List only: a ui field without a Field component shows nothing in the edit view.
          admin: { components: { Cell: 'payload-canvas/rsc#SubmissionSummaryCell' }, custom },
        },
      ]
      const sidebar: Field[] = [
        ...(names.has(SUBMISSION_READ_FIELD)
          ? []
          : [
              {
                name: SUBMISSION_READ_FIELD,
                type: 'date',
                label: 'Opened',
                index: true,
                // Set by the detail view, never by visitors or the edit form.
                access: { create: () => false, update: () => false },
                admin: {
                  position: 'sidebar',
                  readOnly: true,
                  date: { pickerAppearance: 'dayAndTime' },
                  description: 'When someone first opened this message. Empty: the list shows "New".',
                  components: { Cell: 'payload-canvas/rsc#SubmissionReadCell' },
                },
              } as Field,
            ]),
        ...(names.has(SUBMISSION_PAGE_FIELD)
          ? []
          : [
              {
                name: SUBMISSION_PAGE_FIELD,
                type: 'text',
                label: 'Sent from',
                access: { update: () => false },
                hooks: { beforeChange: [pageOnCreate] },
                admin: { position: 'sidebar', readOnly: true, description: 'The page the form was sent from.' },
              } as Field,
            ]),
      ]
      return [
        ...added,
        ...rest,
        ...(rawFields.length > 0
          ? [{ type: 'collapsible', label: 'Raw data', admin: { initCollapsed: true }, fields: rawFields } as Field]
          : []),
        ...sidebar,
      ]
    },
  }
}

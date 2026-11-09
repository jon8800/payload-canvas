// Server: the form-builder plugin's `beforeEmail` hook that builds each email of a form from the
// fields of `formEmailFields` (from name, custom HTML body, merge tags with `{{*}}` as a table).
// The plugin sends what this returns.

import type { PayloadRequest } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import { formAnswers, formEmailMessage, tablesOutsideParagraphs, type FormEmailConfig } from './mergeTags'

/** An email as the plugin formats it before `beforeEmail`. */
type PluginEmail = { to?: string; from?: string }

/** What the plugin passes: the submission's `afterChange` arguments (its types call them `beforeChangeParams`). */
// oxlint-disable-next-line typescript/no-explicit-any -- the plugin's own type is `Partial<any>`
type HookArgs = { data?: Record<string, any>; doc?: Record<string, any>; req: PayloadRequest }

export type FormEmailsOptions = {
  /** Slug of the forms collection. Default "forms". */
  forms?: string
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

function richTextHtml(value: unknown): string {
  if (!value || typeof value !== 'object' || !('root' in value)) return ''
  try {
    // The answers table may not sit in a <p>.
    return tablesOutsideParagraphs(convertLexicalToHTML({ data: value as SerializedEditorState, disableContainer: true }))
  } catch {
    return ''
  }
}

/**
 * The `beforeEmail` hook: `formBuilderPlugin({ beforeEmail: formEmails() })`. It reads the form
 * again and builds every email from the stored answers (hidden fields already dropped). An email
 * without a To address is not sent.
 */
export function formEmails(options: FormEmailsOptions = {}) {
  const formsSlug = options.forms ?? 'forms'
  return async <T extends PluginEmail>(emails: T[], args: HookArgs): Promise<T[]> => {
    const req: PayloadRequest = args.req
    const id = idOf(args.doc?.form ?? args.data?.form)
    if (id === null) return emails
    const form = (await req.payload
      .findByID({ collection: formsSlug as never, id, depth: 0, req, overrideAccess: true, locale: req.locale ?? undefined })
      .catch(() => null)) as { title?: string; fields?: Array<{ blockType?: string; name?: string | null; label?: string | null }>; emails?: FormEmailConfig[] } | null
    const configs = form?.emails ?? []
    // The plugin made one email per entry, in order. Anything else: leave its emails alone.
    if (!form || configs.length !== emails.length) return emails
    const rows = (args.doc?.submissionData ?? args.data?.submissionData) as Array<{ field?: string; value?: unknown }> | undefined
    const answers = formAnswers(form.fields, rows, new Set(['formSubmissionID']))
    const fieldNames = new Set((form.fields ?? []).flatMap((f) => (f.name ? [f.name] : [])))
    const adapter = req.payload.email as { defaultFromAddress?: string; defaultFromName?: string } | undefined
    const defaults = { fromName: adapter?.defaultFromName ?? '', fromAddress: adapter?.defaultFromAddress ?? '' }
    const extra = { formSubmissionID: String(args.doc?.id ?? ''), formTitle: form.title ?? '' }
    return configs
      .map((config, index) => {
        const plugin = emails[index]
        const message = formEmailMessage(config, {
          answers,
          fieldNames,
          extra,
          richTextHtml: config.bodyType === 'html' ? '' : richTextHtml(config.message),
          defaults: { ...defaults, to: typeof plugin.to === 'string' ? plugin.to : '' },
        })
        // The plugin's own keys stay (attachments a later hook adds); ours win.
        return { ...plugin, ...message } as T
      })
      .filter((email) => email.to)
  }
}

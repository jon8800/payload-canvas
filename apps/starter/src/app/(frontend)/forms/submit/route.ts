// Forms without JavaScript: the site's `<form>` posts here natively (FormRuntime.tsx). The answers
// and files become the same submission the script sends, created with the Local API as the visitor
// (no user, access on), so every submissions hook runs: the page form check, spam (honeypot and
// rate limit; the fill time cannot be measured, so it passes), display conditions, answers and
// uploads. Then a 303 back to the page with the result in the query; proxy.ts renders that through
// app/(frontend)/form-result, which shows the confirmation or the problems.
import configPromise from '@payload-config'
import { getPayload, type PayloadRequest } from 'payload'
import { FORM_NO_SCRIPT_CONTEXT, removeStoredFormFiles, TURNSTILE_NEEDS_SCRIPT_MESSAGE, turnstileKeys } from 'payload-canvas'
import {
  FORM_SPAM_KEY,
  formResultSearch,
  NO_SCRIPT_FORM_INPUT,
  NO_SCRIPT_RETURN_INPUT,
  noScriptSubmission,
  refusalOf,
  safeReturnPath,
  type FormResult,
} from 'payload-canvas/forms'

type FormDoc = {
  id: string | number
  fields?: Array<{ blockType?: string | null; name?: string | null }> | null
  confirmationType?: string | null
  redirect?: { url?: string | null } | null
  spamProtection?: { turnstile?: boolean | null } | null
}

/** The page to come back to: the referring page on this site, else the form's `_return` path. */
function returnPath(request: Request, data: FormData | null): string {
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const url = new URL(referer)
      if (url.host === request.headers.get('host')) return safeReturnPath(url.pathname)
    } catch {
      // Not an address: use the form's own path.
    }
  }
  // The result view is a rewrite of the page (proxy.ts): its path is the page's.
  return safeReturnPath(data?.get(NO_SCRIPT_RETURN_INPUT)).replace(/^\/form-result(?=\/|$)/, '') || '/'
}

/** A 303 to a path or address. A relative Location keeps the host the visitor used (behind a proxy). */
const seeOther = (location: string) => new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })

/** The form's own redirect after a sent form: a path on this site, or an http(s) address. */
function confirmationRedirect(form: FormDoc): string | null {
  const url = form.confirmationType === 'redirect' ? form.redirect?.url?.trim() : null
  if (!url) return null
  if (url.startsWith('/') && !url.startsWith('//')) return url
  return /^https?:\/\//i.test(url) ? url : null
}

export async function POST(request: Request): Promise<Response> {
  const data = await request.formData().catch(() => null)
  const back = returnPath(request, data)
  const formId = typeof data?.get(NO_SCRIPT_FORM_INPUT) === 'string' ? String(data.get(NO_SCRIPT_FORM_INPUT)) : ''
  const result = (outcome: Omit<FormResult, 'form'>) => seeOther(`${back}${formResultSearch({ form: formId || 'none', ...outcome })}`)
  if (!data) return result({ status: 'error', message: 'Your message was not sent. Please try again.' })
  if (!formId) return result({ status: 'error', message: 'This form is not live yet. Publish the page, then try again.' })

  const payload = await getPayload({ config: configPromise })
  const form = (await payload.findByID({ collection: 'forms', id: formId, depth: 0, overrideAccess: true }).catch(() => null)) as FormDoc | null
  if (!form) return result({ status: 'error', message: 'This form no longer exists.' })
  // The Turnstile check needs its widget, which needs JavaScript.
  if (form.spamProtection?.turnstile && turnstileKeys()) return result({ status: 'error', message: TURNSTILE_NEEDS_SCRIPT_MESSAGE })

  const { submissionData, files, honeypot } = await noScriptSubmission(form.fields ?? [], data)
  // The visitor's request headers (the rate limit reads the IP) and files (formFileUploads). No user.
  const req = { headers: request.headers, files } as unknown as Partial<PayloadRequest>
  try {
    await payload.create({
      collection: 'form-submissions',
      data: { form: form.id, submissionData, [FORM_SPAM_KEY]: { honeypot } } as never,
      overrideAccess: false,
      req,
      context: { [FORM_NO_SCRIPT_CONTEXT]: true },
    })
  } catch (error) {
    // The Local API runs no afterError hooks: remove the files this submission stored.
    await removeStoredFormFiles(req as PayloadRequest)
    const refused = refusalOf(error)
    if (!refused.problems.length && !(error as { isPublic?: unknown }).isPublic) payload.logger.error({ err: error, msg: 'Form submission without JavaScript failed' })
    return result({ status: 'error', ...refused })
  }
  return seeOther(confirmationRedirect(form) ?? `${back}${formResultSearch({ form: formId, status: 'sent' })}`)
}

// GET {api}/builder/live/:collection/:id/template -> AppliedTemplateResponse
// The template the site renders a document through, for the editor's empty page. It runs the
// site's own rule (`findTemplate`, the code behind `loadTemplate`): published templates, with the
// conditions matched against the document's latest draft.

import type { Endpoint } from 'payload'

import { DOCUMENT_TEMPLATE_FIELD } from '../core/bindings'
import { APPLIED_TEMPLATE_PATH, type AppliedTemplateResponse } from '../core/templateChoice'
import { LIVE_PATH, targetOf, type LiveEndpointOptions } from '../live/endpoints'
import { findTemplate } from '../react/render/templates'

const json = (body: AppliedTemplateResponse, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export function templateEndpoint(args: {
  collections: LiveEndpointOptions['collections']
  /** Slug of the templates collection. */
  templatesSlug: string
  /** The collections whose documents render through templates. */
  targets: readonly string[]
}): Endpoint {
  return {
    path: `${LIVE_PATH}/:collection/:id/${APPLIED_TEMPLATE_PATH}`,
    method: 'get',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' }, 401)
      const target = targetOf(req, args.collections)
      if (target instanceof Response) return target
      if (!args.targets.includes(target.collection)) return json({ ok: true, template: null })
      let doc: Record<string, unknown>
      try {
        // The user's own access: only a document the user may read.
        doc = (await req.payload.findByID({
          collection: target.collection as never,
          id: target.id,
          draft: true,
          depth: 0,
          overrideAccess: false,
          user: req.user,
          select: { [DOCUMENT_TEMPLATE_FIELD]: true } as never,
        })) as Record<string, unknown>
      } catch {
        return json({ ok: false, error: 'Document not found or not readable' }, 404)
      }
      const found = await findTemplate(req.payload, {
        collection: target.collection,
        doc,
        templatesSlug: args.templatesSlug,
        draft: false,
        documentDraft: true,
      })
      const template = found ? { id: found.template.id as string | number, name: String(found.template.name ?? 'Untitled') } : null
      return json({ ok: true, template })
    },
  }
}

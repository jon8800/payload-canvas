// Forms on pages, on the server: the forms collection's `source` field, the save hook step that
// writes each "Build here" Form block to its forms document, and the "Move into this page" claim.
// See docs/architecture.md, "Forms on pages".

import { addDataAndFileToRequest, ValidationError, type Endpoint, type Field, type PayloadRequest, type Where } from 'payload'

import { LIVE_PATH, targetOf, type LiveEndpointOptions } from '../live/endpoints'
import type { LiveRuntime } from '../live/runtime'

import { formIdOf } from '../forms/pageForms'
import {
  clearedSettings,
  formBlockFromDoc,
  FORM_SOURCE_FIELD,
  formDataFromBlock,
  formDataHash,
  formSourceOf,
  pageFormBlocks,
  withFormIds,
  type FormSource,
} from '../forms/pageSync'
import type { FormSync } from './hook'
import type { Block } from '../core/types'
import { findReferrers } from './references'

/** `context` flag of the plugin's own writes to the forms collection. */
export const FORM_SYNC_CONTEXT = 'builderFormSync'

/** The hidden group on the forms collection that names the page block a form was made from. */
export function formSourceField(): Field {
  return {
    name: FORM_SOURCE_FIELD,
    type: 'group',
    label: 'Built on a page',
    admin: { hidden: true },
    fields: [
      { name: 'collection', type: 'text', index: true },
      { name: 'document', type: 'text', index: true },
      { name: 'block', type: 'text', index: true },
      // The hash of the data the block wrote last: a publish without changes writes nothing.
      { name: 'hash', type: 'text' },
    ],
  }
}

type FormApi = {
  find(args: Record<string, unknown>): Promise<{ docs: Record<string, unknown>[] }>
  findByID(args: Record<string, unknown>): Promise<Record<string, unknown>>
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>
}

const api = (req: PayloadRequest) => req.payload as unknown as FormApi

/** The title of a page, for a form without a title of its own: "Contact form". */
function fallbackTitle(doc: Record<string, unknown>, useAsTitle: string | undefined): string {
  const title = [useAsTitle, 'title', 'name'].map((key) => (key ? doc[key] : undefined)).find((v): v is string => typeof v === 'string' && v.trim() !== '')
  return title ? `${title.trim()} form` : 'Page form'
}

/** The messages of a refused forms write: Payload's field errors ("Confirmation Message: This field is required."), else its message. */
function writeProblems(error: unknown): string {
  const data = (error as { data?: { errors?: Array<{ label?: string; path?: string; message?: string }> } }).data
  const lines = (data?.errors ?? []).map((e) => `${e.label ?? e.path ?? 'Field'}: ${e.message ?? 'not valid'}`)
  return lines.length > 0 ? lines.join(' ') : error instanceof Error ? error.message : String(error)
}

export type FormSyncOptions = {
  /** The page collection's layout field (a refused form is reported on it). */
  layoutField: string
  /** The page collection. */
  collection: string
  /** Slug of the forms collection. */
  forms: string
  /** The forms collection's setting names (`formSettingNames`). */
  settings: readonly string[]
}

/**
 * The save hook step (`HookOptions.formSync`) for one page collection. One query finds the forms
 * of the page's Form blocks by `source`; a block without one gets a new form (a new block, a
 * duplicated block, a copied page). A form is written only when its data changed. Writes run as
 * the system (access off) in the page save's transaction. Deleted blocks keep their forms: their
 * submissions point at them.
 */
export function pageFormSync(options: FormSyncOptions): FormSync {
  return async (layout, { req, id, data, originalDoc }) => {
    const blocks = pageFormBlocks(layout)
    if (blocks.length === 0) return layout
    const document = String(id)
    const where: Where = {
      and: [
        { [`${FORM_SOURCE_FIELD}.collection`]: { equals: options.collection } },
        { [`${FORM_SOURCE_FIELD}.document`]: { equals: document } },
        { [`${FORM_SOURCE_FIELD}.block`]: { in: blocks.map((b) => b.id) } },
      ],
    }
    const { docs } = await api(req).find({ collection: options.forms, where, depth: 0, limit: blocks.length, pagination: false, overrideAccess: true, req })
    const byBlock = new Map(docs.flatMap((doc) => (formSourceOf(doc) ? [[formSourceOf(doc)!.block, doc] as const] : [])))
    const useAsTitle = (req.payload.collections as Record<string, { config: { admin?: { useAsTitle?: string } } } | undefined>)[options.collection]?.config.admin?.useAsTitle
    const title = fallbackTitle({ ...originalDoc, ...data }, useAsTitle)
    const ids = new Map<string, string | number>()
    for (const block of blocks) {
      const next = formDataFromBlock(block, { settings: options.settings, fallbackTitle: title })
      const hash = formDataHash(next)
      const source: FormSource = { collection: options.collection, document, block: block.id, hash }
      const stored = byBlock.get(block.id)
      const common = { collection: options.forms, depth: 0, overrideAccess: true, req, context: { [FORM_SYNC_CONTEXT]: true } }
      try {
        if (stored) {
          const formId = formIdOf(stored)!
          if (formSourceOf(stored)?.hash !== hash) {
            await api(req).update({ ...common, id: formId, data: { ...clearedSettings(stored, next, options.settings), ...next, [FORM_SOURCE_FIELD]: source } })
          }
          ids.set(block.id, formId)
          continue
        }
        const created = await api(req).create({ ...common, data: { ...next, [FORM_SOURCE_FIELD]: source } })
        ids.set(block.id, formIdOf(created)!)
      } catch (error) {
        // The page is not published: the problem names the form, so the editor can fix its settings.
        const message = `Form "${String(next.title)}" could not be saved: ${writeProblems(error)}`
        throw new ValidationError({ collection: options.collection, errors: [{ path: options.layoutField, message }], req }, req.t)
      }
    }
    return withFormIds(layout, ids)
  }
}

/** Where the forms a page's layouts name are used: the documents of the builder collections that reference them. */
export type FormUsage = (req: PayloadRequest, formId: string | number) => Promise<Array<{ collection: string; id: string | number }>>

export type ClaimResult =
  | { ok: true; formId: string | number | null; kept: boolean; doc: Record<string, unknown> }
  | { ok: false; status: number; error: string }

/**
 * "Move into this page": the Form block `block` of `collection`/`document` takes over form
 * `formId`. When no other document uses the form, the form keeps its id (and its submissions):
 * its `source` becomes this block, so the next publish writes into it. Otherwise the form stays
 * as it is for the other pages, and the block gets a new form when the page is published
 * (`kept: false`). The caller checks that the user may update the page.
 */
export async function claimForm(
  req: PayloadRequest,
  args: { forms: string; formId: string | number; source: FormSource; usage: FormUsage },
): Promise<ClaimResult> {
  let doc: Record<string, unknown>
  try {
    doc = await api(req).findByID({ collection: args.forms, id: args.formId, depth: 0, overrideAccess: true, req })
  } catch {
    return { ok: false, status: 404, error: 'This form no longer exists.' }
  }
  const owner = formSourceOf(doc)
  const ownedElsewhere = owner !== null && !(owner.collection === args.source.collection && owner.document === args.source.document && owner.block === args.source.block)
  const users = (await args.usage(req, args.formId)).filter((u) => !(u.collection === args.source.collection && String(u.id) === args.source.document))
  if (ownedElsewhere || users.length > 0) return { ok: true, formId: null, kept: false, doc }
  await api(req).update({
    collection: args.forms,
    id: args.formId,
    data: { [FORM_SOURCE_FIELD]: args.source },
    depth: 0,
    overrideAccess: true,
    req,
    context: { [FORM_SYNC_CONTEXT]: true },
  })
  return { ok: true, formId: args.formId, kept: true, doc }
}

const json = (body: FormClaimResponse, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

/** Path of the claim endpoint, under the live path: `POST {api}/builder/live/:collection/:id/form-claim`. */
export const FORM_CLAIM_PATH = 'form-claim'

/** The answer of the claim endpoint: the Form block's new content, and whether it keeps the form's id. */
export type FormClaimResponse =
  | { ok: true; kept: boolean; props: Record<string, unknown>; children: Block[] }
  | { ok: false; error: string }

/**
 * `POST {api}/builder/live/:collection/:id/form-claim` with `{ block, form }`: "Move into this page"
 * for the Form block `block`. Needs update access to the page. Answers with the block's content
 * made from the form (`formBlockFromDoc`); without `kept`, the content names no form, so the page
 * gets a new one when it is published.
 */
export function formClaimEndpoint(args: { forms: string; settings: readonly string[]; collections: LiveEndpointOptions['collections']; runtime: LiveRuntime }): Endpoint {
  return {
    path: `${LIVE_PATH}/:collection/:id/${FORM_CLAIM_PATH}`,
    method: 'post',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' }, 401)
      const target = targetOf(req, args.collections)
      if (target instanceof Response) return target
      if (!(await args.runtime.canUpdate(req, target.collection, target.id))) return json({ ok: false, error: 'You are not allowed to change this page.' }, 403)
      await addDataAndFileToRequest(req).catch(() => undefined)
      const body = (req.data ?? {}) as Record<string, unknown>
      const block = typeof body.block === 'string' ? body.block : ''
      const form = typeof body.form === 'string' || typeof body.form === 'number' ? body.form : null
      if (!block || form === null) return json({ ok: false, error: 'Send the Form block id as `block` and the form id as `form`.' }, 400)
      const result = await claimForm(req, { forms: args.forms, formId: form, source: { collection: target.collection, document: String(target.id), block }, usage: formUsage(args.forms) })
      if (!result.ok) return json({ ok: false, error: result.error }, result.status)
      // Virtual fields (the spam settings' Turnstile site key) are read-only values, never block props.
      const fields = (req.payload.collections as Record<string, { config: { fields: Field[] } } | undefined>)[args.forms]?.config.fields ?? []
      const { props, children } = formBlockFromDoc(withoutVirtualFields(result.doc, fields), args.settings)
      if (!result.kept) delete props.form
      return json({ ok: true, kept: result.kept, props, children })
    },
  }
}

/** The documents whose layouts use a form (published or latest draft): the references index ("Used in"). */
export function formUsage(forms: string): FormUsage {
  return async (req, formId) => {
    const { docs } = await findReferrers(req.payload, { relationTo: forms, value: formId }, { req, limit: 20 })
    return docs.map((doc) => ({ collection: doc.collection, id: doc.id }))
  }
}


/** The document without the values of virtual fields, also inside named groups (read-only values Payload computes on read). */
export function withoutVirtualFields(doc: Record<string, unknown>, fields: readonly Field[]): Record<string, unknown> {
  const out = { ...doc }
  for (const field of fields) {
    if (!('name' in field) || !field.name) {
      if ('fields' in field && Array.isArray(field.fields)) Object.assign(out, withoutVirtualFields(out, field.fields))
      continue
    }
    if ('virtual' in field && field.virtual) {
      delete out[field.name]
      continue
    }
    const value = out[field.name]
    if (field.type === 'group' && value && typeof value === 'object' && !Array.isArray(value)) {
      out[field.name] = withoutVirtualFields(value as Record<string, unknown>, field.fields)
    }
  }
  return out
}

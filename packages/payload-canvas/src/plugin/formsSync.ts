// Forms on pages, on the server: the forms collection's `source` field, the save hook step that
// writes each "Build here" Form block to its forms document, the "Move into this page" claim, and
// the check that a page form is still on the site before it takes a submission.
// See docs/architecture.md, "Forms on pages".

import {
  addDataAndFileToRequest,
  APIError,
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type Endpoint,
  type Field,
  type PayloadRequest,
  type Where,
} from 'payload'

import { LIVE_PATH, targetOf, type LiveEndpointOptions } from '../live/endpoints'
import type { LiveRuntime } from '../live/runtime'

import { localeOverlay, localeSettingsOf } from '../core/locale'
import { findBlock, isPlainObject, normalizeLayout } from '../core/tree'
import { FORM_BLOCK, formBlockMode, formIdOf } from '../forms/pageForms'
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
import { HOOK_CHANGES_CONTEXT, KEEP_LAYOUT_CONTEXT, docEntry, setDocEntry, storedLayout, type FormSync } from './hook'
import type { Block, Layout } from '../core/types'
import { findReferrers, referencesConfigOf } from './references'

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

type CollectionInfo = { config: { admin?: { useAsTitle?: string }; fields?: Field[]; versions?: unknown } }
const collectionOf = (req: PayloadRequest, slug: string) => (req.payload.collections as Record<string, CollectionInfo | undefined>)[slug]

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

/** True when a field list has a `localized` field at any depth (groups, rows, tabs, blocks, arrays). */
export function hasLocalizedField(fields: readonly unknown[] | undefined): boolean {
  return (fields ?? []).some((raw) => {
    if (!isPlainObject(raw)) return false
    if (raw.localized === true) return true
    if (Array.isArray(raw.fields) && hasLocalizedField(raw.fields)) return true
    if (Array.isArray(raw.tabs) && raw.tabs.some((tab) => isPlainObject(tab) && hasLocalizedField(tab.fields as unknown[]))) return true
    return Array.isArray(raw.blocks) && raw.blocks.some((block) => isPlainObject(block) && hasLocalizedField(block.fields as unknown[]))
  })
}

/** Where a form is used: the builder documents that reference it. Null when the references index is off (usage unknown). */
export type FormUsage = (req: PayloadRequest, formId: string | number) => Promise<Array<{ collection: string; id: string | number }> | null>

export type FormSyncOptions = {
  /** The page collection's layout field (a refused form is reported on it). */
  layoutField: string
  /** The page collection. */
  collection: string
  /** Slug of the forms collection. */
  forms: string
  /** The forms collection's setting names (`formSettingNames`). */
  settings: readonly string[]
  /** Where a form is used. Default: the references index (`formUsage`). */
  usage?: FormUsage
}

/** The Local API `locale` of a write: none without localization. */
const inLocale = (locale: string) => (locale ? { locale } : {})

/** The data each locale writes, and the hash over all of them. One entry without localized forms. */
function formWrites(block: Block, options: { settings: readonly string[]; fallbackTitle: string; locales: readonly string[] }) {
  const writes = options.locales.map((locale, i) => {
    // The first locale is the default: its values are the block's props. The others are its view in that locale.
    const view = i === 0 ? block : localeOverlay({ version: 1, blocks: [block] }, locale, []).view.blocks[0]!
    return { locale, data: formDataFromBlock(view, { settings: options.settings, fallbackTitle: options.fallbackTitle }) }
  })
  const hash = writes.length === 1 ? formDataHash(writes[0]!.data) : formDataHash(Object.fromEntries(writes.map((w) => [w.locale, w.data])))
  return { writes, hash }
}

/**
 * The save hook step (`HookOptions.formSync`) for one page collection. One query finds the forms
 * of the page's Form blocks by `source`. A block without one takes over the form it names when
 * that form has no source and no other document uses it ("Move into this page"; never on create),
 * else gets a new form (a new block, a duplicated block, a copied page). A form is written only
 * when its data changed. With localization the default locale is written explicitly, and when the
 * forms collection has localized fields each other locale too. Writes run as the system (access
 * off) in the page save's transaction. Deleted blocks keep their forms: their submissions point at them.
 */
export function pageFormSync(options: FormSyncOptions): FormSync {
  const usage = options.usage ?? formUsage(options.forms)
  return async (layout, { req, id, data, originalDoc, create }) => {
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
    const title = fallbackTitle({ ...originalDoc, ...data }, collectionOf(req, options.collection)?.config.admin?.useAsTitle)
    const localization = localeSettingsOf((req.payload.config as { localization?: unknown }).localization)
    const localized = Boolean(localization) && hasLocalizedField(collectionOf(req, options.forms)?.config.fields)
    const locales = localization ? (localized ? [localization.defaultLocale, ...localization.locales.filter((l) => l !== localization.defaultLocale)] : [localization.defaultLocale]) : ['']
    const ids = new Map<string, string | number>()
    for (const block of blocks) {
      const { writes, hash } = formWrites(block, { settings: options.settings, fallbackTitle: title, locales })
      const next = writes[0]!.data
      const source: FormSource = { collection: options.collection, document, block: block.id, hash }
      const stored = byBlock.get(block.id) ?? (create ? null : await adoptable(req, block, { forms: options.forms, collection: options.collection, document, usage }))
      const common = { collection: options.forms, depth: 0, overrideAccess: true, req, context: { [FORM_SYNC_CONTEXT]: true } }
      try {
        let formId: string | number
        if (stored) {
          formId = formIdOf(stored)!
          ids.set(block.id, formId)
          if (formSourceOf(stored)?.hash === hash) continue
          await api(req).update({ ...common, ...inLocale(writes[0]!.locale), id: formId, data: { ...clearedSettings(stored, next, options.settings), ...next, [FORM_SOURCE_FIELD]: source } })
        } else {
          const created = await api(req).create({ ...common, ...inLocale(writes[0]!.locale), data: { ...next, [FORM_SOURCE_FIELD]: source } })
          formId = formIdOf(created)!
          ids.set(block.id, formId)
        }
        for (const write of writes.slice(1)) await api(req).update({ ...common, ...inLocale(write.locale), id: formId, data: write.data })
      } catch (error) {
        // The page is not published: the problem names the form, so the editor can fix its settings.
        const message = `Form "${String(next.title)}" could not be saved: ${writeProblems(error)}`
        throw new ValidationError({ collection: options.collection, errors: [{ path: options.layoutField, message }], req }, req.t)
      }
    }
    return withFormIds(layout, ids)
  }
}

/**
 * The form a Form block names (`props.form`, set by "Move into this page") when the block may
 * take it over: the form has no source (made in the Forms collection) and no other document uses
 * it. Null otherwise, also when usage is unknown (references off): then the block gets a copy.
 */
async function adoptable(
  req: PayloadRequest,
  block: Block,
  args: { forms: string; collection: string; document: string; usage: FormUsage },
): Promise<Record<string, unknown> | null> {
  const formId = formIdOf(block.props?.form)
  if (formId === null) return null
  const doc = await api(req).findByID({ collection: args.forms, id: formId, depth: 0, overrideAccess: true, req }).catch(() => null)
  if (!doc || formSourceOf(doc) !== null) return null
  return (await usedElsewhere(req, formId, args)) ? null : doc
}

/** True when a document other than `collection`/`document` uses the form, or when that cannot be known. */
async function usedElsewhere(req: PayloadRequest, formId: string | number, args: { collection: string; document: string; usage: FormUsage }): Promise<boolean> {
  const users = await args.usage(req, formId)
  if (users === null) return true
  return users.some((u) => !(u.collection === args.collection && String(u.id) === args.document))
}

export type ClaimResult =
  | { ok: true; kept: boolean; doc: Record<string, unknown> }
  | { ok: false; status: number; error: string }

/**
 * "Move into this page", the answer only: whether the Form block `block` of `collection`/`document`
 * may keep form `formId` (`kept`: no other document uses it, and no other block owns it), and the
 * form to copy. Writes nothing: the page's next publish takes the form over (`pageFormSync`), so an
 * undo or an unsaved page leaves the form as it was. The form is read with the user's access.
 * Without the references index usage is unknown: never kept. The caller checks that the user may
 * update the page and that `block` is a Form block of it.
 */
export async function claimForm(
  req: PayloadRequest,
  args: { forms: string; formId: string | number; source: Omit<FormSource, 'hash'>; usage: FormUsage },
): Promise<ClaimResult> {
  let doc: Record<string, unknown>
  try {
    doc = await api(req).findByID({ collection: args.forms, id: args.formId, depth: 0, overrideAccess: false, user: req.user, req })
  } catch {
    return { ok: false, status: 404, error: 'This form no longer exists, or you may not read it.' }
  }
  const owner = formSourceOf(doc)
  const ownedElsewhere = owner !== null && !(owner.collection === args.source.collection && owner.document === args.source.document && owner.block === args.source.block)
  if (ownedElsewhere) return { ok: true, kept: false, doc }
  const elsewhere = await usedElsewhere(req, args.formId, { collection: args.source.collection, document: args.source.document, usage: args.usage })
  return { ok: true, kept: !elsewhere, doc }
}

const json = (body: FormClaimResponse, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

/** Path of the claim endpoint, under the live path: `POST {api}/builder/live/:collection/:id/form-claim`. */
export const FORM_CLAIM_PATH = 'form-claim'

/** The answer of the claim endpoint: the Form block's new content, and whether it keeps the form's id. */
export type FormClaimResponse =
  | { ok: true; kept: boolean; props: Record<string, unknown>; children: Block[] }
  | { ok: false; error: string }

/** The page's current layout: the open live session's, else the latest stored version. */
async function currentLayout(req: PayloadRequest, runtime: LiveRuntime, target: { collection: string; id: string | number; field: string }): Promise<Layout | null> {
  const open = runtime.sessions.peek(target.collection, target.id)
  if (open) return open.layout
  const doc = await api(req)
    .findByID({ collection: target.collection, id: target.id, depth: 0, draft: true, overrideAccess: false, user: req.user, req })
    .catch(() => null)
  return doc && isPlainObject(doc[target.field]) ? normalizeLayout(doc[target.field]) : null
}

/**
 * `POST {api}/builder/live/:collection/:id/form-claim` with `{ block, form }`: "Move into this page"
 * for the Form block `block`. Needs update access to the page, and `block` must be a Form block of
 * it. Answers with the block's content made from the form (`formBlockFromDoc`); without `kept`, the
 * content names no form, so the page gets a new one when it is published. Writes nothing.
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
      const layout = await currentLayout(req, args.runtime, target)
      if (findBlock(layout ?? { version: 1, blocks: [] }, block)?.type !== FORM_BLOCK) return json({ ok: false, error: 'This Form block is not on the page. Reload the editor and try again.' }, 400)
      const result = await claimForm(req, { forms: args.forms, formId: form, source: { collection: target.collection, document: String(target.id), block }, usage: formUsage(args.forms) })
      if (!result.ok) return json({ ok: false, error: result.error }, result.status)
      // Virtual fields (the spam settings' Turnstile site key) are read-only values, never block props.
      const fields = collectionOf(req, args.forms)?.config.fields ?? []
      const { props, children } = formBlockFromDoc(withoutVirtualFields(result.doc, fields), args.settings)
      if (!result.kept) delete props.form
      return json({ ok: true, kept: result.kept, props, children })
    },
  }
}

/** The documents whose layouts use a form (published or latest draft): the references index ("Used in"). Null without it. */
export function formUsage(forms: string): FormUsage {
  return async (req, formId) => {
    if (!referencesConfigOf(req.payload)?.relationTo.includes(forms)) return null
    const { docs } = await findReferrers(req.payload, { relationTo: forms, value: formId }, { req, limit: 20 })
    return docs.map((doc) => ({ collection: doc.collection, id: doc.id }))
  }
}

/** Where a builder collection keeps the blocks a form source names: the layout field, or a saved section's `blocks`. */
export type SourceField = { field: string; blocks: 'layout' | 'list' }

/**
 * After a document is created: writes its forms, which the save hook could not do without the new
 * id (a page created published, a copied page in a collection without drafts, a new saved
 * section). Runs when the new document is live (published, or saved without drafts). A create
 * never takes over another document's form: every block gets a new one. The ids go into the
 * document with a second save that keeps the layout as sent.
 */
export function formSyncAfterCreate(args: { collection: string; source: SourceField; formSync: FormSync }): CollectionAfterChangeHook {
  return async ({ collection, doc, operation, req }) => {
    if (operation !== 'create' || doc?.id === undefined) return doc
    if (collection.versions?.drafts && doc._status !== 'published') return doc
    const id = doc.id as string | number
    const layout =
      args.source.blocks === 'list'
        ? normalizeLayout({ version: 1, blocks: Array.isArray(doc[args.source.field]) ? doc[args.source.field] : [] })
        : ((req.payload.config as { localization?: unknown }).localization ? await storedLayout(req, collection, id, args.source.field) : null) ??
          (isPlainObject(doc[args.source.field]) ? normalizeLayout(doc[args.source.field]) : null)
    if (!layout || pageFormBlocks(layout).length === 0) return doc
    const next = await args.formSync(layout, { req, id, data: doc, originalDoc: undefined, create: true })
    if (next === layout) return doc
    const value = args.source.blocks === 'list' ? next.blocks : next
    await req.payload.update({
      collection: args.collection as never,
      id,
      data: { [args.source.field]: value } as never,
      depth: 0,
      overrideAccess: true,
      req,
      context: { [KEEP_LAYOUT_CONTEXT]: true, [FORM_SYNC_CONTEXT]: true },
    })
    return { ...doc, [args.source.field]: value }
  }
}

/**
 * Saved sections: a `beforeChange` hook after the section's blocks are set (`syncSectionBlocks`).
 * Writes the forms of the Form blocks in the section's `blocks` (one form per Form block, shared
 * by every page that shows the section) and stores the form ids in the blocks and the layout. The
 * collection has no drafts: every save of a section writes its changed forms. Open editors get the
 * ids like the props' hook changes.
 */
export function sectionFormSync(args: { collection: string; layoutField: string; formSync: FormSync }): CollectionBeforeChangeHook {
  return async ({ context, data, operation, originalDoc, req }) => {
    const id = originalDoc?.id as string | number | undefined
    if (operation !== 'update' || id === undefined || !data || !Array.isArray(data.blocks)) return data
    const layout = normalizeLayout({ version: 1, blocks: data.blocks })
    const next = await args.formSync(layout, { req, id, data, originalDoc })
    if (next === layout) return data
    data.blocks = next.blocks
    data[args.layoutField] = next
    // The editor's layout gets the form ids (session.ts, `adoptSaved`).
    const earlier = docEntry(context, HOOK_CHANGES_CONTEXT, args.collection, id) as { input?: Layout } | undefined
    setDocEntry(context, HOOK_CHANGES_CONTEXT, args.collection, id, { input: earlier?.input ?? layout, output: structuredClone(next) })
    return data
  }
}

/** The message for a submission to a page form that is no longer on the site. */
export const FORM_GONE_MESSAGE = 'This form is no longer on the site.'

/**
 * True when the document a form was built on still shows it: published (when its collection has
 * drafts), and its blocks (the published layout, or a saved section's blocks) still hold a "Build
 * here" Form block with the source's block id. Pure.
 */
export function formSourceLive(doc: Record<string, unknown> | null, source: Pick<FormSource, 'block'>, options: { drafts: boolean; field: SourceField }): boolean {
  if (!doc) return false
  if (options.drafts && doc._status !== 'published') return false
  const value = doc[options.field.field]
  const blocks = options.field.blocks === 'list' ? value : isPlainObject(value) ? value.blocks : null
  if (!Array.isArray(blocks)) return false
  const block = findBlock(normalizeLayout({ version: 1, blocks }), source.block)
  return block?.type === FORM_BLOCK && formBlockMode(block.props, block.slots) === 'build'
}

/**
 * The submissions `beforeValidate` hook that refuses a new submission to a form built on a page
 * or a saved section (`source`) when that page or section no longer shows it (removed block,
 * unpublished or deleted page). The form stays, for its old submissions. Forms made in the Forms
 * collection (no `source`) are not checked. Two reads by id: the form's source, then the document.
 */
export function formLiveCheck(args: { forms: string; sourceField: (collection: string) => SourceField | null }): CollectionBeforeValidateHook {
  return async ({ data, operation, req }) => {
    if (operation !== 'create' || !data) return data
    const formId = formIdOf(data.form)
    if (formId === null) return data
    const form = await api(req)
      .findByID({ collection: args.forms, id: formId, depth: 0, overrideAccess: true, req, select: { [FORM_SOURCE_FIELD]: true } })
      .catch(() => null)
    const source = form ? formSourceOf(form) : null
    if (!source) return data
    const field = args.sourceField(source.collection)
    const drafts = Boolean((collectionOf(req, source.collection)?.config.versions as { drafts?: unknown } | undefined)?.drafts)
    const doc = field
      ? await api(req)
          .findByID({ collection: source.collection, id: source.document, depth: 0, draft: false, overrideAccess: true, req, select: { [field.field]: true, ...(drafts ? { _status: true } : {}) } })
          .catch(() => null)
      : null
    if (field && formSourceLive(doc, source, { drafts, field })) return data
    throw new APIError(FORM_GONE_MESSAGE, 410, null, true)
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

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  APIError,
  getLatestCollectionVersion,
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type FieldHook,
  type PayloadRequest,
  type SanitizedCollectionConfig,
} from 'payload'
import { validateBindings, withoutBoundRequired } from '../core/bindings'
import { richTextFieldName } from '../core/blocks'
import { collectClasses } from '../core/classes'
import { enforcePropAccess, filterUnreadableProps, hasPropAccess } from '../core/fieldAccess'
import { hasPropHooks, runPropHooks, type FieldRunContext } from '../core/fieldHooks'
import { sameJson, type FieldRegistry } from '../core/fieldSemantics'
import { runPropValidators } from '../core/fieldValidate'
import { describeLayoutErrors } from '../core/issues'
import { hasLocaleValues, knownLocale, mergeLocaleView, resolveLayoutLocale, type FallbackLocale } from '../core/locale'
import { isPlainObject, normalizeLayout } from '../core/tree'
import type { BindingField, BlockDefinition, Layout, LocaleSettings } from '../core/types'
import { isBlockingError, isLayoutWarning, validateLayout, type LayoutError } from '../core/validate'
import { compileClasses, type CssOptions } from '../css'
import {
  checkStaleSave,
  defaultFieldClock,
  KEEP_LOCK_CONTEXT,
  recordFieldChanges,
  rememberLocks,
  restoreLocks,
  staleSaveMessage,
  topFieldLabel,
  type FieldClock,
  type LockPayload,
} from '../live/fieldsGuard'
import type { SessionManager } from '../live/session'

/** Value of the generated CSS field. */
export type GeneratedCss = { hash: string; css: string }

/** Bindable fields per collection, and the collection a document's own bindings read. */
export type BindingCheck = {
  sources: Record<string, readonly BindingField[]>
  /** The collection the layout's root bindings read (a template's target), or null. */
  collectionOf: (doc: Record<string, unknown>) => string | null
}

type HookOptions = {
  collection: string
  field: string
  cssField: string
  blocks: BlockDefinition[]
  css: CssOptions
  /** The live document sessions. While one is open, it owns the layout (see the guard below). */
  sessions?: SessionManager
  /** Checks bindings against the data model (when templates are on). */
  bindings?: BindingCheck
  /** Who changed which field last (the stale-save check). Default: the process-wide clock. */
  fieldClock?: FieldClock
  /** More server-owned fields (e.g. the references field) the stale-save check leaves out. */
  ownFields?: readonly string[]
  /** The `validate`, `hooks` and `access` of block props (captureFieldSemantics). */
  fieldRegistry?: FieldRegistry
  /** The locales of localized props. Null or left out: the layout is not localized. */
  localization?: LocaleSettings | null
}

/** `context` flag of the session's own draft saves. */
export const SESSION_SAVE_CONTEXT = 'builderSession'
/**
 * `context` flag of saves that must store exactly the layout they send (for example when the
 * plugin clears another template's "Default" flag). The session guard leaves them alone.
 */
export const KEEP_LAYOUT_CONTEXT = 'builderKeepLayout'
/** `context` key where the guard records the session seq it wrote. */
const GUARD_SEQ_CONTEXT = 'builderSessionSeq'
/**
 * `context` key where the save hook puts the layout before and after the prop hooks
 * (`{ input, output }`), when the hooks changed a value. The live session reads it after its save
 * and sends the changed values to every editor (session.ts, `adoptSaved`).
 */
export const HOOK_CHANGES_CONTEXT = 'builderHookChanges'
/**
 * `context` key where the layout field's `beforeValidate` hook records the operation's
 * `overrideAccess` (collection hooks do not get it). Field access applies only when it is false.
 */
const OVERRIDE_ACCESS_CONTEXT = 'builderOverrideAccess'
/**
 * `context` flag for the plugin's own reads that feed a save (Revert, Restore): the layout field's
 * `afterRead` hook returns the stored layout, without prop hooks and without removing props the
 * user may not read.
 */
export const RAW_LAYOUT_CONTEXT = 'builderRawLayout'
/**
 * `context` flag for reads that need every locale (the live session's load): the layout field's
 * `afterRead` hook returns the stored form with `locales`, instead of one locale's view. Prop
 * hooks and read access still apply, to every locale's values.
 */
export const ALL_LOCALES_CONTEXT = 'builderAllLocales'
/**
 * `context` flag of saves that send the stored form of the layout (Revert, Restore): no locale
 * merge, even when the layout has no translations left.
 */
export const STORED_LAYOUT_CONTEXT = 'builderStoredLayout'

/**
 * The stored layout of a document, with every locale: the latest version as the database holds
 * it. Payload gives the save hook `originalDoc` read in the request's locale (one locale's view),
 * so localized collections read the stored form here (one query per save).
 */
export async function storedLayout(req: PayloadRequest, collection: SanitizedCollectionConfig, id: string | number, field: string): Promise<Layout | null> {
  try {
    const doc = (await getLatestCollectionVersion({
      id,
      config: collection,
      payload: req.payload,
      query: { collection: collection.slug, where: { id: { equals: id } } } as never,
      req,
    })) as Record<string, unknown> | undefined
    return isPlainObject(doc?.[field]) ? normalizeLayout(doc[field]) : null
  } catch {
    return null
  }
}

/** The request's locale when it names one (not "all"), with the request's fallback. */
function requestLocale(req: unknown, settings: LocaleSettings): { locale: string; fallback: FallbackLocale } | null {
  const r = req as { locale?: unknown; fallbackLocale?: unknown } | undefined
  const locale = typeof r?.locale === 'string' ? r.locale : null
  if (!locale || locale === 'all' || locale === '*') return null
  const fallback = r?.fallbackLocale
  return {
    locale: knownLocale(settings, locale),
    fallback: typeof fallback === 'string' || Array.isArray(fallback) || fallback === false ? (fallback as FallbackLocale) : undefined,
  }
}

/** The layout before and after the prop hooks of one save. */
export type HookChanges = { input: Layout; output: Layout }

/** The prop hook changes a save recorded in its `context`, or null. */
export function hookChangesOf(context: Record<string, unknown> | undefined): HookChanges | null {
  const value = context?.[HOOK_CHANGES_CONTEXT]
  return isPlainObject(value) && isPlainObject(value.input) && isPlainObject(value.output) ? (value as HookChanges) : null
}

/**
 * A save by the plugin itself: the session's draft, publish / unpublish / revert, or the template
 * "Default" flag. It keeps Payload's document lock and skips the stale-save check.
 */
function isPluginSave(context: Record<string, unknown> | undefined): boolean {
  return Boolean(context?.[SESSION_SAVE_CONTEXT] || context?.[KEEP_LAYOUT_CONTEXT] || context?.[KEEP_LOCK_CONTEXT])
}

/**
 * Before a plugin save, remembers Payload's lock on the document, so `layoutAfterChange` can put
 * it back (Payload deletes the lock on every update). See live/fieldsGuard.ts.
 */
export function keepLockBeforeOperation(options: { collection: string }): CollectionBeforeOperationHook {
  return async ({ args, context, operation, req }) => {
    const id = (args as { id?: unknown }).id
    if (operation !== 'update' || !context || !isPluginSave(context)) return args
    if (typeof id !== 'string' && typeof id !== 'number') return args
    await rememberLocks({ payload: req.payload as unknown as LockPayload, req, collection: options.collection, id, context })
    return args
  }
}

function isGeneratedCss(value: unknown): value is GeneratedCss {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.hash === 'string' && typeof v.css === 'string'
}

/** The hash covers the class list and the entry CSS, so a theme change also recompiles. */
async function hashInput(classes: string[], entry: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(classes.join(' '))
  hash.update('\0')
  try {
    hash.update(await readFile(entry))
  } catch {
    // The compile reports a missing entry file. The hash stays usable.
  }
  return hash.digest('hex').slice(0, 16)
}

function formatErrors(errors: LayoutError[]): string {
  return errors
    .map((error) => (error.path ? `${error.path}: ${error.message}` : error.message))
    .join('\n')
}

/** What the props' own `validate` functions need. Without it, they do not run. */
export type FieldCheck = {
  registry: FieldRegistry
  /** `data` is the whole document; `req` is required. */
  ctx: FieldRunContext
  previous?: Layout | null
}

/**
 * Every problem of a layout, split for this save. With `publishing`, missing required props,
 * values outside their limits, the props' own `validate` messages, nesting and binding problems
 * block too. The save hook and the publish endpoint share this, so the endpoint can name the
 * blocks before it calls Payload. Bound props may stay empty. The `validate` functions run only
 * when publishing: their messages never block a draft, so drafts skip the cost.
 */
export async function checkLayout(
  layout: Layout,
  options: {
    blocks: readonly BlockDefinition[]
    publishing: boolean
    bindings?: BindingCheck
    doc?: Record<string, unknown>
    fields?: FieldCheck
    /** The document's locales: translations are checked too, and their problems name the locale. */
    localization?: LocaleSettings | null
  },
): Promise<{ blocking: LayoutError[]; warnings: LayoutError[] }> {
  const { blocks, publishing, bindings, fields, localization } = options
  const errors = withoutBoundRequired(validateLayout(layout, blocks as BlockDefinition[], { localization }), layout)
  if (bindings) errors.push(...validateBindings(layout, blocks, bindings.sources, bindings.collectionOf(options.doc ?? {})))
  if (publishing && fields) {
    errors.push(...(await runPropValidators(layout, { blocks, registry: fields.registry, previous: fields.previous, ctx: fields.ctx, localization: localization ?? null })))
  }
  const blocking: LayoutError[] = []
  const warnings: LayoutError[] = []
  for (const error of errors) {
    if (isBlockingError(error, publishing)) blocking.push(error)
    else warnings.push(error)
  }
  return { blocking, warnings }
}

/**
 * Normalizes and validates the layout, then compiles its classes into the generated CSS field.
 * The layout is only normalized, never rewritten: autosave does not send server changes back
 * to the editor. Compile errors are logged and keep the previous CSS, so saving never fails
 * because of CSS.
 *
 * Validation: unknown props and unknown block keys are logged, never blocking. Missing required
 * props, blocks in slots that refuse them and bindings the prop cannot use block only when the
 * document is published (collections with drafts). On collections without drafts they are
 * logged. All other errors (shape, duplicate ids, unknown block types, wrong prop types) always
 * block. The error text is readable ("Image: choose an image"); raw paths go to the server log.
 */
export function layoutBeforeChange(options: HookOptions): CollectionBeforeChangeHook {
  const { collection: slug, field, cssField, blocks, css, sessions, bindings, fieldRegistry: registry } = options
  const localization = options.localization ?? null
  const clock = options.fieldClock ?? defaultFieldClock()
  // The layout and the plugin's own fields: the session protects them, not the stale-save check.
  const pluginFields = new Set([field, cssField, richTextFieldName(field), ...(options.ownFields ?? [])])

  return async ({ collection, context, data, operation, originalDoc, req }) => {
    if (!data) return data

    // Session guard: while editors have the document open, the live session owns the layout.
    // A save from anywhere else (a stale autosave, Publish, the REST API) gets the session's
    // layout, so it can never overwrite collaborators. Publish therefore publishes the session.
    const docId = originalDoc?.id as string | number | undefined
    const own = context?.[SESSION_SAVE_CONTEXT] || context?.[KEEP_LAYOUT_CONTEXT]
    let guarded = false
    if (sessions && operation === 'update' && docId !== undefined && !own) {
      const open = sessions.peek(slug, docId)
      if (open) {
        data[field] = structuredClone(open.layout)
        guarded = true
        if (context) context[GUARD_SEQ_CONTEXT] = open.seq
      }
    }

    // Stale-save check for the other fields (title, slug, SEO, …): a form loaded before someone
    // else changed a field must not undo that change. See live/fieldsGuard.ts.
    if (operation === 'update' && docId !== undefined) {
      const conflicts = checkStaleSave({
        clock,
        collection: slug,
        id: docId,
        data,
        originalDoc,
        skip: pluginFields,
        user: req.user,
        context,
        pluginSave: isPluginSave(context),
      })
      if (conflicts.length > 0) {
        throw new APIError(staleSaveMessage(conflicts, (name) => topFieldLabel(collection.fields, name)), 409, undefined, true)
      }
    }

    const previous: unknown = originalDoc?.[cssField]
    // The generated field is server-owned. Ignore what the client sends.
    delete data[cssField]

    // A KEEP_LAYOUT save re-stores an already published layout (only another field changes), so
    // rules added since then do not block it.
    const publishing =
      Boolean(collection.versions?.drafts) && (data._status ?? originalDoc?._status) === 'published' && !context?.[KEEP_LAYOUT_CONTEXT]
    const merged = { ...originalDoc, ...data }
    const ctx: FieldRunContext = {
      layoutField: field,
      req,
      collection,
      context,
      operation,
      id: docId,
      data,
      originalDoc,
      overrideAccess: context?.[OVERRIDE_ACCESS_CONTEXT] !== false,
    }
    const fieldCheck = (saved: Layout | null): FieldCheck | undefined =>
      registry ? { registry, previous: saved, ctx: { ...ctx, data: merged } } : undefined
    const reject = (layout: Layout, blocking: LayoutError[]): never => {
      req.payload.logger.info(`[websiteBuilder] ${slug}.${field} not saved:\n${formatErrors(blocking)}`)
      // One entry for the field, so the admin shows every problem under it.
      const lines = describeLayoutErrors(layout, blocking, blocks, { localization }).map((issue) => issue.message)
      throw new ValidationError({ collection: slug, errors: [{ path: field, message: lines.join('\n') }], req }, req.t)
    }

    // Partial update without the layout: keep the stored layout and CSS. A publish of that kind
    // (REST `{ _status: 'published' }`) still runs the props' own `validate` functions.
    if (data[field] === undefined) {
      if (publishing && registry && isPlainObject(originalDoc?.[field])) {
        const stored = (localization && docId !== undefined ? await storedLayout(req, collection, docId, field) : null) ?? normalizeLayout(originalDoc[field])
        const { blocking } = await checkLayout(stored, { blocks, publishing, bindings, doc: merged, fields: fieldCheck(stored), localization })
        if (blocking.length > 0) reject(stored, blocking)
      }
      return data
    }

    // With localization, `originalDoc` holds one locale's view: the stored form comes from the database.
    const storedForm = localization && docId !== undefined && operation === 'update' ? await storedLayout(req, collection, docId, field) : null
    const savedLayout = storedForm ?? (isPlainObject(originalDoc?.[field]) ? normalizeLayout(originalDoc[field]) : null)
    let layout: Layout = normalizeLayout(data[field])
    // A layout read in one locale and sent back (REST, the Local API, the Edit view): its
    // localized props go to that locale, and the other locales keep their values, as Payload saves
    // localized fields. The session's own saves, guarded saves and Revert / Restore send the stored form.
    if (localization && !own && !guarded && !context?.[STORED_LAYOUT_CONTEXT] && !hasLocaleValues(layout)) {
      const at = requestLocale(req, localization)
      if (at) layout = mergeLocaleView(savedLayout, layout, at.locale, blocks, localization)
    }
    if (registry) {
      // Field access. The live session checks every edit when it arrives (session.ts), so its
      // saves and the layouts the guard put in are not checked again. Other saves (REST, the
      // Local API as a user, the Edit view) lose the changes the user may not make.
      if (!own && !guarded && context?.[OVERRIDE_ACCESS_CONTEXT] === false) {
        const withoutLayout = { ...originalDoc, [field]: undefined }
        const reverted = await enforcePropAccess(layout, { before: savedLayout, doc: withoutLayout, blocks, registry, ctx, localization })
        if (reverted.length > 0) {
          req.payload.logger.info(
            `[websiteBuilder] ${slug}.${field}: kept the saved value of props the user may not change: ${reverted.map((d) => d.path).join(', ')}`,
          )
        }
      }
      // Prop hooks, in Payload's order: beforeValidate, then beforeChange, then validation.
      if (hasPropHooks(registry, 'beforeValidate') || hasPropHooks(registry, 'beforeChange')) {
        const input = structuredClone(layout)
        await runPropHooks('beforeValidate', layout, { blocks, registry, previous: savedLayout, ctx, localization })
        await runPropHooks('beforeChange', layout, { blocks, registry, previous: savedLayout, ctx, localization })
        if (context && !sameJson(input, layout)) context[HOOK_CHANGES_CONTEXT] = { input, output: structuredClone(layout) } satisfies HookChanges
      }
    }
    const { blocking, warnings } = await checkLayout(layout, { blocks, publishing, bindings, doc: merged, fields: fieldCheck(savedLayout), localization })
    if (blocking.length > 0) reject(layout, blocking)
    const logged = warnings.filter(isLayoutWarning)
    if (logged.length > 0) {
      req.payload.logger.warn(`[websiteBuilder] ${slug}.${field} saved with warnings:\n${formatErrors(logged)}`)
    }
    data[field] = layout

    // Block definitions add the classes their components use, so those reach the CSS too.
    const classes = collectClasses(layout, blocks)
    const hash = await hashInput(classes, css.entry)
    if (isGeneratedCss(previous) && previous.hash === hash) {
      data[cssField] = previous
      return data
    }

    if (classes.length === 0) {
      data[cssField] = { hash, css: '' } satisfies GeneratedCss
      return data
    }

    try {
      const output = await compileClasses(classes, css)
      data[cssField] = { hash, css: output } satisfies GeneratedCss
    } catch (error) {
      req.payload.logger.error({
        err: error,
        msg: `[websiteBuilder] CSS compile failed for ${slug}.${field}. Kept the previous CSS.`,
      })
      if (isGeneratedCss(previous)) data[cssField] = previous
    }
    return data
  }
}

/**
 * After a guarded save stored the session's layout, the session does not need to save that
 * state again. This matters after Publish: a later draft save of the same layout would mark the
 * document as changed.
 */
export function layoutAfterChange(options: {
  collection: string
  sessions: SessionManager
  fieldClock?: FieldClock
  /** For the props' `afterChange` hooks: the layout field, the blocks, the field registry and the locales. */
  props?: { field: string; blocks: readonly BlockDefinition[]; registry: FieldRegistry; localization?: LocaleSettings | null }
}): CollectionAfterChangeHook {
  const clock = options.fieldClock ?? defaultFieldClock()
  const props = options.props
  return async ({ collection, context, data, doc, operation, previousDoc, req }) => {
    if (doc?.id === undefined) return doc
    const seq = context?.[GUARD_SEQ_CONTEXT]
    if (typeof seq === 'number') {
      options.sessions.markSaved(options.collection, doc.id, seq, { updatedAt: doc.updatedAt, status: doc._status })
      // The save ran the prop hooks on the session's layout. Every editor gets the changed values.
      const changes = hookChangesOf(context)
      if (changes) options.sessions.adoptSaved(options.collection, doc.id, { ...changes, seq })
    }
    // The props' afterChange hooks. As in Payload, what they return changes only the returned document.
    let result = doc
    if (props && hasPropHooks(props.registry, 'afterChange') && isPlainObject(doc[props.field])) {
      const layout = structuredClone(doc[props.field]) as Layout
      const previous = isPlainObject(previousDoc?.[props.field]) ? normalizeLayout(previousDoc[props.field]) : null
      const changed = await runPropHooks('afterChange', layout, {
        blocks: props.blocks,
        registry: props.registry,
        previous,
        ctx: { layoutField: props.field, req, collection, context, operation, id: doc.id, data, originalDoc: doc, previousDoc },
        localization: props.localization ?? null,
      })
      if (changed) result = { ...doc, [props.field]: layout }
    }
    if (operation !== 'update') return result
    recordFieldChanges({ clock, collection: options.collection, doc, user: req.user, context })
    // Same transaction as Payload's delete of the lock, so nobody sees the document unlocked.
    await restoreLocks({ payload: req.payload as unknown as LockPayload, req, collection: options.collection, id: doc.id, context })
    return result
  }
}

/**
 * The layout field's `beforeValidate` hook: records the operation's `overrideAccess` in `context`,
 * because the collection's `beforeChange` hooks do not get it (field access needs it).
 */
export function recordOverrideAccess(): FieldHook {
  return ({ context, overrideAccess, value }) => {
    if (context) context[OVERRIDE_ACCESS_CONTEXT] = overrideAccess === true
    return value
  }
}

/**
 * The layout field's `afterRead` hook: runs the props' `afterRead` hooks and leaves out the props
 * the user may not read (`access.read`, unless `overrideAccess`). It runs for every read: REST,
 * GraphQL, the Local API, versions, and the live session when it loads the document. The plugin's
 * own reads for Revert and Restore set `RAW_LAYOUT_CONTEXT` and get the stored layout.
 */
export function layoutAfterRead(options: {
  field: string
  blocks: readonly BlockDefinition[]
  registry: FieldRegistry
  /** The locales of localized props. A read in one locale gets that locale's view. */
  localization?: LocaleSettings | null
}): FieldHook {
  const { field, blocks, registry } = options
  const localization = options.localization ?? null
  return async (args) => {
    const { value, context, overrideAccess } = args
    if (!isPlainObject(value) || context?.[RAW_LAYOUT_CONTEXT]) return value
    // Localization: a read in one locale (REST `?locale=de`, the Local API's `locale`) gets that
    // locale's values with Payload's fallback, and no `locales`. `locale=all` and the live
    // session's load get the stored form.
    const at = localization && !context?.[ALL_LOCALES_CONTEXT] ? requestLocale(args.req, localization) : null
    const view = at && localization ? resolveLayoutLocale(normalizeLayout(value), blocks, localization, at.locale, at.fallback) : null
    const hooks = hasPropHooks(registry, 'afterRead')
    const read = !overrideAccess && hasPropAccess(registry, 'read')
    if (!hooks && !read) return view ?? value
    const doc = (args.data ?? {}) as Record<string, unknown>
    const layout = structuredClone(view ?? value) as Layout
    // The stored form: the hooks and read access apply to every locale's values too.
    const perLocale = view ? undefined : localization
    const ctx: FieldRunContext = {
      layoutField: field,
      req: args.req,
      collection: args.collection,
      context,
      operation: 'read',
      id: doc.id as string | number | undefined,
      data: doc,
      originalDoc: doc,
      overrideAccess,
      findMany: args.findMany,
      depth: args.depth,
      currentDepth: args.currentDepth,
      draft: args.draft,
      showHiddenFields: args.showHiddenFields,
    }
    if (hooks) await runPropHooks('afterRead', layout, { blocks, registry, ctx, localization: perLocale })
    if (read) await filterUnreadableProps(layout, { blocks, registry, ctx, doc, localization: perLocale })
    return layout
  }
}

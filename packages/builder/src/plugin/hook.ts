import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  APIError,
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
} from 'payload'
import { validateBindings, withoutBoundRequired } from '../core/bindings'
import { richTextFieldName } from '../core/blocks'
import { collectClasses } from '../core/classes'
import { describeLayoutErrors } from '../core/issues'
import { normalizeLayout } from '../core/tree'
import type { BindingField, BlockDefinition, Layout } from '../core/types'
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

/**
 * Every problem of a layout, split for this save. With `publishing`, missing required props,
 * nesting and binding problems block too. The save hook and the publish endpoint share this, so
 * the endpoint can name the blocks before it calls Payload. Bound props may stay empty.
 */
export function checkLayout(
  layout: Layout,
  options: { blocks: readonly BlockDefinition[]; publishing: boolean; bindings?: BindingCheck; doc?: Record<string, unknown> },
): { blocking: LayoutError[]; warnings: LayoutError[] } {
  const { blocks, publishing, bindings } = options
  const errors = withoutBoundRequired(validateLayout(layout, blocks as BlockDefinition[]), layout)
  if (bindings) errors.push(...validateBindings(layout, blocks, bindings.sources, bindings.collectionOf(options.doc ?? {})))
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
  const { collection: slug, field, cssField, blocks, css, sessions, bindings } = options
  const clock = options.fieldClock ?? defaultFieldClock()
  // The layout and the plugin's own fields: the session protects them, not the stale-save check.
  const pluginFields = new Set([field, cssField, richTextFieldName(field)])

  return async ({ collection, context, data, operation, originalDoc, req }) => {
    if (!data) return data

    // Session guard: while editors have the document open, the live session owns the layout.
    // A save from anywhere else (a stale autosave, Publish, the REST API) gets the session's
    // layout, so it can never overwrite collaborators. Publish therefore publishes the session.
    const docId = originalDoc?.id as string | number | undefined
    const own = context?.[SESSION_SAVE_CONTEXT] || context?.[KEEP_LAYOUT_CONTEXT]
    if (sessions && operation === 'update' && docId !== undefined && !own) {
      const open = sessions.peek(slug, docId)
      if (open) {
        data[field] = structuredClone(open.layout)
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

    // Partial update without the layout: keep the stored layout and CSS.
    if (data[field] === undefined) return data

    const layout: Layout = normalizeLayout(data[field])
    // A KEEP_LAYOUT save re-stores an already published layout (only another field changes), so
    // rules added since then do not block it.
    const publishing =
      Boolean(collection.versions?.drafts) && (data._status ?? originalDoc?._status) === 'published' && !context?.[KEEP_LAYOUT_CONTEXT]
    const { blocking, warnings } = checkLayout(layout, { blocks, publishing, bindings, doc: { ...originalDoc, ...data } })
    if (blocking.length > 0) {
      req.payload.logger.info(`[websiteBuilder] ${slug}.${field} not saved:\n${formatErrors(blocking)}`)
      // One entry for the field, so the admin shows every problem under it.
      const lines = describeLayoutErrors(layout, blocking, blocks).map((issue) => issue.message)
      throw new ValidationError({ collection: slug, errors: [{ path: field, message: lines.join('\n') }], req }, req.t)
    }
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
export function layoutAfterChange(options: { collection: string; sessions: SessionManager; fieldClock?: FieldClock }): CollectionAfterChangeHook {
  const clock = options.fieldClock ?? defaultFieldClock()
  return async ({ context, doc, operation, req }) => {
    if (doc?.id === undefined) return doc
    const seq = context?.[GUARD_SEQ_CONTEXT]
    if (typeof seq === 'number') {
      options.sessions.markSaved(options.collection, doc.id, seq, { updatedAt: doc.updatedAt, status: doc._status })
    }
    if (operation !== 'update') return doc
    recordFieldChanges({ clock, collection: options.collection, doc, user: req.user, context })
    // Same transaction as Payload's delete of the lock, so nobody sees the document unlocked.
    await restoreLocks({ payload: req.payload as unknown as LockPayload, req, collection: options.collection, id: doc.id, context })
    return doc
  }
}

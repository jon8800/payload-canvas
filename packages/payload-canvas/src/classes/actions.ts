// What the class endpoints and MCP tools do: list, create or update, rename, delete, import from
// the site's CSS, publish, and the hook that publishes a page's classes with the page.
// Every write goes through the Local API as the request's user (`overrideAccess: false`), so the
// collection's access, hooks, validation and versions apply. Server-only.

import { APIError, ValidationError, type CollectionAfterChangeHook, type PayloadRequest } from 'payload'

import { normalizeLayout, walkBlocks } from '../core/tree'
import { getSiteClassRules } from '../css'
import { classesConfigOf, type ClassesServerConfig } from './config'
import { SKIP_CLASSES_SHEET_CONTEXT } from './collection'
import { storeClassesSheet } from './sheet'
import {
  bareClass,
  classNameProblem,
  classTokens,
  FORCE_DELETE_CLASS_CONTEXT,
  importSiteClass,
  toBuilderClass,
  withPreviousName,
  type BuilderClass,
  type ClassUsage,
} from './shared'
import { classUsage, replaceClassInLayouts, usedClassNames, type ReplaceResult } from './usage'

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; usage?: ClassUsage }

/** A readable message of a Payload error: the field messages of a ValidationError, else the message. */
export function errorMessage(error: unknown): string {
  if (error instanceof ValidationError) {
    const list = (error.data as { errors?: Array<{ message?: string }> } | undefined)?.errors ?? []
    const text = list.map((e) => e.message).filter(Boolean).join(' ')
    if (text) return text
  }
  return error instanceof Error ? error.message : String(error)
}

const statusOf = (error: unknown) =>
  error instanceof ValidationError ? 400 : error instanceof APIError ? error.status : (error as { status?: number })?.status && typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 500

const fail = (error: unknown): { ok: false; status: number; error: string } => ({ ok: false, status: statusOf(error), error: errorMessage(error) })

function requireConfig(req: PayloadRequest): ClassesServerConfig {
  const config = classesConfigOf(req.payload)
  if (!config) throw new APIError('Editable classes are turned off (`classes: false`).', 404, null, true)
  return config
}

const asUser = (req: PayloadRequest) => ({ overrideAccess: false, user: req.user, req })

/** The fields of a class that a version holds. */
const pick = (source: Record<string, unknown>) => ({ label: source.label ?? null, group: source.group ?? null, styles: source.styles ?? null, css: source.css ?? null })

/** The classes (their latest drafts) the request's user may read, by name. */
export async function loadClasses(req: PayloadRequest): Promise<BuilderClass[]> {
  const config = requireConfig(req)
  const result = await req.payload.find({ collection: config.slug as never, draft: true, depth: 0, pagination: false, sort: 'name', ...asUser(req) })
  return (result.docs as unknown as Record<string, unknown>[]).flatMap((doc) => toBuilderClass(doc) ?? [])
}

/** One class by name (its latest draft), or null. Former names do not count. */
export async function findClass(req: PayloadRequest, name: string): Promise<BuilderClass | null> {
  const config = requireConfig(req)
  const result = await req.payload.find({ collection: config.slug as never, draft: true, depth: 0, limit: 1, pagination: false, where: { name: { equals: name } }, ...asUser(req) })
  const doc = result.docs[0] as unknown as Record<string, unknown> | undefined
  return doc ? toBuilderClass(doc) : null
}

async function byId(req: PayloadRequest, id: string | number, draft: boolean): Promise<Record<string, unknown> | null> {
  const config = requireConfig(req)
  return (await req.payload.findByID({ collection: config.slug as never, id, depth: 0, draft, ...asUser(req) }).catch(() => null)) as Record<string, unknown> | null
}

/** Publishes the class's latest draft. */
export async function publishClass(req: PayloadRequest, id: string | number): Promise<ActionResult<{ class: BuilderClass }>> {
  try {
    const config = requireConfig(req)
    const doc = await req.payload.update({ collection: config.slug as never, id, data: { _status: 'published' } as never, depth: 0, ...asUser(req) })
    return { ok: true, class: toBuilderClass(doc as unknown as Record<string, unknown>)! }
  } catch (error) {
    return fail(error)
  }
}

export type ClassInput = {
  label?: string | null
  group?: string | null
  styles?: string | null
  css?: string | null
}

/**
 * Creates the class `name`, or updates it when it exists (its latest draft). `publish`: publish it
 * too. `newName`: rename it first (see `renameClass`).
 */
export async function upsertClass(
  req: PayloadRequest,
  args: ClassInput & { name: string; newName?: string; publish?: boolean },
): Promise<ActionResult<{ class: BuilderClass; created: boolean; renamed?: ReplaceResult }>> {
  try {
    const config = requireConfig(req)
    const data: Record<string, unknown> = {}
    for (const key of ['label', 'group', 'styles', 'css'] as const) if (args[key] !== undefined) data[key] = args[key]
    const existing = await findClass(req, args.name)
    if (!existing) {
      const problem = classNameProblem(args.newName ?? args.name)
      if (problem) return { ok: false, status: 400, error: problem }
      const doc = await req.payload.create({
        collection: config.slug as never,
        data: { ...data, name: args.newName ?? args.name, _status: args.publish ? 'published' : 'draft' } as never,
        draft: !args.publish,
        depth: 0,
        ...asUser(req),
      })
      return { ok: true, class: toBuilderClass(doc as unknown as Record<string, unknown>)!, created: true }
    }
    let renamed: ReplaceResult | undefined
    if (args.newName && args.newName !== existing.name) {
      const result = await renameClass(req, existing.id, args.newName)
      if (!result.ok) return result
      renamed = result.replaced
    }
    const doc = await req.payload.update({
      collection: config.slug as never,
      id: existing.id,
      data: { ...data, ...(args.publish ? { _status: 'published' } : {}) } as never,
      draft: !args.publish,
      depth: 0,
      ...asUser(req),
    })
    return { ok: true, class: toBuilderClass(doc as unknown as Record<string, unknown>)!, created: false, ...(renamed ? { renamed } : {}) }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Renames a class everywhere: the class (its published version and its latest draft; pending draft
 * changes stay drafts), and every layout that uses the old name, through the live sessions. The
 * old published name stays as a former name, so published pages keep their look until they are
 * published again.
 */
export async function renameClass(req: PayloadRequest, id: string | number, name: string): Promise<ActionResult<{ class: BuilderClass; replaced: ReplaceResult }>> {
  try {
    const config = requireConfig(req)
    const next = name.trim()
    const problem = classNameProblem(next)
    if (problem) return { ok: false, status: 400, error: problem }
    const draft = await byId(req, id, true)
    if (!draft || typeof draft.name !== 'string') return { ok: false, status: 404, error: 'The class does not exist, or you may not read it.' }
    const old = draft.name
    if (old === next) return { ok: true, class: toBuilderClass(draft)!, replaced: { documents: 0, blocks: 0, failed: [] } }
    const main = await byId(req, id, false)
    const published = main?._status === 'published' ? main : null
    const previous = published ? withPreviousName(withPreviousName(draft.previousNames as string[] | undefined, old, next), String(published.name), next) : ((draft.previousNames as string[] | undefined) ?? []).filter((n) => n !== next)
    const write = (data: Record<string, unknown>, asDraft: boolean) =>
      req.payload.update({ collection: config.slug as never, id, data: { ...data, name: next, previousNames: previous } as never, draft: asDraft, depth: 0, ...asUser(req) })

    let doc: unknown
    if (!published) doc = await write({}, true)
    else if (draft._status === 'published') doc = await write({ _status: 'published' }, false)
    else {
      // Publish the new name with the published styles, then put the pending draft back on top.
      await write({ ...pick(published), _status: 'published' }, false)
      doc = await write({ ...pick(draft), _status: 'draft' }, true)
    }
    const replaced = await replaceClassInLayouts(req, old, next)
    return { ok: true, class: toBuilderClass(doc as Record<string, unknown>)!, replaced }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Deletes a class. While blocks use it, `removeFromBlocks` must be true: the class is removed from
 * those blocks first (their drafts, through the live sessions). Published pages lose its styles
 * at once.
 */
export async function deleteClass(
  req: PayloadRequest,
  id: string | number,
  options: { removeFromBlocks?: boolean } = {},
): Promise<ActionResult<{ name: string; replaced: ReplaceResult }>> {
  try {
    const config = requireConfig(req)
    const draft = await byId(req, id, true)
    if (!draft || typeof draft.name !== 'string') return { ok: false, status: 404, error: 'The class does not exist, or you may not read it.' }
    const name = draft.name
    const usage = (await classUsage(req, [name]))[name]
    if (usage && usage.blocks > 0 && !options.removeFromBlocks) {
      return { ok: false, status: 409, error: `.${name} is used on ${usage.blocks} block(s). Pass removeFromBlocks to remove it from them and delete it.`, usage }
    }
    const replaced = usage && usage.blocks > 0 ? await replaceClassInLayouts(req, name, null) : { documents: 0, blocks: 0, failed: [] }
    if (replaced.failed.length > 0) {
      return { ok: false, status: 403, error: `Not deleted: .${name} could not be removed from ${replaced.failed.map((f) => `“${f.title}” (${f.error})`).join(', ')}.` }
    }
    await req.payload.delete({ collection: config.slug as never, id, ...asUser(req), context: { [FORCE_DELETE_CLASS_CONTEXT]: true } })
    return { ok: true, name, replaced }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Creates published classes from the site's code `@utility` classes (`/* @canvas Group: Label *\/`
 * comments give label and group). Names that are classes already are skipped. One stylesheet
 * compile at the end. After the import the classes are the source: the code rules can go.
 */
export async function importSiteClasses(req: PayloadRequest, names?: readonly string[]): Promise<ActionResult<{ created: BuilderClass[]; skipped: Array<{ name: string; reason: string }> }>> {
  try {
    const config = requireConfig(req)
    const rules = (await getSiteClassRules(config.css)).filter((rule) => !names || names.includes(rule.name))
    const existing = await req.payload.find({ collection: config.slug as never, draft: true, depth: 0, pagination: false, overrideAccess: true, req, select: { name: true } as never })
    const taken = new Set((existing.docs as unknown as Array<{ name?: unknown }>).map((d) => d.name))
    const created: BuilderClass[] = []
    const skipped: Array<{ name: string; reason: string }> = []
    for (const rule of rules) {
      if (taken.has(rule.name)) {
        skipped.push({ name: rule.name, reason: 'already a class' })
        continue
      }
      try {
        const doc = await req.payload.create({
          collection: config.slug as never,
          data: { ...importSiteClass(rule), _status: 'published' } as never,
          depth: 0,
          ...asUser(req),
          context: { [SKIP_CLASSES_SHEET_CONTEXT]: true },
        })
        created.push(toBuilderClass(doc as unknown as Record<string, unknown>)!)
      } catch (error) {
        skipped.push({ name: rule.name, reason: errorMessage(error) })
      }
    }
    if (created.length > 0) await storeClassesSheet(req.payload, req)
    return { ok: true, created, skipped }
  } catch (error) {
    return fail(error)
  }
}

/** The bare class names a layout uses (blocks and their parts). */
function layoutClassNames(layout: ReturnType<typeof normalizeLayout>): Set<string> {
  const names = new Set<string>()
  walkBlocks(layout, (block) => {
    for (const token of classTokens(block.className)) names.add(bareClass(token))
    for (const value of Object.values(block.partClassName ?? {})) if (typeof value === 'string') for (const token of classTokens(value)) names.add(bareClass(token))
  })
  return names
}

/**
 * A builder collection's `afterChange` hook: publishing a page publishes the classes it uses that
 * have unpublished changes (new classes, edited styles, a rename), as the same user. So the live
 * page looks like the canvas. Classes the user may not update stay drafts (logged).
 */
export function publishClassesWithPage(field: string): CollectionAfterChangeHook {
  return async ({ doc, req }) => {
    if (doc?._status !== 'published') return doc
    const config = classesConfigOf(req.payload)
    if (!config) return doc
    const names = layoutClassNames(normalizeLayout(doc[field]))
    if (names.size === 0) return doc
    const pending = await req.payload
      .find({ collection: config.slug as never, draft: true, depth: 0, pagination: false, where: { name: { in: [...names] } }, overrideAccess: true, req })
      .catch(() => null)
    for (const cls of (pending?.docs ?? []) as unknown as Array<Record<string, unknown>>) {
      if (cls._status !== 'draft') continue
      try {
        // A save without a user (a seed script, a migration) publishes them as the system does.
        await req.payload.update({ collection: config.slug as never, id: cls.id as string, data: { _status: 'published' } as never, depth: 0, ...(req.user ? asUser(req) : { overrideAccess: true, req }) })
      } catch (error) {
        req.payload.logger.warn(`[websiteBuilder] Publishing the page did not publish the class "${String(cls.name)}": ${errorMessage(error)}`)
      }
    }
    return doc
  }
}

/** Every name the classes answer to (names and former names), for usage counts. */
export function namesOf(classes: readonly BuilderClass[]): string[] {
  return [...new Set(classes.flatMap((c) => [c.name, ...(c.previousNames ?? [])]))]
}

/**
 * The classes no block uses: not in any layout's latest draft or open live session, and not in any
 * published layout (every document, not only those the user may read), by name or former name.
 */
export async function unusedClasses(req: PayloadRequest): Promise<BuilderClass[]> {
  const classes = await loadClasses(req)
  const used = await usedClassNames(req, namesOf(classes))
  return classes.filter((c) => [c.name, ...(c.previousNames ?? [])].every((name) => !used.has(name)))
}

/**
 * Deletes every class no block uses (see `unusedClasses`), as the request's user. Classes the user
 * may not delete are reported in `failed`.
 */
export async function removeUnusedClasses(req: PayloadRequest): Promise<ActionResult<{ deleted: string[]; failed: Array<{ name: string; error: string }> }>> {
  try {
    const config = requireConfig(req)
    const deleted: string[] = []
    const failed: Array<{ name: string; error: string }> = []
    for (const item of await unusedClasses(req)) {
      try {
        await req.payload.delete({ collection: config.slug as never, id: item.id, ...asUser(req) })
        deleted.push(item.name)
      } catch (error) {
        failed.push({ name: item.name, error: errorMessage(error) })
      }
    }
    return { ok: true, deleted, failed }
  } catch (error) {
    return fail(error)
  }
}

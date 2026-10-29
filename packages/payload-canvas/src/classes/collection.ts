// The classes collection: one document per editable class, with drafts and versions. Server-only
// (the revalidation imports next/cache).

import { revalidatePath } from 'next/cache'
import {
  APIError,
  type Access,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
  type PayloadRequest,
  type Validate,
} from 'payload'

import { isTailwindUtility } from '../css'
import { classesConfigOf, type ClassesOptions } from './config'
import { storeClassesSheet } from './sheet'
import { classNameProblem, cssProblem, FORCE_DELETE_CLASS_CONTEXT, normalizeStyles, plural, withPreviousName } from './shared'
import { classUsage } from './usage'

/** `context` flag: skip the stylesheet compile in this save (a batch compiles once at its end). */
export const SKIP_CLASSES_SHEET_CONTEXT = 'builderSkipClassesSheet'

const signedIn: Access = ({ req }) => Boolean(req.user)

/** Form, no Tailwind utility with the name, unique among the latest drafts too. */
const validateName: Validate<string | null | undefined> = async (value, options) => {
  const problem = classNameProblem(value)
  if (problem) return problem
  const name = String(value).trim()
  const { req } = options
  const id = (options as { id?: string | number }).id
  const config = classesConfigOf(req.payload)
  if (!config) return true
  if (await isTailwindUtility(name, config.css).catch(() => false)) {
    return `“${name}” is already a Tailwind class. Pick another name, for example “${name}-style”.`
  }
  // The database's unique index covers the main documents; a draft rename must not clash either.
  const clash = await req.payload.find({
    collection: config.slug as never,
    draft: true,
    depth: 0,
    limit: 1,
    pagination: false,
    where: { and: [{ name: { equals: name } }, ...(id !== undefined ? [{ id: { not_equals: id } }] : [])] },
    overrideAccess: true,
    req,
  })
  return clash.docs.length > 0 ? `A class named “${name}” already exists.` : true
}

/** Custom CSS must compile when the class is published. Drafts may hold half-typed CSS. */
const validateCss: Validate<string | null | undefined> = (value, { data }) =>
  (data as { _status?: unknown } | undefined)?._status === 'published' ? (cssProblem(value) ?? true) : true

/**
 * On publish, a name that differs from the published one keeps the published name as a former
 * name: published pages that still use it keep their look. Styles get one space between classes.
 */
const beforeChange: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if ('styles' in data) data.styles = normalizeStyles(data.styles)
  if (typeof data.name === 'string') data.name = data.name.trim()
  if (operation !== 'update' || data._status !== 'published' || originalDoc?.id === undefined) return data
  const config = classesConfigOf(req.payload)
  if (!config) return data
  const published = (await req.payload
    .findByID({ collection: config.slug as never, id: originalDoc.id as string, depth: 0, draft: false, overrideAccess: true, req })
    .catch(() => null)) as Record<string, unknown> | null
  const name = typeof data.name === 'string' ? data.name : String(originalDoc.name ?? '')
  const previous = Array.isArray(data.previousNames) ? (data.previousNames as string[]) : ((originalDoc.previousNames as string[] | undefined) ?? [])
  if (published?._status === 'published' && typeof published.name === 'string' && published.name !== name) {
    data.previousNames = withPreviousName(previous, published.name, name)
  } else if (previous.includes(name)) {
    data.previousNames = previous.filter((n) => n !== name)
  }
  return data
}

/** Clears Next's page cache: the stylesheet's hashed URL is in every page's `<head>`. */
function revalidate(req: PayloadRequest) {
  if (req.context?.disableRevalidate) return
  try {
    revalidatePath('/', 'layout')
  } catch (error) {
    req.payload.logger.debug(`[websiteBuilder] Classes revalidation skipped: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function recompile(req: PayloadRequest) {
  if (req.context?.[SKIP_CLASSES_SHEET_CONTEXT]) return
  try {
    const sheet = await storeClassesSheet(req.payload, req)
    if (sheet?.changed) revalidate(req)
  } catch (error) {
    req.payload.logger.error({ err: error, msg: '[websiteBuilder] The classes stylesheet failed to compile. The site keeps the last one.' })
  }
}

/** The published stylesheet changes with a publish, an unpublish (the main document was published) and a delete. */
const afterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (doc?._status === 'published' || previousDoc?._status === 'published') await recompile(req)
  return doc
}

const afterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await recompile(req)
  return doc
}

/** A class still used by blocks is not deleted (the builder's delete removes it from them first). */
const beforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  if (req.context?.[FORCE_DELETE_CLASS_CONTEXT]) return
  const config = classesConfigOf(req.payload)
  if (!config) return
  const doc = (await req.payload.findByID({ collection: config.slug as never, id, depth: 0, draft: true, overrideAccess: true, req }).catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!doc || typeof doc.name !== 'string') return
  const usage = (await classUsage(req, [doc.name], { asUser: false }))[doc.name]
  if (!usage || usage.blocks === 0) return
  const where = usage.documents
    .slice(0, 5)
    .map((d) => `“${d.title}”`)
    .join(', ')
  throw new APIError(
    `The class .${doc.name} is used on ${plural(usage.blocks, 'block')} on ${plural(usage.documents.length, 'page')} (${where}${usage.documents.length > 5 ? ', …' : ''}). ` +
      'Delete it in the builder’s Styles panel, which removes it from those blocks too.',
    409,
    null,
    true,
  )
}

export function classesCollection(slug: string, options: ClassesOptions = {}): CollectionConfig {
  return {
    slug,
    labels: { singular: 'Class', plural: 'Classes' },
    access: { read: signedIn, create: signedIn, update: signedIn, delete: signedIn, ...options.access },
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'label', 'group', '_status', 'updatedAt'],
      description: 'Shared styles for blocks. Edit a class once and every block that uses it changes. The builder’s Styles panel edits them on the canvas.',
      ...options.admin,
    },
    versions: { maxPerDoc: 50, drafts: { autosave: { interval: 800 }, validate: true } },
    hooks: {
      ...options.hooks,
      beforeChange: [beforeChange, ...(options.hooks?.beforeChange ?? [])],
      afterChange: [afterChange, ...(options.hooks?.afterChange ?? [])],
      beforeDelete: [beforeDelete, ...(options.hooks?.beforeDelete ?? [])],
      afterDelete: [afterDelete, ...(options.hooks?.afterDelete ?? [])],
    },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        validate: validateName as never,
        admin: {
          description:
            'The class name blocks use, without the dot. Rename a class in the builder’s Styles panel (or with the MCP tools): that also updates every page that uses it.',
        },
      },
      {
        type: 'row',
        fields: [
          { name: 'label', type: 'text', admin: { description: 'Shown next to the name in the Classes box.' } },
          { name: 'group', type: 'text', admin: { description: 'Groups classes in the Classes box, for example “Buttons”.' } },
        ],
      },
      {
        name: 'styles',
        type: 'textarea',
        admin: {
          description: 'Tailwind classes with variants, for example “rounded-xl p-6 md:p-8 hover:shadow-lg”. Another class’s name applies that class.',
        },
      },
      {
        name: 'css',
        type: 'code',
        label: 'Custom CSS',
        validate: validateCss as never,
        admin: {
          language: 'css',
          description: 'Declarations and nested rules for what Tailwind classes cannot express: layered gradients, “&::before { … }”, @keyframes.',
        },
      },
      {
        name: 'previousNames',
        type: 'text',
        hasMany: true,
        admin: {
          position: 'sidebar',
          readOnly: true,
          description: 'Former published names. Published pages that still use them keep their look until they are published again.',
        },
      },
    ],
  }
}

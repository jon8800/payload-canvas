// Templates for collection documents (docs/architecture.md section 11): the templates collection,
// the `template` relationship on each target collection, and the bindable field list per collection.

import {
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type CollectionSlug,
  type Field,
  type PayloadRequest,
  type RelationshipField,
} from 'payload'
import {
  DOCUMENT_TEMPLATE_FIELD,
  TEMPLATE_DEFAULT_FIELD,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATE_PREVIEW_FIELD,
  TEMPLATE_TARGET_FIELD,
  URL_PATH,
} from '../core/bindings'
import { dataFields, textOf, type DataField } from '../core/fields'
import { normalizeLayout } from '../core/tree'
import type { BindingField, TemplatesClientConfig } from '../core/types'

/** Server-only key in `config.custom`: the templates data (`TemplatesClientConfig`) for the MCP tools. */
export const TEMPLATES_CONFIG_KEY = 'websiteBuilderTemplates'

/** Reads the templates data the plugin stored on the Payload config. `null` without templates. */
export function templatesConfigOf(payload: { config: { custom?: Record<string, unknown> } }): TemplatesClientConfig | null {
  const value = payload.config.custom?.[TEMPLATES_CONFIG_KEY]
  return value && typeof value === 'object' ? (value as TemplatesClientConfig) : null
}

// ---------------------------------------------------------------------------
// Bindable fields
// ---------------------------------------------------------------------------

type LooseCollection = Pick<CollectionConfig, 'slug' | 'fields' | 'upload' | 'auth' | 'timestamps'>

const UPLOAD_FIELDS: BindingField[] = [
  { path: 'url', label: 'URL', type: 'text' },
  { path: 'filename', label: 'File name', type: 'text' },
  { path: 'mimeType', label: 'MIME type', type: 'text' },
  { path: 'width', label: 'Width', type: 'number' },
  { path: 'height', label: 'Height', type: 'number' },
]

function humanize(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

function isHidden(field: DataField): boolean {
  const f = field as DataField & { hidden?: unknown; admin?: { hidden?: unknown; disabled?: unknown } }
  return f.hidden === true || f.admin?.hidden === true || f.admin?.disabled === true
}

/** The fields of a collection that store data, plus the ones Payload adds (id, timestamps, upload data). */
function ownFields(collection: LooseCollection, skip: ReadonlySet<string>): DataField[] {
  const fields = dataFields(collection.fields as unknown[]).filter(
    (f) => !skip.has(f.name) && !isHidden(f) && !f.name.startsWith('_'),
  )
  const names = new Set(fields.map((f) => f.name))
  const extra: DataField[] = []
  const add = (name: string, type: string, label: string) => {
    if (!names.has(name)) extra.push({ name, type, label })
  }
  add('id', 'text', 'ID')
  // Auth collections: Payload's own `email`, `hash`, `salt` and tokens are never offered. They are
  // private, and a template renders for anonymous visitors.
  if (collection.timestamps !== false) {
    add('createdAt', 'date', 'Created at')
    add('updatedAt', 'date', 'Updated at')
  }
  return [...fields, ...extra]
}

function walk(
  fields: DataField[],
  prefix: string,
  byslug: Map<string, LooseCollection>,
  hops: number,
  skipFor: (slug: string) => ReadonlySet<string>,
): BindingField[] {
  return fields.map((field) => {
    const path = prefix ? `${prefix}.${field.name}` : field.name
    const out: BindingField = { path, label: textOf(field.label) ?? humanize(field.name), type: field.type }
    if (field.hasMany) out.hasMany = true
    if (field.type === 'group' || field.type === 'array') {
      const children = walk(dataFields(field.fields).filter((f) => !isHidden(f)), path, byslug, hops, skipFor)
      if (children.length > 0) out.children = children
    }
    if (field.type === 'upload' || field.type === 'relationship') {
      if (field.relationTo !== undefined) out.relationTo = field.relationTo
      // One hop: the related collection's own fields, without their relationships' children.
      const related = typeof field.relationTo === 'string' ? byslug.get(field.relationTo) : undefined
      if (related && hops > 0) {
        const children = walk(ownFields(related, skipFor(related.slug)), path, byslug, hops - 1, skipFor)
        out.children = related.upload ? [...children, ...uploadExtras(path, children)] : children
      }
    }
    return out
  })
}

/** Upload data fields (url, filename, …) not declared on the collection, under `prefix`. */
function uploadExtras(prefix: string, existing: BindingField[]): BindingField[] {
  const taken = new Set(existing.map((f) => f.path))
  return UPLOAD_FIELDS.map((f) => ({ ...f, path: prefix ? `${prefix}.${f.path}` : f.path })).filter((f) => !taken.has(f.path))
}

/**
 * Bindable fields of each collection in `slugs`: named fields at any depth (groups and arrays as
 * `children`), relationship and upload fields with one hop into the related collection, plus `id`,
 * `createdAt` and `updatedAt`. Hidden, UI, join and virtual fields and the names in `skip` are left
 * out. Collections in `withUrl` start with the virtual `$url` path. JSON-safe.
 */
export function bindingSources(args: {
  collections: readonly LooseCollection[]
  slugs: readonly string[]
  skip: Record<string, ReadonlySet<string>>
  withUrl: ReadonlySet<string>
}): Record<string, BindingField[]> {
  const byslug = new Map(args.collections.map((c) => [c.slug, c]))
  const skipFor = (slug: string) => args.skip[slug] ?? new Set<string>()
  const sources: Record<string, BindingField[]> = {}
  for (const slug of args.slugs) {
    const collection = byslug.get(slug)
    if (!collection) continue
    const fields = walk(ownFields(collection, skipFor(slug)), '', byslug, 1, skipFor)
    const upload = collection.upload ? uploadExtras('', fields) : []
    const url: BindingField[] = args.withUrl.has(slug) ? [{ path: URL_PATH, label: 'Page URL', type: 'text' }] : []
    sources[slug] = [...url, ...fields, ...upload]
  }
  return sources
}

// ---------------------------------------------------------------------------
// Collections and fields
// ---------------------------------------------------------------------------

/** `context` flag of the plugin's own saves of other templates (clearing "Default"). */
const DEFAULT_CONTEXT = 'builderTemplateDefault'
/** Same value as `KEEP_LAYOUT_CONTEXT` in hook.ts: the session guard leaves the layout alone. */
const KEEP_LAYOUT = 'builderKeepLayout'
/** Same values as `RAW_LAYOUT_CONTEXT` and `STORED_LAYOUT_CONTEXT` in hook.ts (localized layouts). */
const RAW_LAYOUT = 'builderRawLayout'
const STORED_LAYOUT = 'builderStoredLayout'

/**
 * The stored layout of a template (every locale), published or latest. A read with `req` returns
 * one locale's view, so this read has its own request (no `req`: its context stays its own).
 */
async function storedTemplateLayout(payload: PayloadRequest['payload'], slug: CollectionSlug, id: string | number, draft: boolean): Promise<unknown> {
  const doc = (await payload.findByID({ collection: slug, id, draft, depth: 0, overrideAccess: true, context: { [RAW_LAYOUT]: true } })) as unknown as Record<string, unknown>
  return doc[TEMPLATE_LAYOUT_FIELD]
}

const isPublished = (doc: Record<string, unknown> | undefined) => doc?._status === 'published'

/**
 * A default template must have blocks: an empty default would silently replace a working one
 * (every document would fall back to the plain title and content). Checked on publish only, so
 * a new template can be ticked as default while it is still a draft. Runs after the layout hook,
 * so the layout is the live session's.
 */
export const requireBlocksForDefault: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data) return data
  const publishing = (data._status ?? originalDoc?._status) === 'published'
  const isDefault = (data[TEMPLATE_DEFAULT_FIELD] ?? originalDoc?.[TEMPLATE_DEFAULT_FIELD]) === true
  if (!publishing || !isDefault) return data
  const layout = normalizeLayout(data[TEMPLATE_LAYOUT_FIELD] ?? originalDoc?.[TEMPLATE_LAYOUT_FIELD])
  if (layout.blocks.length > 0) return data
  throw new ValidationError(
    {
      errors: [
        {
          path: TEMPLATE_DEFAULT_FIELD,
          message: 'A default template needs at least one block. Add blocks in the builder, or untick "Default template".',
        },
      ],
      req,
    },
    req.t,
  )
}

/**
 * Keeps one published default template per target collection. When a template is published as
 * the default, the other published defaults of the same collection lose the flag. Their
 * published version keeps its data, and an unpublished draft stays an unpublished draft (with
 * the flag off too): nothing goes live that nobody published. Draft saves change nothing, so
 * ticking "Default template" takes effect on Publish.
 */
export const keepOneDefault: CollectionAfterChangeHook = async ({ collection, context, doc, req }) => {
  if (context?.[DEFAULT_CONTEXT]) return doc
  if (!isPublished(doc) || doc?.[TEMPLATE_DEFAULT_FIELD] !== true) return doc
  const target = doc[TEMPLATE_TARGET_FIELD]
  if (typeof target !== 'string') return doc
  const slug = collection.slug as CollectionSlug
  const others = await req.payload.find({
    collection: slug,
    where: {
      and: [
        { [TEMPLATE_TARGET_FIELD]: { equals: target } },
        { [TEMPLATE_DEFAULT_FIELD]: { equals: true } },
        { id: { not_equals: doc.id } },
      ],
    },
    draft: false,
    depth: 0,
    pagination: false,
    req,
  })
  for (const other of others.docs as unknown as Record<string, unknown>[]) {
    // A template that was never published is not live. Its draft takes over when it is published.
    if (!isPublished(other)) continue
    const id = other.id as string | number
    const latest = (await req.payload.findByID({ collection: slug, id, draft: true, depth: 0, req })) as unknown as Record<string, unknown>
    const { id: _id, ...published } = other
    // Localized templates: the reads above hold one locale's view; save the stored layouts.
    published[TEMPLATE_LAYOUT_FIELD] = await storedTemplateLayout(req.payload, slug, id, false)
    latest[TEMPLATE_LAYOUT_FIELD] = await storedTemplateLayout(req.payload, slug, id, true)
    // 1. The published version, unchanged except for the flag (exactly its own layout).
    await req.payload.update({
      collection: slug,
      id,
      data: { ...published, [TEMPLATE_DEFAULT_FIELD]: false, _status: 'published' },
      draft: false,
      depth: 0,
      req,
      context: { [DEFAULT_CONTEXT]: true, [KEEP_LAYOUT]: true, [STORED_LAYOUT]: true },
    })
    // 2. A newer unpublished draft goes back on top, with the flag off. An open live session
    //    gives it its current layout (the session guard).
    if (latest._status === 'draft') {
      const { id: _draftId, ...draft } = latest
      await req.payload.update({
        collection: slug,
        id,
        data: { ...draft, [TEMPLATE_DEFAULT_FIELD]: false },
        draft: true,
        depth: 0,
        req,
        context: { [DEFAULT_CONTEXT]: true, [STORED_LAYOUT]: true },
      })
    }
  }
  return doc
}

/** The templates collection, before the builder field is added (the plugin adds it like any builder collection). */
export function templatesCollection(args: {
  slug: string
  targets: string[]
  /** Labels of the target collections, for the "Collection" select. Default: the slugs. */
  targetLabels?: Record<string, string>
  hooks?: CollectionConfig['hooks']
}): CollectionConfig {
  const { slug, targets, hooks, targetLabels } = args
  return {
    slug,
    labels: { singular: 'Template', plural: 'Templates' },
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', TEMPLATE_TARGET_FIELD, TEMPLATE_DEFAULT_FIELD, '_status', 'updatedAt'],
      description: 'Layouts for collection documents. Each document renders through its own template or the default one.',
    },
    versions: { maxPerDoc: 20, drafts: { autosave: { interval: 300 } } },
    hooks: {
      ...hooks,
      // `requireBlocksForDefault` runs after the layout hook; the plugin adds it there.
      afterChange: [keepOneDefault, ...(hooks?.afterChange ?? [])],
    },
    fields: [
      { name: 'name', type: 'text', required: true },
      {
        name: TEMPLATE_TARGET_FIELD,
        type: 'select',
        label: 'Collection',
        required: true,
        options: targets.map((value) => ({ value, label: targetLabels?.[value] ?? value })),
        defaultValue: targets[0],
        admin: { position: 'sidebar', description: 'The documents this template renders.' },
      },
      {
        name: TEMPLATE_DEFAULT_FIELD,
        type: 'checkbox',
        label: 'Default template',
        defaultValue: false,
        admin: {
          position: 'sidebar',
          description:
            'Used by every document of the collection that has no template of its own. Takes effect when you publish this template. It needs at least one block.',
          components: { Cell: '@payload-toolkit/builder/client#TemplateDefaultCell' },
        },
      },
      {
        name: TEMPLATE_PREVIEW_FIELD,
        type: 'relationship',
        label: 'Preview document',
        relationTo: targets as CollectionSlug[],
        filterOptions: ({ relationTo, data }) => relationTo === data?.[TEMPLATE_TARGET_FIELD],
        admin: { position: 'sidebar', description: 'The editor shows the template with this document\'s data.' },
      },
    ],
  }
}

/** The `template` relationship added to a template-enabled collection (sidebar). */
export function documentTemplateField(target: string, templatesSlug: string): RelationshipField {
  return {
    name: DOCUMENT_TEMPLATE_FIELD,
    type: 'relationship',
    label: 'Template',
    relationTo: templatesSlug as CollectionSlug,
    filterOptions: { [TEMPLATE_TARGET_FIELD]: { equals: target } },
    admin: { position: 'sidebar', description: 'Leave empty to use the default template.' },
  }
}

export function hasFieldNamed(fields: readonly Field[], name: string): boolean {
  return dataFields(fields as unknown[]).some((f) => f.name === name)
}

export { TEMPLATE_LAYOUT_FIELD }

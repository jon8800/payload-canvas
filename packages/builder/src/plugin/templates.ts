// Templates for collection documents (docs/architecture.md section 11): the templates collection,
// the `template` relationship on each target collection, and the bindable field list per collection.

import type { CollectionBeforeChangeHook, CollectionConfig, CollectionSlug, Field, RelationshipField } from 'payload'
import {
  DOCUMENT_TEMPLATE_FIELD,
  TEMPLATE_DEFAULT_FIELD,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATE_PREVIEW_FIELD,
  TEMPLATE_TARGET_FIELD,
  URL_PATH,
} from '../core/bindings'
import { dataFields, textOf, type DataField } from '../core/fields'
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
  if (collection.auth) add('email', 'email', 'Email')
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

/** Keeps one default template per target collection: setting a default clears the others. */
const keepOneDefault: CollectionBeforeChangeHook = async ({ collection, data, originalDoc, req }) => {
  if (!data || data[TEMPLATE_DEFAULT_FIELD] !== true) return data
  const target = data[TEMPLATE_TARGET_FIELD] ?? originalDoc?.[TEMPLATE_TARGET_FIELD]
  if (typeof target !== 'string') return data
  const unchanged = originalDoc?.[TEMPLATE_DEFAULT_FIELD] === true && originalDoc?.[TEMPLATE_TARGET_FIELD] === target
  if (unchanged) return data
  await req.payload.update({
    collection: collection.slug as CollectionSlug,
    where: {
      and: [
        { [TEMPLATE_TARGET_FIELD]: { equals: target } },
        { [TEMPLATE_DEFAULT_FIELD]: { equals: true } },
        ...(originalDoc?.id === undefined ? [] : [{ id: { not_equals: originalDoc.id } }]),
      ],
    },
    data: { [TEMPLATE_DEFAULT_FIELD]: false },
    req,
    depth: 0,
    context: { ...req.context, builderTemplateDefault: true },
  })
  return data
}

/** The templates collection, before the builder field is added (the plugin adds it like any builder collection). */
export function templatesCollection(args: {
  slug: string
  targets: string[]
  hooks?: CollectionConfig['hooks']
}): CollectionConfig {
  const { slug, targets, hooks } = args
  return {
    slug,
    labels: { singular: 'Template', plural: 'Templates' },
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', TEMPLATE_TARGET_FIELD, TEMPLATE_DEFAULT_FIELD, 'updatedAt'],
      description: 'Layouts for collection documents. Each document renders through its own template or the default one.',
    },
    versions: { maxPerDoc: 20, drafts: { autosave: { interval: 300 } } },
    hooks: {
      ...hooks,
      beforeChange: [keepOneDefault, ...(hooks?.beforeChange ?? [])],
    },
    fields: [
      { name: 'name', type: 'text', required: true },
      {
        name: TEMPLATE_TARGET_FIELD,
        type: 'select',
        label: 'Collection',
        required: true,
        options: targets,
        defaultValue: targets[0],
        admin: { position: 'sidebar', description: 'The documents this template renders.' },
      },
      {
        name: TEMPLATE_DEFAULT_FIELD,
        type: 'checkbox',
        label: 'Default template',
        defaultValue: false,
        admin: { position: 'sidebar', description: 'Used by every document of the collection that has no template of its own.' },
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

import type { CollectionSlug, Field, NamedGroupField } from 'payload'

/**
 * Shows a field only when a sibling field has a value. JSON-safe (Payload's `admin.condition` is a
 * function and does not reach the admin client). The inspector reads it from `admin.custom`.
 */
export type BuilderCondition = { field: string; equals: unknown }

/** `admin.custom` for a field that shows only when `field` equals `equals`. */
export const when = (field: string, equals: unknown) => ({
  custom: { builderCondition: { field, equals } satisfies BuilderCondition },
})

export type LinkFieldOptions = {
  /** Prop name. Default "link". */
  name?: string
  label?: string
  /**
   * Collections the link can point to (for example ["pages", "posts"]). Stored as
   * `{ relationTo, value }`. Empty (the default) leaves only URL links.
   */
  collections?: string[]
}

/**
 * A link group: `{ type: 'url' | 'reference', url, reference, newTab }`. Use it in custom blocks.
 * The renderer finds link groups by the `admin.custom.builderLink` marker and resolves them before
 * it calls the block component: the component gets `{ ...link, href, target, rel }`.
 */
export function linkField(options: LinkFieldOptions = {}): NamedGroupField {
  const collections = options.collections ?? []
  const hasReference = collections.length > 0
  const fields: Field[] = [
    {
      name: 'type',
      type: 'select',
      label: 'Link to',
      options: hasReference
        ? [
            { label: 'URL', value: 'url' },
            { label: 'Page or document', value: 'reference' },
          ]
        : [{ label: 'URL', value: 'url' }],
      defaultValue: 'url',
    },
    {
      name: 'url',
      type: 'text',
      label: 'URL',
      admin: { description: 'For example /contact, https://example.com or mailto:hi@example.com.', ...when('type', 'url') },
    },
  ]
  if (hasReference) {
    fields.push({
      name: 'reference',
      type: 'relationship',
      label: 'Document',
      relationTo: collections as CollectionSlug[],
      admin: when('type', 'reference'),
    })
  }
  fields.push({ name: 'newTab', type: 'checkbox', label: 'Open in a new tab' })
  return {
    name: options.name ?? 'link',
    type: 'group',
    label: options.label ?? 'Link',
    fields,
    admin: { custom: { builderLink: true } },
  }
}

/** True for a group field made by `linkField()`. Takes any field-like object (JSON-safe configs too). */
export function isLinkField(field: unknown): boolean {
  if (typeof field !== 'object' || field === null) return false
  const f = field as { type?: unknown; admin?: { custom?: Record<string, unknown> } }
  return f.type === 'group' && f.admin?.custom?.builderLink === true
}

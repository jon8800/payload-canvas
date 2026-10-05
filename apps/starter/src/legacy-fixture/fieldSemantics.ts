// Dev fixture for Payload field logic on block props (NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1): one block
// whose props have a custom `validate`, field hooks and field-level `access`. Used to check the
// builder by hand and with scripts. Client-safe: the functions use no server code.
import { defineBlock } from '@payload-toolkit/builder/blocks'
import type { Field, FieldAccess } from 'payload'

/** The user who counts as "admin" for the access demo (the dev user of the agents). */
const ADMIN_EMAIL = 'builder-dev@local.test'

const isAdmin: FieldAccess = ({ req }) => (req.user as { email?: unknown } | null)?.email === ADMIN_EMAIL

const slugify = (value: unknown) =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : value

const fields: Field[] = [
  {
    name: 'sku',
    type: 'text',
    label: 'SKU',
    admin: { description: 'Validate: three capitals, a dash, three digits (ABC-123). Blocks Publish only.' },
    validate: (value: unknown) => (value === undefined || value === null || value === '' || /^[A-Z]{3}-\d{3}$/.test(String(value)) ? true : 'Use a SKU like ABC-123'),
  },
  {
    name: 'slug',
    type: 'text',
    admin: { description: 'beforeChange hook: saved as a slug ("Red Shoe" -> "red-shoe").' },
    hooks: { beforeChange: [({ value }) => slugify(value)] },
  },
  {
    name: 'headline',
    type: 'text',
    admin: { description: 'afterRead hook: the API returns it in capitals.' },
    hooks: { afterRead: [({ value }) => (typeof value === 'string' ? value.toUpperCase() : value)] },
  },
  {
    name: 'savedNote',
    type: 'text',
    admin: { description: 'afterChange hook: the save response says "saved: …".' },
    hooks: { afterChange: [({ value }) => (typeof value === 'string' ? `saved: ${value}` : value)] },
  },
  {
    name: 'internalNote',
    type: 'text',
    admin: { description: 'access.read: never in API output.' },
    access: { read: () => false },
  },
  {
    name: 'adminOnly',
    type: 'text',
    label: 'Admin only',
    admin: { description: `access.update: only ${ADMIN_EMAIL} may change it.` },
    access: { update: isAdmin },
  },
  {
    name: 'items',
    type: 'array',
    fields: [
      {
        name: 'label',
        type: 'text',
        hooks: { beforeValidate: [({ value }) => (typeof value === 'string' ? value.trim() : value)] },
        validate: (value: unknown) => (typeof value === 'string' && value.length > 0 ? true : 'Each item needs a label'),
      },
    ],
  },
]

export const fieldSemanticsBlock = defineBlock({
  type: 'fieldDemo',
  label: 'Field logic demo',
  icon: 'form',
  category: 'Dev fixtures',
  fields,
  ai: { description: 'Dev fixture: props with Payload validate, hooks and access. Do not use on real pages.' },
})

export const fieldSemanticsBlocks = [fieldSemanticsBlock]

// The `forms` option: the full-screen builder for the forms of `@payloadcms/plugin-form-builder`.
// A form's `fields` is a Payload blocks field, so the builder edits it in place like any
// collection whose builder field is its own blocks field (one source of truth, no copy). The
// form's other fields (title, submit button, confirmation, emails) are a page region with
// `panel: true`: the inspector edits them when no field is selected.

import type { Block as PayloadBlockConfig, CollectionConfig } from 'payload'

import type { BlockDefinition } from '../core/types'
import type { RegionOption } from '../core/regions'
import { FORM_SETTINGS_REGION, formFieldBlocks } from '../forms/blocks'
import { FORM_SPAM_FIELD } from '../forms/spamSettings'

export { FORM_SETTINGS_REGION }

export type FormsOptions = {
  /** Slug of the form-builder plugin's forms collection. Default "forms". */
  collection?: string
}

/** The blocks field of a form: the form-builder plugin names it `fields`. */
export const FORM_FIELDS_FIELD = 'fields'

/** The plugin's form fields the settings panel shows, in this order, when the collection has them. */
const SETTINGS_FIELDS = ['title', 'submitButtonLabel', 'confirmationType', 'confirmationMessage', 'redirect', 'emails', FORM_SPAM_FIELD]

export type ResolvedForms = {
  slug: string
  /** The builder definitions of the form's field blocks (`formText`, `formEmail`, …). */
  blocks: BlockDefinition[]
  /** The collection's builder options. */
  collection: { field: string; regions: RegionOption[] }
}

/** Checks the `forms` option against the config. Null when it is off. */
export function resolveForms(option: FormsOptions | boolean | undefined, collections: readonly CollectionConfig[], listed: Record<string, unknown>): ResolvedForms | null {
  if (!option) return null
  const slug = (option === true ? undefined : option.collection) ?? 'forms'
  const source = collections.find((c) => c.slug === slug)
  if (!source) {
    throw new Error(
      `[websiteBuilder] \`forms\`: there is no "${slug}" collection. Add formBuilderPlugin() to \`plugins\` before websiteBuilder(), or set \`forms.collection\` to its slug.`,
    )
  }
  if (listed[slug]) {
    throw new Error(`[websiteBuilder] \`forms\` and \`collections\` both name "${slug}". Leave it out of \`collections\`: the \`forms\` option sets it up.`)
  }
  const field = source.fields.find((f) => 'name' in f && f.name === FORM_FIELDS_FIELD)
  if (!field || field.type !== 'blocks') {
    throw new Error(`[websiteBuilder] \`forms\`: "${slug}" has no "${FORM_FIELDS_FIELD}" blocks field. Is it the form-builder plugin's forms collection?`)
  }
  const configs = (field.blocks ?? []).filter((b): b is PayloadBlockConfig => typeof b === 'object' && b !== null)
  const names = new Set(source.fields.flatMap((f) => ('name' in f && typeof f.name === 'string' ? [f.name] : [])))
  const settings = SETTINGS_FIELDS.filter((name) => names.has(name))
  return {
    slug,
    blocks: formFieldBlocks(configs),
    collection: {
      field: FORM_FIELDS_FIELD,
      regions: settings.length > 0 ? [{ name: FORM_SETTINGS_REGION, label: 'Form settings', fields: settings, panel: true }] : [],
    },
  }
}

// The `forms` option: the full-screen builder for the forms of `@payloadcms/plugin-form-builder`.
// A form's `fields` is a Payload blocks field, so the builder edits it in place like any
// collection whose builder field is its own blocks field (one source of truth, no copy). The
// form's other fields (title, submit button, confirmation, emails) are a page region with
// `panel: true`: the inspector edits them when no field is selected, in folding sections (General,
// After submit, Mail). Every other top-level group field of the collection (for example spam
// protection settings) joins the region and folds on its own. Form fields are not page sections:
// the builder offers no sections there.

import type { Block as PayloadBlockConfig, CollectionConfig, Field } from 'payload'

import { fromPayloadBlocks } from '../blocks/payload'
import type { BlockDefinition } from '../core/types'
import type { RegionOption } from '../core/regions'
import { FORM_SETTINGS_REGION, formFieldBlocks } from '../forms/blocks'
import { FORM_SETTINGS_SECTIONS, formSettingNames, formSettingsFields } from '../forms/pageForms'

export { FORM_SETTINGS_REGION }

export type FormsOptions = {
  /** Slug of the form-builder plugin's forms collection. Default "forms". */
  collection?: string
}

/** The blocks field of a form: the form-builder plugin names it `fields`. */
export const FORM_FIELDS_FIELD = 'fields'

export type ResolvedForms = {
  slug: string
  /** The builder definitions of the form's field blocks (`formText`, `formEmail`, …). */
  blocks: BlockDefinition[]
  /** The collection's builder options. */
  collection: { field: string; regions: RegionOption[]; sections: false }
  /** The form's settings (title, submit button, confirmation, emails, other groups), in panel order. */
  settings: string[]
  /** The Form block's settings fields for pages: the same fields, in folding sections (`formSettingsFields`). */
  settingsFields: Field[]
  /** Slug of the form submissions collection (the collection with `submissionData`), or null. */
  submissions: string | null
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
  const sections = FORM_SETTINGS_SECTIONS.map((section) => ({ label: section.label, fields: section.fields.filter((name) => names.has(name)) })).filter((s) => s.fields.length > 0)
  // Other top-level groups (spam protection, …) fold on their own after the sections.
  const settings = formSettingNames(source.fields)
  // The same setting fields as Form block props: simple `admin.condition` functions become builder conditions.
  const chosen = source.fields.filter((f) => 'name' in f && settings.includes(f.name))
  const converted = fromPayloadBlocks([{ slug: 'formSettings', fields: chosen } as PayloadBlockConfig], { onWarning: false })[0]?.fields ?? []
  return {
    slug,
    blocks: formFieldBlocks(configs),
    collection: {
      field: FORM_FIELDS_FIELD,
      regions: settings.length > 0 ? [{ name: FORM_SETTINGS_REGION, label: 'Form settings', fields: settings, panel: true, sections }] : [],
      sections: false,
    },
    settings,
    settingsFields: formSettingsFields(converted),
    submissions: collections.find((c) => hasFieldNamed(c.fields, 'submissionData') && hasFieldNamed(c.fields, 'form'))?.slug ?? null,
  }
}

/** True when a data field of this name is in the list, also inside rows, collapsibles and unnamed tabs. */
function hasFieldNamed(fields: readonly Field[], name: string): boolean {
  return fields.some((f) => {
    if ('name' in f && f.name === name) return true
    if (!('name' in f && f.name) && 'fields' in f && Array.isArray(f.fields)) return hasFieldNamed(f.fields, name)
    if (f.type === 'tabs') return f.tabs.some((tab) => !('name' in tab && tab.name) && hasFieldNamed(tab.fields, name))
    return false
  })
}

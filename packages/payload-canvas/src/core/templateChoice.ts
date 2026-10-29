// The order in which a document's template is chosen (docs/architecture.md section 11). Pure, so
// the site (`loadTemplate`), the editor's endpoint and the tests share one rule:
//
// 1. the document's own template (its `template` field);
// 2. else the template with conditions that match the document, highest `priority` first; on
//    equal priority the older template (`createdAt`), then the lower id;
// 3. else the collection's default template, the most recently updated first.
//
// Templates with an empty layout are skipped at every step.

import { TEMPLATE_DEFAULT_FIELD, TEMPLATE_PRIORITY_FIELD, templateConditions } from './bindings'

type Doc = Record<string, unknown>

/** A template's priority: its number, or 0 (also for templates saved before the field existed). */
export function templatePriority(template: Doc): number {
  const value = template[TEMPLATE_PRIORITY_FIELD]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

const timeOf = (value: unknown): number => {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isNaN(time) ? 0 : time
}

/** Equal priority: the older template first, then the lower id. */
function byAge(a: Doc, b: Doc): number {
  const age = timeOf(a.createdAt) - timeOf(b.createdAt)
  if (age !== 0) return age
  return String(a.id).localeCompare(String(b.id), 'en', { numeric: true })
}

/** The templates that have conditions, in the order they are tried, each with its `where`. */
export function conditionedTemplates(candidates: readonly Doc[]): Array<{ template: Doc; where: Record<string, unknown> }> {
  return candidates
    .flatMap((template) => {
      const where = templateConditions(template)
      return where ? [{ template, where }] : []
    })
    .toSorted((a, b) => templatePriority(b.template) - templatePriority(a.template) || byAge(a.template, b.template))
}

/** The default templates, the most recently updated first. */
export function defaultTemplates(candidates: readonly Doc[]): Doc[] {
  return candidates
    .filter((template) => template[TEMPLATE_DEFAULT_FIELD] === true)
    .toSorted((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt))
}

/** The editor's endpoint for the template a document renders through: `{liveEndpoint}/:collection/:id/template`. */
export const APPLIED_TEMPLATE_PATH = 'template'

/** The answer of that endpoint: the published template `loadTemplate` picks for the latest draft, or null. */
export type AppliedTemplateResponse = { ok: true; template: { id: string | number; name: string } | null } | { ok: false; error: string }

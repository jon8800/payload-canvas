// MCP tools for the forms of `@payloadcms/plugin-form-builder` (`websiteBuilder({ forms })`):
// listForms, getForm, createForm, editFormFields, updateFormSettings.
//
// Field edits are commits to the form's live session, the same path as the form builder's own
// edits, so an open form builder shows them at once. Settings go through the regions' fields
// endpoint code (`writeRegionFields`): Payload's Local API as the user, with the write gate, and
// the builder's settings panel reloads them from the `saved` event.

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { Layout, Operation } from '../core/types'
import { normalizeLayout } from '../core/tree'
import { FORM_FIELDS_FIELD } from '../plugin/forms'
import { formFieldOps, formFieldsOf, formFieldTypes, FORM_FIELDS_GUIDE, type FormFieldChange } from '../forms/fieldOps'
import { formSettingsChanges, formSettingsView, FORM_SETTINGS_GUIDE } from '../forms/settings'
import { builderConfigOf } from '../live/document'
import { writeRegionFields } from '../live/regions'
import { liveRuntimeOf } from '../live/runtime'
import type { CommitResult } from '../live/session'
import { codecOf } from '../live/storage'
import { builderViewPath } from '../plugin/links'
import type { BuilderMcpTool, McpToolResult } from './index'

export type FormToolsContext = {
  /** Slug of the forms collection. */
  slug: string
  /** Commits operations to the document's live session as the AI collaborator. */
  apply: (req: PayloadRequest, collection: string, id: string, ops: (layout: Layout) => Operation[] | string) => Promise<CommitResult>
  /** The layout people see now (the live session's, else the stored one). */
  currentLayout: (req: PayloadRequest, collection: string, doc: Record<string, unknown>) => Promise<{ layout: Layout; seq?: number }>
  /** The latest draft, read as the request's user. */
  loadDraft: (req: PayloadRequest, collection: string, id: string) => Promise<Record<string, unknown>>
  /** The commit's warnings for the blocks it touched. */
  warnings: (req: PayloadRequest, collection: string, result: Extract<CommitResult, { ok: true }>) => Record<string, unknown>
  /** The site's absolute origin. */
  siteOf: (req: PayloadRequest) => string
  text: (value: unknown) => McpToolResult
  fail: (message: string, details?: unknown) => McpToolResult
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const changeSchema = z
  .object({
    action: z.enum(['add', 'update', 'move', 'remove', 'setConditions']),
    type: z.string().optional().describe('add: the field type, e.g. "email".'),
    field: z.string().optional().describe('update, move, remove, setConditions: the field\'s name (or id from getForm).'),
    values: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('add, update: props to set, e.g. { "label": "Your email", "required": true, "className": "sm:w-[calc(50%-0.5rem)]" }. update merges them; other props stay. Width is classes (className), never a prop.'),
    unset: z.array(z.string()).optional().describe('update: prop names to clear.'),
    index: z.number().int().min(0).optional().describe('add: position (default: the end). move: the final position. 0 is the first field.'),
    conditions: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe('setConditions: { match?: "all" | "any", rules: [{ field, operator, value? }] }. null: always show.'),
  })
  .describe('One change of the form\'s fields.')

export function formMcpTools(ctx: FormToolsContext): BuilderMcpTool[] {
  const { slug, text, fail } = ctx
  const collectionArg = z.enum([slug]).default(slug).describe(`The forms collection. Always "${slug}" (may be left out).`)
  const idArg = z.string().min(1).describe('Form id (from listForms).')

  /** The plugin's server config of the forms collection, or an error text when forms are off. */
  const formsConfig = (req: PayloadRequest) => {
    const server = builderConfigOf(req.payload)?.collections[slug]
    if (!server) return `The form builder is off: set \`forms: true\` in websiteBuilder() for the "${slug}" collection.`
    const codec = codecOf(server)
    const settings = (server.regions ?? []).flatMap((region) => (region.panel ? region.fields.map((f) => f.path) : []))
    return { server, codec, definitions: codec.blocks ?? [], settings }
  }

  const editorUrl = (req: PayloadRequest, id: unknown) =>
    `${ctx.siteOf(req)}${builderViewPath(req.payload.config.routes?.admin ?? '/admin', slug, String(id))}`

  const listForms: BuilderMcpTool = {
    name: 'listForms',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Lists the site\'s forms (contact, newsletter, booking, …): id, title, the field names and the link to the form builder. Then getForm reads one form, editFormFields changes its fields, updateFormSettings its title, confirmation and emails, createForm makes a new one. A page shows a form with a "form" block that points at its id.',
    parameters: { collection: collectionArg, search: z.string().optional().describe('Only forms whose title contains this text.') },
    handler: async (args, req) => {
      const config = formsConfig(req)
      if (typeof config === 'string') return fail(config)
      try {
        const result = await req.payload.find({
          collection: slug as never,
          where: typeof args.search === 'string' && args.search ? { title: { like: args.search } } : {},
          depth: 0,
          limit: 100,
          sort: 'title',
          overrideAccess: false,
          user: req.user,
          req,
        })
        return text({
          collection: slug,
          forms: (result.docs as Record<string, unknown>[]).map((doc) => {
            const fields = Array.isArray(doc[FORM_FIELDS_FIELD]) ? (doc[FORM_FIELDS_FIELD] as Array<Record<string, unknown>>) : []
            return {
              id: doc.id,
              title: doc.title,
              fields: fields.map((f) => (typeof f.name === 'string' && f.name ? f.name : String(f.blockType))),
              updatedAt: doc.updatedAt,
              editorUrl: editorUrl(req, doc.id),
            }
          }),
          ...(result.totalDocs > result.docs.length ? { more: result.totalDocs - result.docs.length } : {}),
        })
      } catch (error) {
        return fail(errorMessage(error))
      }
    },
  }

  const getForm: BuilderMcpTool = {
    name: 'getForm',
    routing: { kind: 'collection', action: 'read' },
    description:
      'Reads one form: its fields in order (id, type, name, label, required, className (its classes, width included), placeholder, defaultValue, options, message text, display conditions and `shows`, the conditions in words), the field types this site offers (`fieldTypes`, with their props), the settings (title, submit button, confirmation, redirect, emails, spam protection) and `editorUrl`, the form builder where a person sees your changes live. Includes unsaved edits of people who have the form open. The result\'s `guide` explains fields, conditions and settings.',
    parameters: { collection: collectionArg, id: idArg },
    handler: async (args, req) => {
      const config = formsConfig(req)
      if (typeof config === 'string') return fail(config)
      let doc: Record<string, unknown>
      let layout: Layout
      try {
        doc = await ctx.loadDraft(req, slug, String(args.id))
        layout = (await ctx.currentLayout(req, slug, doc)).layout
      } catch (error) {
        return fail(errorMessage(error))
      }
      return text({
        collection: slug,
        id: doc.id,
        title: doc.title,
        fields: formFieldsOf(layout),
        settings: formSettingsView(doc, config.settings),
        fieldTypes: formFieldTypes(config.definitions),
        editorUrl: editorUrl(req, doc.id),
        guide: `${FORM_FIELDS_GUIDE}\n\n${FORM_SETTINGS_GUIDE}`,
      })
    },
  }

  const editFormFields: BuilderMcpTool = {
    name: 'editFormFields',
    routing: { kind: 'collection', action: 'update' },
    description: [
      'Changes the fields of a form, applied in order, all or nothing. People with the form open in the form builder see each change live; the form saves about a second later. Call getForm first for the field names.',
      'Changes: add { type, values?, index? }; update { field, values?, unset? } (merges values; renaming a field also renames it in other fields\' rules); move { field, index } (final position, 0 = first); remove { field }; setConditions { field, conditions } (null = always show). `field` is the field\'s name or id.',
      FORM_FIELDS_GUIDE,
    ].join('\n\n'),
    parameters: {
      collection: collectionArg,
      id: idArg,
      changes: z.array(changeSchema).min(1).describe('Changes, applied in order.'),
    },
    handler: async (args, req) => {
      const config = formsConfig(req)
      if (typeof config === 'string') return fail(config)
      let notes: string[] = []
      const result = await ctx.apply(req, slug, String(args.id), (layout) => {
        const planned = formFieldOps(layout, args.changes as FormFieldChange[], config.definitions)
        if (!planned.ok) return planned.error
        notes = planned.notes
        return planned.ops
      })
      if (!result.ok) return fail(result.error, result.errors)
      return text({
        ok: true,
        seq: result.seq,
        fields: formFieldsOf(result.layout),
        ...(notes.length > 0 ? { notes } : {}),
        ...ctx.warnings(req, slug, result),
      })
    },
  }

  const updateFormSettings: BuilderMcpTool = {
    name: 'updateFormSettings',
    routing: { kind: 'collection', action: 'update' },
    description: [
      'Changes the settings of a form (not its fields: editFormFields does those). Saves at once; an open form builder shows the new settings.',
      FORM_SETTINGS_GUIDE,
    ].join('\n\n'),
    parameters: {
      collection: collectionArg,
      id: idArg,
      settings: z.record(z.string(), z.unknown()).describe('The settings to change, e.g. { "submitButtonLabel": "Send", "confirmationMessage": "Thanks! We reply within a day." }.'),
    },
    handler: async (args, req) => {
      const config = formsConfig(req)
      if (typeof config === 'string') return fail(config)
      const regions = (config.server.regions ?? []).filter((region) => region.panel)
      if (regions.length === 0) return fail('This form has no settings the builder knows.')
      let doc: Record<string, unknown>
      try {
        doc = await ctx.loadDraft(req, slug, String(args.id))
      } catch (error) {
        return fail(errorMessage(error))
      }
      const changes = formSettingsChanges((args.settings ?? {}) as Record<string, unknown>, config.settings, doc)
      if (typeof changes === 'string') return fail(changes)
      const collectionConfig = (req.payload.collections as Record<string, { config: { versions?: { drafts?: unknown } } } | undefined>)[slug]?.config
      const drafts = collectionConfig?.versions?.drafts
      const result = await writeRegionFields(req, {
        target: {
          collection: slug,
          id: doc.id as string | number,
          field: FORM_FIELDS_FIELD,
          drafts: Boolean(drafts),
          autosave: typeof drafts === 'object' && drafts !== null && Boolean((drafts as { autosave?: unknown }).autosave),
        },
        regions,
        changes,
        runtime: liveRuntimeOf(req.payload),
      })
      if (!result.ok) return fail(result.error, result.errors ?? result.conflicts)
      return text({ ok: true, changed: result.changed, settings: formSettingsView(result.values, config.settings) })
    },
  }

  const createForm: BuilderMcpTool = {
    name: 'createForm',
    routing: { kind: 'collection', action: 'create' },
    description: [
      'Creates a new form with its fields and settings. Returns its id and the form builder link. To show it on a page, put a "form" block on the page with the form\'s id (applyOperations).',
      'fields: a list of { type, ...props } in order, e.g. [{ "type": "text", "label": "Name", "required": true }, { "type": "email", "label": "Email", "required": true }, { "type": "textarea", "label": "Message" }]. A name is made from the label when you leave it out. Conditions go in `conditions` (format below).',
      FORM_FIELDS_GUIDE,
      FORM_SETTINGS_GUIDE,
    ].join('\n\n'),
    parameters: {
      collection: collectionArg,
      title: z.string().min(1).describe('The form\'s name, e.g. "Contact".'),
      fields: z.array(z.record(z.string(), z.unknown())).min(1).describe('The fields, in order: { type, name?, label, required?, className?, options?, conditions?, … }. Width is classes (className).'),
      settings: z.record(z.string(), z.unknown()).optional().describe('Optional settings: submitButtonLabel, confirmationType, confirmationMessage, redirect, emails, …'),
    },
    handler: async (args, req) => {
      const config = formsConfig(req)
      if (typeof config === 'string') return fail(config)
      // Every field is an "add", so names, options, messages and conditions get the same checks.
      // Conditions may name later fields: they are set after all fields exist.
      const fields = args.fields as Array<Record<string, unknown>>
      const adds: FormFieldChange[] = fields.map(({ type, conditions: _conditions, ...values }) => ({ action: 'add', type: String(type ?? ''), values }))
      const conditions: FormFieldChange[] = []
      const planned = formFieldOps({ version: 1, blocks: [] }, adds, config.definitions)
      if (!planned.ok) return fail(planned.error)
      const blocks = planned.ops.flatMap((op) => (op.type === 'insert' ? [op.block] : []))
      fields.forEach((field, i) => {
        if (field.conditions) conditions.push({ action: 'setConditions', field: blocks[i]!.id, conditions: field.conditions as never })
      })
      let layout: Layout = normalizeLayout({ version: 1, blocks })
      if (conditions.length > 0) {
        const withRules = formFieldOps(layout, conditions, config.definitions)
        if (!withRules.ok) return fail(withRules.error)
        const byId = new Map(withRules.ops.flatMap((op) => (op.type === 'update' ? [[op.id, op.props ?? {}] as const] : [])))
        layout = { ...layout, blocks: layout.blocks.map((b) => (byId.has(b.id) ? { ...b, props: { ...b.props, ...byId.get(b.id) } } : b)) }
      }
      const problems = config.codec.problems(layout)
      if (problems.length > 0) return fail(problems.join(' '))
      const settings = args.settings ? formSettingsChanges(args.settings as Record<string, unknown>, config.settings, {}) : []
      if (typeof settings === 'string') return fail(settings)
      try {
        const doc = (await req.payload.create({
          collection: slug as never,
          data: {
            ...Object.fromEntries(settings.map((c) => [c.path, c.value])),
            title: args.title,
            [FORM_FIELDS_FIELD]: config.codec.encode(layout),
          } as never,
          depth: 0,
          overrideAccess: false,
          user: req.user,
          req,
        })) as Record<string, unknown>
        return text({
          ok: true,
          id: doc.id,
          title: doc.title,
          fields: formFieldsOf(config.codec.decode(doc[FORM_FIELDS_FIELD])),
          editorUrl: editorUrl(req, doc.id),
          ...(planned.notes.length > 0 ? { notes: planned.notes } : {}),
          next: 'Show it on a page: applyOperations insert a "form" block with this form\'s id as its form prop (getBlockSchema "form" shows the prop).',
        })
      } catch (error) {
        return fail(errorMessage(error), (error as { data?: unknown }).data)
      }
    },
  }

  return [listForms, getForm, createForm, editFormFields, updateFormSettings]
}

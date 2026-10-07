// Runs the field hooks of block props (`beforeValidate`, `beforeChange`, `afterChange`,
// `afterRead`) with the arguments Payload gives field hooks. A hook that returns a value other
// than `undefined` replaces the prop, as in Payload. See fieldSemantics.ts for why the hooks come
// from a registry and not from the field objects.

import { typesWith, walkPropFields, type FieldRegistry, type PropHookName } from './fieldSemantics'
import { eachLocalePass, requestInLocale } from './locale'
import type { Block, BlockDefinition, Layout, LocaleSettings } from './types'

/** What Payload knows about the operation. Server values (`req`, `collection`) pass through untouched. */
export type FieldRunContext = {
  /** Name of the layout field: the first segment of every `path`. */
  layoutField: string
  req?: unknown
  /** Payload's sanitized collection config, or null. */
  collection?: unknown
  context?: Record<string, unknown>
  operation?: 'create' | 'update' | 'read' | 'delete'
  overrideAccess?: boolean
  id?: string | number
  /** Payload's `data`: the incoming data in change hooks, the whole document in afterRead. */
  data?: Record<string, unknown>
  /** The document before the change (change hooks), or the saved document (afterChange). */
  originalDoc?: Record<string, unknown>
  /** afterChange: the document before the change. */
  previousDoc?: Record<string, unknown>
  /** afterRead only. */
  findMany?: boolean
  depth?: number
  currentDepth?: number
  draft?: boolean
  showHiddenFields?: boolean
}

/** Block types with a hook of this kind; empty means no walk is needed. */
export function hasPropHooks(registry: FieldRegistry, kind: PropHookName): boolean {
  return registry.types(kind).size > 0
}

/**
 * Runs one kind of prop hook on every block of `layout`, in place. `previous` gives
 * `previousValue` and `previousSiblingDoc` (change hooks). Returns true when a hook changed a value.
 */
export async function runPropHooks(
  kind: PropHookName,
  layout: Layout,
  options: {
    blocks: readonly BlockDefinition[]
    registry: FieldRegistry
    previous?: Layout | null
    ctx: FieldRunContext
    /**
     * With locales, the hooks of localized props also run for each locale's own values (with
     * `req.locale` set to that locale), as Payload runs field hooks per locale. Leave it out for a
     * layout that is already one locale's view (an API read).
     */
    localization?: LocaleSettings | null
  },
): Promise<boolean> {
  const { registry, ctx } = options
  if (!hasPropHooks(registry, kind)) return false
  let changed = await runHooksOnce(kind, layout, options.previous, ctx, options)
  if (options.localization === undefined) return changed
  const passChanged = await eachLocalePass(layout, { blocks: options.blocks, localization: options.localization, before: options.previous }, async (pass) => {
    const localCtx: FieldRunContext = { ...ctx, req: requestInLocale(ctx.req, pass.locale) }
    await runHooksOnce(kind, pass.view, pass.before, localCtx, { ...options, only: pass.only })
  })
  return changed || passChanged
}

async function runHooksOnce(
  kind: PropHookName,
  layout: Layout,
  previous: Layout | null | undefined,
  ctx: FieldRunContext,
  options: { blocks: readonly BlockDefinition[]; registry: FieldRegistry; only?: (block: Block, name: string) => boolean },
): Promise<boolean> {
  const { registry } = options
  let changed = false
  const req = ctx.req as { user?: unknown } | undefined
  await walkPropFields(layout, {
    blocks: options.blocks,
    registry,
    previous,
    types: typesWith(registry, kind),
    only: options.only,
    condition: { data: ctx.data, user: req?.user, operation: ctx.operation },
    visit: async (v) => {
      const hooks = v.semantics?.hooks[kind]
      if (!hooks) return
      for (const hook of hooks) {
        const value = v.siblingData[v.name]
        const result = await hook({
          blockData: v.blockData,
          collection: ctx.collection ?? null,
          context: ctx.context ?? {},
          data: ctx.data ?? {},
          field: v.field,
          global: null,
          indexPath: [],
          operation: ctx.operation,
          originalDoc: ctx.originalDoc,
          overrideAccess: ctx.overrideAccess,
          path: [ctx.layoutField, ...v.path],
          previousDoc: ctx.previousDoc,
          previousSiblingDoc: v.previousSiblingDoc ?? {},
          previousValue: v.previousSiblingDoc?.[v.name],
          req: ctx.req,
          schemaPath: [ctx.layoutField, ...v.schemaPath],
          siblingData: v.siblingData,
          siblingFields: v.siblingFields,
          value,
          ...(kind === 'afterRead'
            ? {
                currentDepth: ctx.currentDepth,
                depth: ctx.depth,
                draft: ctx.draft,
                findMany: ctx.findMany,
                showHiddenFields: ctx.showHiddenFields,
              }
            : {}),
        })
        if (result !== undefined && result !== value) {
          v.siblingData[v.name] = result
          changed = true
        }
      }
    },
  })
  return changed
}

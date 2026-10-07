// Runs the `validate` functions of block props with the options Payload passes to field
// validation, and returns the messages as layout errors (code `validate`, publish only).
//
// Payload's own default validators are not called here: `validateLayout` already checks types,
// required props, lengths, ranges, row counts and email addresses. Only functions the app wrote
// run (see fieldSemantics.ts for how they are told apart from Payload's defaults).

import type { FieldRunContext } from './fieldHooks'
import { walkPropFields, type FieldRegistry } from './fieldSemantics'
import { eachLocalePass, requestInLocale } from './locale'
import type { Block, BlockDefinition, Layout, LocaleSettings } from './types'
import type { LayoutError } from './validate'

export type ValidateRunOptions = {
  blocks: readonly BlockDefinition[]
  registry: FieldRegistry
  /** The layout before the change, for `previousValue`. */
  previous?: Layout | null
  /**
   * `data` must be the whole document (Payload merges the saved document with the incoming data).
   * `req` is required: without it, nothing runs.
   */
  ctx: FieldRunContext
  /** Only these blocks (ids). Default: every block. */
  only?: ReadonlySet<string>
  /** `onChange` while someone edits (the inspector), `submit` on save. Default `submit`. */
  event?: 'onChange' | 'submit'
  /**
   * With locales, the `validate` functions of localized props also run on each locale's own values
   * (`req.locale` set), and their messages carry the locale.
   */
  localization?: LocaleSettings | null
}

/** Block types with at least one prop that has a `validate` function. */
export function validatedTypes(registry: FieldRegistry): ReadonlySet<string> {
  return registry.types('validate')
}

/**
 * Calls every prop's own `validate` function. Skipped, as in Payload: fields their condition
 * hides. Also skipped: props bound to document data (the value comes from the document). A
 * validator that throws counts as a failed check with its message.
 */
export async function runPropValidators(layout: Layout, options: ValidateRunOptions): Promise<LayoutError[]> {
  const { registry, ctx } = options
  if (validatedTypes(registry).size === 0 || !ctx.req) return []
  const errors = await validateOnce(layout, options.previous, ctx, options)
  if (options.localization === undefined) return errors
  // A copy: validators must not change the layout.
  const copy = structuredClone(layout)
  await eachLocalePass(copy, { blocks: options.blocks, localization: options.localization, before: options.previous }, async (pass) => {
    const found = await validateOnce(pass.view, pass.before, { ...ctx, req: requestInLocale(ctx.req, pass.locale) }, { ...options, only: options.only, top: pass.only })
    for (const error of found) errors.push({ ...error, locale: pass.locale })
  })
  return errors
}

async function validateOnce(
  layout: Layout,
  previous: Layout | null | undefined,
  ctx: FieldRunContext,
  options: ValidateRunOptions & { top?: (block: Block, name: string) => boolean },
): Promise<LayoutError[]> {
  const { registry } = options
  const types = validatedTypes(registry)
  const req = ctx.req as { user?: unknown; t?: unknown }
  const errors: LayoutError[] = []
  await walkPropFields(layout, {
    blocks: options.blocks,
    registry,
    previous,
    types,
    only: options.top,
    condition: { data: ctx.data, user: req.user, operation: ctx.operation },
    visit: async (v) => {
      if (options.only && !options.only.has(v.block.id)) return false
      if (v.hidden) return false
      const validate = v.semantics?.validate
      if (!validate || v.bound) return
      let result: unknown
      try {
        result = await validate(v.siblingData[v.name], {
          ...v.field,
          id: ctx.id,
          blockData: v.blockData,
          collectionSlug: (ctx.collection as { slug?: string } | null | undefined)?.slug,
          data: ctx.data ?? {},
          event: options.event ?? 'submit',
          operation: ctx.operation,
          overrideAccess: ctx.overrideAccess,
          path: [ctx.layoutField, ...v.path],
          preferences: { fields: {} },
          previousValue: v.previousSiblingDoc?.[v.name],
          req: ctx.req,
          siblingData: v.siblingData,
        })
      } catch (error) {
        result = error instanceof Error && error.message ? error.message : 'This value could not be checked.'
      }
      if (typeof result === 'string') {
        errors.push({ blockId: v.block.id, path: v.errorPath, message: result || 'This value is not valid.', code: 'validate' })
      }
    },
  })
  return errors
}

/** `blocks[0].props.items[1].label` -> `items.1.label` (the inspector's path below a block's props). */
export function propPathOf(errorPath: string): string | null {
  const at = errorPath.lastIndexOf('.props.')
  if (at === -1) return null
  return errorPath.slice(at + '.props.'.length).replace(/\[(\d+)\]/g, '.$1')
}

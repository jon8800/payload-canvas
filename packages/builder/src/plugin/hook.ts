import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { ValidationError, type CollectionBeforeChangeHook } from 'payload'
import { collectClasses } from '../core/classes'
import { normalizeLayout } from '../core/tree'
import type { BlockDefinition, Layout } from '../core/types'
import { validateLayout, type LayoutError } from '../core/validate'
import { compileClasses, type CssOptions } from '../css'

/** Value of the generated CSS field. */
export type GeneratedCss = { hash: string; css: string }

type HookOptions = {
  collection: string
  field: string
  cssField: string
  blocks: BlockDefinition[]
  css: CssOptions
}

function isGeneratedCss(value: unknown): value is GeneratedCss {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.hash === 'string' && typeof v.css === 'string'
}

/** The hash covers the class list and the entry CSS, so a theme change also recompiles. */
async function hashInput(classes: string[], entry: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(classes.join(' '))
  hash.update('\0')
  try {
    hash.update(await readFile(entry))
  } catch {
    // The compile reports a missing entry file. The hash stays usable.
  }
  return hash.digest('hex').slice(0, 16)
}

/** Problems that never block a save. A developer removing a block field must not break pages. */
function isWarning(error: LayoutError): boolean {
  return error.code === 'unknown-prop' || error.code === 'unknown-key'
}

/** Missing required props block only publishing, so drafts and autosave can hold unfinished blocks. */
function isMissingRequired(error: LayoutError): boolean {
  return error.code === 'required'
}

function formatErrors(errors: LayoutError[]): string {
  return errors
    .map((error) => (error.path ? `${error.path}: ${error.message}` : error.message))
    .join('\n')
}

/**
 * Normalizes and validates the layout, then compiles its classes into the generated CSS field.
 * The layout is only normalized, never rewritten: autosave does not send server changes back
 * to the editor. Compile errors are logged and keep the previous CSS, so saving never fails
 * because of CSS.
 *
 * Validation: unknown props and unknown block keys are logged, never blocking. Missing required
 * props block only when the document is published (collections with drafts). On collections
 * without drafts they are logged. All other errors (shape, duplicate ids, unknown block types,
 * slot rules, wrong prop types) always block.
 */
export function layoutBeforeChange(options: HookOptions): CollectionBeforeChangeHook {
  const { collection: slug, field, cssField, blocks, css } = options

  return async ({ collection, data, originalDoc, req }) => {
    if (!data) return data

    const previous: unknown = originalDoc?.[cssField]
    // The generated field is server-owned. Ignore what the client sends.
    delete data[cssField]

    // Partial update without the layout: keep the stored layout and CSS.
    if (data[field] === undefined) return data

    const layout: Layout = normalizeLayout(data[field])
    const publishing =
      Boolean(collection.versions?.drafts) && (data._status ?? originalDoc?._status) === 'published'
    const blocking: LayoutError[] = []
    const warnings: LayoutError[] = []
    for (const error of validateLayout(layout, blocks)) {
      const warning = isWarning(error) || (isMissingRequired(error) && !publishing)
      if (warning) warnings.push(error)
      else blocking.push(error)
    }
    if (blocking.length > 0) {
      // One entry for the field, so the admin shows every problem under it.
      throw new ValidationError(
        { collection: slug, errors: [{ path: field, message: formatErrors(blocking) }], req },
        req.t,
      )
    }
    if (warnings.length > 0) {
      req.payload.logger.warn(`[websiteBuilder] ${slug}.${field} saved with warnings:\n${formatErrors(warnings)}`)
    }
    data[field] = layout

    // Block definitions add the classes their components use, so those reach the CSS too.
    const classes = collectClasses(layout, blocks)
    const hash = await hashInput(classes, css.entry)
    if (isGeneratedCss(previous) && previous.hash === hash) {
      data[cssField] = previous
      return data
    }

    if (classes.length === 0) {
      data[cssField] = { hash, css: '' } satisfies GeneratedCss
      return data
    }

    try {
      const output = await compileClasses(classes, css)
      data[cssField] = { hash, css: output } satisfies GeneratedCss
    } catch (error) {
      req.payload.logger.error({
        err: error,
        msg: `[websiteBuilder] CSS compile failed for ${slug}.${field}. Kept the previous CSS.`,
      })
      if (isGeneratedCss(previous)) data[cssField] = previous
    }
    return data
  }
}

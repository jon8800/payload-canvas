// Field logic of block props on the live paths: the access check of every commit (people, the
// operations endpoint, MCP agents) and the validation of one block for the inspector.

import type { PayloadRequest } from 'payload'

import { blockName } from '../core/blocks'
import { deniedPropChanges, denialMessage, hasPropAccess } from '../core/fieldAccess'
import { EMPTY_FIELD_REGISTRY, type FieldRegistry } from '../core/fieldSemantics'
import { propPathOf, runPropValidators } from '../core/fieldValidate'
import { indexLayout, isPlainObject, normalizeLayout } from '../core/tree'
import type { Block, BlockDefinition, Layout, LocaleSettings } from '../core/types'
import type { CommitArgs } from './session'
import type { LiveFieldProblem } from './types'

/** Key under `config.custom` (server only) where the plugin stores the field registry. */
export const FIELD_REGISTRY_KEY = 'websiteBuilderFields'

/** The registry the plugin stored, or an empty one. */
export function fieldRegistryOf(payload: { config: { custom?: Record<string, unknown> } }): FieldRegistry {
  const stored = payload.config.custom?.[FIELD_REGISTRY_KEY] as Partial<FieldRegistry> | undefined
  return typeof stored?.of === 'function' && typeof stored.types === 'function' ? (stored as FieldRegistry) : EMPTY_FIELD_REGISTRY
}

const collectionConfigOf = (req: PayloadRequest, slug: string): unknown =>
  (req.payload.collections as Record<string, { config: unknown } | undefined>)[slug]?.config ?? null

/**
 * The commit's field access check (`access.update` of block props) for this request's user, or
 * undefined when no prop has update access. A refused batch gets one readable message.
 */
export function propAccessCheck(
  req: PayloadRequest,
  options: {
    blocks: readonly BlockDefinition[]
    registry: FieldRegistry
    collection: string
    id: string
    field: string
    /** The document's locales: a translation is a change of its prop too. */
    localization?: LocaleSettings | null
  },
): CommitArgs['access'] {
  const { blocks, registry, collection, id, field } = options
  if (!hasPropAccess(registry, 'update')) return undefined
  return async ({ before, after, doc }) => {
    const denials = await deniedPropChanges(after, {
      before,
      doc,
      blocks,
      registry,
      ctx: { layoutField: field, req, collection: collectionConfigOf(req, collection), operation: 'update', id, overrideAccess: false },
      localization: options.localization ?? null,
    })
    if (denials.length === 0) return null
    const index = indexLayout(after)
    return denialMessage(denials, (blockId) => {
      const block = index.get(blockId)?.block
      return block ? blockName(block, blocks) : blockId
    })
  }
}

/**
 * Runs the props' own `validate` functions for one block, as the inspector shows them while
 * someone edits (`event: 'onChange'`). `data` is the document with the layout (the block put in
 * at its place). Returns the messages by prop path.
 */
export async function validateBlockProps(
  req: PayloadRequest,
  options: {
    blocks: readonly BlockDefinition[]
    registry: FieldRegistry
    collection: string
    id: string
    field: string
    block: Block
    /** The document (as read by the user), and the layout people see now. */
    doc: Record<string, unknown>
    layout: Layout
    /** The document's locales: the block's translations are checked too (problems name their locale). */
    localization?: LocaleSettings | null
  },
): Promise<LiveFieldProblem[]> {
  const { blocks, registry, collection, id, field, block } = options
  if (!registry.types('validate').has(block.type)) return []
  // The block as the editor has it, at its place in the layout (or alone when it is new).
  const layout = structuredClone(options.layout)
  const swap = (list: Block[]): boolean => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === block.id) {
        list[i] = { ...block, ...(list[i].slots ? { slots: list[i].slots } : {}) }
        return true
      }
      for (const children of Object.values(list[i].slots ?? {})) if (swap(children)) return true
    }
    return false
  }
  if (!swap(layout.blocks)) layout.blocks.push({ ...block, slots: undefined })
  const errors = await runPropValidators(layout, {
    blocks,
    registry,
    previous: options.layout,
    only: new Set([block.id]),
    event: 'onChange',
    localization: options.localization ?? null,
    ctx: {
      layoutField: field,
      req,
      collection: collectionConfigOf(req, collection),
      operation: 'update',
      id,
      data: { ...options.doc, [field]: layout },
      originalDoc: options.doc,
      overrideAccess: false,
    },
  })
  const problems: LiveFieldProblem[] = []
  for (const error of errors) {
    const propPath = propPathOf(error.path)
    if (propPath) problems.push({ propPath, message: error.message, ...(error.locale ? { locale: error.locale } : {}) })
  }
  return problems
}

/** A block from a request body, or null. Only the parts validation reads. */
export function blockFromBody(value: unknown): Block | null {
  if (!isPlainObject(value) || typeof value.id !== 'string' || !value.id || typeof value.type !== 'string') return null
  const layout = normalizeLayout({ version: 1, blocks: [{ ...value, slots: undefined }] })
  return layout.blocks[0] ?? null
}

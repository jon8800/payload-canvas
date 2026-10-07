// Field logic of block props on the live paths: the access check of every commit (people, the
// operations endpoint, MCP agents) and the validation of one block for the inspector.

import type { PayloadRequest } from 'payload'

import { blockName } from '../core/blocks'
import { deniedPropChanges, denialMessage, hasPropAccess, propAccessInfo, type PropAccessInfo, type PropAccessRule } from '../core/fieldAccess'
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

const ACCESS_TTL_MS = 30_000
const ACCESS_CACHE_MAX = 5000
const accessCache = new Map<string, { rule: PropAccessRule; at: number }>()

const userKey = (user: unknown): string => {
  const u = user as { id?: unknown; collection?: unknown; _mcpKey?: { keyId?: unknown } } | null
  return `${String(u?.collection ?? '')}:${String(u?.id ?? '')}:${String(u?._mcpKey?.keyId ?? '')}`
}

/**
 * What the request's user may read and change in each block of the document's layout (see
 * `propAccessInfo`), for the editor. Null when no block field has `access.read` or `access.update`.
 * Block results are cached for 30 s per user, document and block data, so an editor that asks
 * again after each burst of edits only runs the functions of the blocks that changed.
 */
export async function propAccessFor(
  req: PayloadRequest,
  options: {
    blocks: readonly BlockDefinition[]
    registry: FieldRegistry
    collection: string
    id: string
    field: string
    /** The stored layout people edit (the live session's, else the saved draft's). */
    layout: Layout
    /** The document without the layout. */
    doc: Record<string, unknown>
  },
): Promise<PropAccessInfo | null> {
  const { blocks, registry, collection, id, field } = options
  if (!hasPropAccess(registry, 'read') && !hasPropAccess(registry, 'update')) return null
  const prefix = `${userKey(req.user)}|${collection}:${id}|`
  const keyOf = (block: Block) => `${prefix}${block.id}|${block.type}|${JSON.stringify(block.props ?? null)}`
  const now = Date.now()
  return propAccessInfo(options.layout, {
    blocks,
    registry,
    doc: options.doc,
    ctx: { layoutField: field, req, collection: collectionConfigOf(req, collection), operation: 'update', id, overrideAccess: false },
    cache: {
      get(block) {
        const hit = accessCache.get(keyOf(block))
        return hit && now - hit.at < ACCESS_TTL_MS ? hit.rule : undefined
      },
      set(block, rule) {
        const key = keyOf(block)
        accessCache.delete(key)
        accessCache.set(key, { rule, at: now })
        // Oldest first: drop the oldest entries past the limit.
        for (const old of accessCache.keys()) {
          if (accessCache.size <= ACCESS_CACHE_MAX) break
          accessCache.delete(old)
        }
      },
    },
  })
}

/** A block from a request body, or null. Only the parts validation reads. */
export function blockFromBody(value: unknown): Block | null {
  if (!isPlainObject(value) || typeof value.id !== 'string' || !value.id || typeof value.type !== 'string') return null
  const layout = normalizeLayout({ version: 1, blocks: [{ ...value, slots: undefined }] })
  return layout.blocks[0] ?? null
}

// Saved sections in the full-screen builder (server only): the hook that stores the builder's
// layout as the section's `blocks`. See SECTION_LAYOUT_FIELD in ./sections.ts.

import type { CollectionBeforeChangeHook } from 'payload'

import { sameJson } from '../core/fieldSemantics'
import { isPlainObject, normalizeLayout } from '../core/tree'
import { GUARD_SEQ_CONTEXT, SESSION_SAVE_CONTEXT } from './hook'
import { SECTION_LAYOUT_FIELD } from './sections'

/**
 * Collection `beforeChange` hook, after the builder's layout hook: the layout the builder saved
 * becomes the stored `blocks`. Payload gives this hook the incoming data merged with the stored
 * document, so `layout` is always there. It wins when the live session saves, when the session
 * guard put the session's layout in (the session owns the blocks while it is open), and when it
 * differs from the stored blocks. Otherwise the incoming `blocks` stay (REST, MCP, the library).
 */
export const syncSectionBlocks: CollectionBeforeChangeHook = ({ context, data, originalDoc }) => {
  const layout: unknown = data?.[SECTION_LAYOUT_FIELD]
  if (!isPlainObject(layout) || !Array.isArray(layout.blocks)) return data
  const session = Boolean(context?.[SESSION_SAVE_CONTEXT] || context?.[GUARD_SEQ_CONTEXT] !== undefined)
  const stored = normalizeLayout({ version: 1, blocks: isPlainObject(originalDoc) ? originalDoc.blocks : [] }).blocks
  if (session || !sameJson(normalizeLayout({ version: 1, blocks: layout.blocks }).blocks, stored)) data.blocks = layout.blocks
  return data
}

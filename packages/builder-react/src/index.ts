// Default renderer and block components. Owner: renderer agent.
// No Payload runtime imports except in `loadLayoutData` (server only, payload passed in).

import type { ComponentType, ReactNode } from 'react'
import type { Payload } from 'payload'
import type { Block, BlockDefinition, Layout } from '@payload-toolkit/builder/core'

const NI = (): never => {
  throw new Error('not implemented')
}

/** "site" renders the public page. "canvas" adds editor attributes and empty-slot placeholders. */
export type RenderMode = 'site' | 'canvas'

export type BlockComponentProps = {
  block: Block
  /** Props after data loading (upload/relationship IDs replaced by documents when loaded). */
  props: Record<string, unknown>
  className?: string
  /** Rendered children per slot name. */
  slots: Record<string, ReactNode>
  /** Spread on the component's root element. In canvas mode it holds `data-block-id`. */
  attributes: Record<string, string>
  /** Spread on the element that directly contains each slot's children. */
  slotAttributes: Record<string, Record<string, string>>
  mode: RenderMode
}

export type BlockComponents = Record<string, ComponentType<BlockComponentProps>>

export const defaultComponents: BlockComponents = {}

export type RenderLayoutProps = {
  layout: Layout
  /** Overrides or additions, merged over `defaultComponents`. */
  components?: BlockComponents
  /** Generated CSS for the layout's classes (from the plugin's save hook). Rendered in a <style> tag. */
  css?: string | null
  mode?: RenderMode
}

/** Renders a layout. No hooks, so it works as a server component and inside the client canvas. */
export function RenderLayout(props: RenderLayoutProps): ReactNode {
  void props
  return NI()
}

/** Loads documents for a batch of ids in one collection. */
export type FetchDocs = (
  collection: string,
  ids: Array<string | number>,
) => Promise<Map<string | number, Record<string, unknown>>>

/** Replaces upload/relationship IDs in block props with documents, using `fetchDocs`. Never mutates. */
export async function resolveLayoutData(
  layout: Layout,
  blocks: BlockDefinition[],
  fetchDocs: FetchDocs,
): Promise<Layout> {
  void layout
  void blocks
  void fetchDocs
  return NI()
}

/** Server helper: resolveLayoutData with Payload's Local API (batched `find` per collection). */
export async function loadLayoutData(
  layout: Layout,
  blocks: BlockDefinition[],
  payload: Payload,
  options?: { draft?: boolean },
): Promise<Layout> {
  void layout
  void blocks
  void payload
  void options
  return NI()
}

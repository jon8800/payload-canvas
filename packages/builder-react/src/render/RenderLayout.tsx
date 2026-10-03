import type { ReactNode } from 'react'
import type { Block, BlockDefinition } from '@payload-toolkit/builder/core'
import { defaultComponents } from '../components'
import { defaultResolveLink } from './link'
import type { BlockComponents, BlockComponentProps, RenderLayoutProps, RenderMode, ResolveLink } from './types'

type Context = {
  mode: RenderMode
  components: BlockComponents
  definitions: Map<string, BlockDefinition>
  resolveLink: ResolveLink
}

const PLACEHOLDER_STYLE = { minHeight: 48, minWidth: 48 }
const UNKNOWN_STYLE = {
  padding: 8,
  border: '1px dashed currentColor',
  fontSize: 12,
  opacity: 0.6,
}

function slotNamesOf(block: Block, ctx: Context): string[] {
  const names = new Set(Object.keys(block.slots ?? {}))
  if (ctx.mode !== 'canvas') return [...names]
  const definition = ctx.definitions.get(block.type)
  if (!definition) names.add('children')
  for (const name of Object.keys(definition?.slots ?? {})) names.add(name)
  return [...names]
}

function renderBlocks(blocks: Block[], ctx: Context): ReactNode[] {
  return blocks.map((block) => renderBlock(block, ctx))
}

function renderSlot(block: Block, slot: string, ctx: Context): ReactNode {
  const children = block.slots?.[slot] ?? []
  if (children.length > 0) return renderBlocks(children, ctx)
  if (ctx.mode !== 'canvas') return null
  return (
    <div
      data-slot-empty=""
      data-slot-owner={block.id}
      data-slot={slot}
      style={PLACEHOLDER_STYLE}
    />
  )
}

function renderBlock(block: Block, ctx: Context): ReactNode {
  const canvas = ctx.mode === 'canvas'
  if (block.hidden && !canvas) return null

  const attributes: Record<string, string> = canvas
    ? { 'data-block-id': block.id, 'data-block-type': block.type }
    : {}
  if (canvas && block.hidden) attributes['data-builder-hidden'] = 'true'

  const Component = ctx.components[block.type]
  if (!Component) {
    if (!canvas) return null
    return (
      <div key={block.id} {...attributes} data-builder-unknown="" style={UNKNOWN_STYLE}>
        Unknown block: {block.type}
      </div>
    )
  }

  const slots: Record<string, ReactNode> = {}
  const slotAttributes: Record<string, Record<string, string>> = {}
  for (const slot of slotNamesOf(block, ctx)) {
    slots[slot] = renderSlot(block, slot, ctx)
    slotAttributes[slot] = canvas ? { 'data-slot-owner': block.id, 'data-slot': slot } : {}
  }

  const componentProps: BlockComponentProps = {
    block,
    props: block.props ?? {},
    className: block.className,
    slots,
    attributes,
    slotAttributes,
    mode: ctx.mode,
    resolveLink: ctx.resolveLink,
  }
  return <Component key={block.id} {...componentProps} />
}

/** Renders a layout. No hooks, so it works as a server component and inside the client canvas. */
export function RenderLayout({
  layout,
  components,
  css,
  mode = 'site',
  blocks,
  resolveLink,
}: RenderLayoutProps): ReactNode {
  const ctx: Context = {
    mode,
    components: { ...defaultComponents, ...components },
    definitions: new Map((blocks ?? []).map((definition) => [definition.type, definition])),
    resolveLink: resolveLink ?? defaultResolveLink,
  }
  return (
    <>
      {css ? (
        <style
          data-builder-css=""
          // The CSS comes from the plugin's own compiler. Break any closing tag so it cannot end the element.
          dangerouslySetInnerHTML={{ __html: css.replaceAll('</style', '<\\/style') }}
        />
      ) : null}
      {renderBlocks(layout.blocks, ctx)}
    </>
  )
}

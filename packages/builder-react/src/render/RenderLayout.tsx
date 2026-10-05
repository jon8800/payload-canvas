import { Fragment, memo, type ReactNode } from 'react'
import {
  blocksHaveMotion,
  COLLECTION_LIST_BLOCK,
  motionAttributes,
  staggersChildren,
  LIST_ITEM_SLOT,
  LIST_ITEMS_PROP,
  resolveBlockBindings,
  type Block,
  type BlockDefinition,
  type BindingOptions,
  type TemplateContext,
} from '@payload-toolkit/builder/core'
import { defaultBlocks, isLinkField, withBuilderCssClass } from '@payload-toolkit/builder/blocks'
import { defaultComponents } from '../components'
import { fieldFor } from '../components/Field'
import { richTextFor } from '../components/RichText'
import { mapFieldValues, type FieldLike, type VisitField } from './fields'
import { defaultResolveLink, resolveLinkValue } from './link'
import { listItemsOf } from './lists'
import { MotionRuntime } from '../motion/MotionRuntime'
import { MotionStyle } from '../motion/style'
import { readsPageData } from './marks'
import { urlResolver } from './resolve'
import { SlotOutlet } from './SlotOutlet'
import type { BlockComponents, BlockComponentProps, PageData, RenderLayoutProps, RenderMode, ResolveLink } from './types'

type Context = {
  mode: RenderMode
  components: BlockComponents
  definitions: Map<string, BlockDefinition>
  resolveLinks: VisitField
  binding: BindingOptions
  /** The document bindings and Field blocks read. Inside a collection list: the item. */
  context: TemplateContext | null
  /**
   * Canvas only: a repeated collection list item after the first. Its blocks get
   * `data-builder-repeat` instead of editor attributes, so selection maps to the first item.
   */
  repeat: boolean
  /** Given to components that read the page data (see `withPageData`). */
  pageData: PageData | null
}

const PLACEHOLDER_STYLE = { minHeight: 48, minWidth: 48 }
const UNKNOWN_STYLE = {
  padding: 8,
  border: '1px dashed currentColor',
  fontSize: 12,
  opacity: 0.6,
}

/** Used when RenderLayout gets no `blocks`. Link fields have the same shape for every option. */
const DEFAULT_DEFINITIONS = defaultBlocks()

/** Editor attributes (block ids, slot owners, placeholders) go on the canvas, never on repeats. */
const isEditor = (ctx: Context) => ctx.mode === 'canvas' && !ctx.repeat

function slotNamesOf(block: Block, ctx: Context): string[] {
  const names = new Set(Object.keys(block.slots ?? {}))
  if (!isEditor(ctx)) return [...names]
  const definition = ctx.definitions.get(block.type)
  if (!definition) names.add('children')
  for (const name of Object.keys(definition?.slots ?? {})) names.add(name)
  return [...names]
}

/**
 * One block on the canvas. Memoized by block identity: the canvas keeps unchanged blocks as the
 * same objects (`shareStructure`), so an edit renders only the changed block and its ancestors.
 */
const CanvasBlock = memo(function CanvasBlock({ block, ctx, item }: { block: Block; ctx: Context; item: boolean }) {
  return renderBlock(block, ctx, false, item)
})

/** `item`: the blocks are direct children of a block whose entrance staggers its children. */
function renderBlocks(blocks: Block[], ctx: Context, item = false): ReactNode[] {
  if (ctx.mode === 'canvas') return blocks.map((block) => <CanvasBlock key={block.id} block={block} ctx={ctx} item={item} />)
  return blocks.map((block) => renderBlock(block, ctx, false, item))
}

function renderSlot(block: Block, slot: string, ctx: Context): ReactNode {
  const children = block.slots?.[slot] ?? []
  if (children.length > 0) return renderBlocks(children, ctx, staggersChildren(block.motion))
  if (!isEditor(ctx)) return null
  return (
    <div
      data-slot-empty=""
      data-slot-owner={block.id}
      data-slot={slot}
      style={PLACEHOLDER_STYLE}
    />
  )
}

/**
 * The `item` slot of a collection list, once per loaded document. Each repetition binds to its
 * own document. With no documents, the editor still shows the item design once.
 */
function renderListItems(block: Block, ctx: Context): ReactNode {
  const items = listItemsOf(block.props)
  const collection = typeof block.props?.collection === 'string' ? block.props.collection : ''
  const children = block.slots?.[LIST_ITEM_SLOT] ?? []
  if (items.length === 0) {
    if (ctx.mode !== 'canvas') return null
    return renderSlot(block, LIST_ITEM_SLOT, { ...ctx, context: { collection, doc: {} } })
  }
  if (children.length === 0) return renderSlot(block, LIST_ITEM_SLOT, ctx)
  return items.map((doc, i) => (
    <Fragment key={typeof doc.id === 'string' || typeof doc.id === 'number' ? doc.id : i}>
      {renderBlocks(
        children,
        {
          ...ctx,
          context: { collection, doc },
          repeat: ctx.repeat || (ctx.mode === 'canvas' && i > 0),
        },
        staggersChildren(block.motion),
      )}
    </Fragment>
  ))
}

/** The block's props with every link group resolved to plain data (`ResolvedLink`). */
function componentPropsOf(block: Block, ctx: Context): Record<string, unknown> {
  let props = block.props ?? {}
  // List documents stay with the renderer: components get rendered items, not data.
  if (LIST_ITEMS_PROP in props) {
    const { [LIST_ITEMS_PROP]: _items, ...rest } = props
    props = rest
  }
  const fields = ctx.definitions.get(block.type)?.fields as FieldLike[] | undefined
  return fields ? mapFieldValues(props, fields, ctx.resolveLinks) : props
}

/**
 * One block. `preview`: the block renders on the server for the canvas (`renderPreviewBlock`).
 * It gets no editor attributes (the canvas adds them to its first element), and each slot is a
 * `SlotOutlet`, where the canvas shows the children it rendered itself.
 */
function renderBlock(stored: Block, ctx: Context, preview = false, item = false): ReactNode {
  const canvas = ctx.mode === 'canvas'
  const editor = isEditor(ctx)
  if (stored.hidden && !editor) return null

  const block = ctx.context
    ? resolveBlockBindings(stored, ctx.context, ctx.definitions.get(stored.type), ctx.binding)
    : stored

  const attributes: Record<string, string> = preview
    ? {}
    : editor
    ? { 'data-block-id': block.id, 'data-block-type': block.type }
    : canvas
      ? { 'data-builder-repeat': '' }
      : {}
  if (editor && !preview && block.hidden) attributes['data-builder-hidden'] = 'true'
  // Animations: settings for the motion runtime (the canvas plays them only on request).
  if (!preview && (stored.motion || item)) Object.assign(attributes, motionAttributes(stored.motion, item))

  const Component = ctx.components[block.type]
  if (!Component) {
    if (!editor || preview) return null
    // A known block without a component in this map, e.g. a server-only component the canvas
    // cannot run: the editor still shows and selects it.
    const definition = ctx.definitions.get(block.type)
    return (
      <div key={block.id} {...attributes} data-builder-unknown="" style={UNKNOWN_STYLE}>
        {definition ? `${definition.label}: no preview in the editor` : `Unknown block: ${block.type}`}
      </div>
    )
  }

  const slots: Record<string, ReactNode> = {}
  const slotAttributes: Record<string, Record<string, string>> = {}
  const isList = block.type === COLLECTION_LIST_BLOCK
  for (const slot of slotNamesOf(block, ctx)) {
    if (preview) slots[slot] = <SlotOutlet name={slot} />
    else slots[slot] = isList && slot === LIST_ITEM_SLOT ? renderListItems(block, ctx) : renderSlot(block, slot, ctx)
    slotAttributes[slot] = editor ? { 'data-slot-owner': block.id, 'data-slot': slot } : {}
  }
  if (isList && !(LIST_ITEM_SLOT in slots)) {
    slots[LIST_ITEM_SLOT] = renderListItems(block, ctx)
    slotAttributes[LIST_ITEM_SLOT] = {}
  }

  // Plain data only: a component may be a client component rendered from the server.
  const componentProps: BlockComponentProps = {
    block: stored,
    props: componentPropsOf(block, ctx),
    // The marker class: the generated CSS styles only elements that have it.
    className: withBuilderCssClass(block.className),
    slots,
    attributes,
    slotAttributes,
    mode: ctx.mode,
  }
  if (ctx.pageData && readsPageData(Component)) componentProps.pageData = ctx.pageData
  return <Component key={block.id} {...componentProps} />
}

function createContext(
  mode: RenderMode,
  components: BlockComponents | undefined,
  blocks: BlockDefinition[] | undefined,
  resolveLink: ResolveLink,
  context: TemplateContext | null,
  pageData: PageData | null,
): Context {
  return {
    mode,
    // The built-in rich text and Field blocks get the resolver through a closure, never through props.
    components: { ...defaultComponents, richText: richTextFor(resolveLink), field: fieldFor(resolveLink), ...components },
    definitions: new Map((blocks ?? DEFAULT_DEFINITIONS).map((definition) => [definition.type, definition])),
    resolveLinks: linkVisitor(resolveLink),
    binding: { url: urlResolver(resolveLink) },
    context,
    repeat: false,
    pageData,
  }
}

/** The canvas's last render context and the inputs it was made from. */
let canvasContext: { inputs: unknown[]; ctx: Context } | null = null

/**
 * The render context. On the canvas it stays the same object while its inputs stay the same, so
 * memoized blocks can skip. The site builds a fresh one per render (nothing is kept between requests).
 */
function contextFor(
  mode: RenderMode,
  components: BlockComponents | undefined,
  blocks: BlockDefinition[] | undefined,
  resolveLink: ResolveLink,
  context: TemplateContext | null,
  pageData: PageData | null,
): Context {
  if (mode !== 'canvas') return createContext(mode, components, blocks, resolveLink, context, pageData)
  const inputs = [components, blocks, resolveLink, context, pageData]
  if (canvasContext && canvasContext.inputs.every((input, i) => input === inputs[i])) return canvasContext.ctx
  canvasContext = { inputs, ctx: createContext(mode, components, blocks, resolveLink, context, pageData) }
  return canvasContext.ctx
}

function linkVisitor(resolveLink: ResolveLink): VisitField {
  return (field, value) => (isLinkField(field) ? resolveLinkValue(value, resolveLink) : value)
}

/**
 * Renders a layout. No hooks, so it works as a server component and inside the client canvas.
 * Block components get plain data only (see `BlockComponentProps`): links are resolved here.
 * With `context`, bound props and Field blocks read that document. Collection lists render their
 * `item` slot once per document (load them with `loadLayoutData`).
 */
export function RenderLayout({
  layout,
  components,
  css,
  mode = 'site',
  blocks,
  resolveLink = defaultResolveLink,
  context,
  pageData,
}: RenderLayoutProps): ReactNode {
  const ctx = contextFor(mode, components, blocks, resolveLink, context ?? null, pageData ?? null)
  const motion = mode === 'site' && blocksHaveMotion(layout.blocks)
  return (
    <>
      <BuilderStyle css={css} />
      {motion && <MotionStyle />}
      {renderBlocks(layout.blocks, ctx)}
      {motion && <MotionRuntime />}
    </>
  )
}

export type PreviewBlockOptions = Pick<RenderLayoutProps, 'components' | 'blocks' | 'resolveLink' | 'context' | 'pageData'>

/**
 * Server preview for the canvas (`createCanvasServer`): renders one block (its data already
 * loaded) as the canvas would, with the given components. It gets no editor attributes, and each
 * slot is a `SlotOutlet`: the canvas fills it with the children it renders itself, so they stay
 * editable. Its slot containers get the editor's slot attributes, as on the canvas.
 */
export function renderPreviewBlock(block: Block, options: PreviewBlockOptions = {}): ReactNode {
  const ctx = createContext(
    'canvas',
    options.components,
    options.blocks,
    options.resolveLink ?? defaultResolveLink,
    options.context ?? null,
    options.pageData ?? null,
  )
  return renderBlock(block, ctx, true)
}

/**
 * The generated CSS in a `<style data-builder-css>` tag (nothing without CSS). When a page renders
 * several layouts (header, page, footer), output it once with `compilePageCss` (`/server`) and
 * give those `RenderLayout`s no `css`: one stylesheet keeps Tailwind's variant order.
 */
export function BuilderStyle({ css }: { css?: string | null }): ReactNode {
  if (!css) return null
  return (
    <style
      data-builder-css=""
      // The CSS comes from the plugin's own compiler. Break any closing tag so it cannot end the element.
      dangerouslySetInnerHTML={{ __html: css.replaceAll('</style', '<\\/style') }}
    />
  )
}

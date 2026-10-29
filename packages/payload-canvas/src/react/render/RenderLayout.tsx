import { Fragment, memo, type ReactNode } from 'react'
import {
  blockParts,
  blocksHaveMotion,
  COLLECTION_LIST_BLOCK,
  htmlAttributes,
  isRepeatSlot,
  LIST_EMPTY_SLOT,
  listItemContext,
  motionAttributes,
  staggersChildren,
  LIST_ITEM_SLOT,
  LIST_ITEMS_PROP,
  repeatRowContext,
  resolveBindings,
  resolveBlockBindings,
  type Block,
  type BlockDefinition,
  type BindingOptions,
  type BindingRelations,
  type Layout,
  type TemplateContext,
} from '../../core'
import { ACCORDION_BLOCK, defaultBlocks, faqItems, faqJsonLd, isLinkField, SECTION_REF_SLOT, withBuilderCssClass } from '../../blocks'
import { defaultComponents } from '../components'
import { fieldFor } from '../components/Field'
import { richTextFor } from '../components/RichText'
import { mapFieldValues, type FieldLike, type VisitField } from './fields'
import { defaultResolveLink, resolveLinkValue } from './link'
import { listItemsOf } from './lists'
import { MotionRuntime } from '../motion/MotionRuntime'
import { MotionStyle } from '../motion/style'
import { readsClientLinks, readsLinkComponent, readsPageData } from './marks'
import { relationsIn, RELATIONS_PROP } from './relations'
import { urlResolver } from './resolve'
import type { BlockComponents, BlockComponentProps, LinkComponent, PageData, RenderLayoutProps, RenderMode, ResolveLink } from './types'

type Context = {
  mode: RenderMode
  components: BlockComponents
  definitions: Map<string, BlockDefinition>
  resolveLinks: VisitField
  binding: BindingOptions
  /** The document bindings and Field blocks read. Inside a collection list: the item; inside a repeat: the row. */
  context: TemplateContext | null
  /**
   * Canvas only: a repeated collection list item or repeat row after the first. Its blocks get
   * `data-builder-repeat` instead of editor attributes, so selection maps to the first item.
   */
  repeat: boolean
  /**
   * A collection list item or repeat row after the first, on the site and the canvas. Its blocks
   * leave out their HTML `id`, so an id stays unique on the page.
   */
  copy: boolean
  /** Given to components that read the page data (see `withPageData`). */
  pageData: PageData | null
  /** Server renders for the canvas (`renderPreviewBlock`): the components' `canvasMode` prop. */
  canvasMode?: 'canvas' | 'thumbnail'
  /** Server renders for the canvas: what stands in for each slot's children (see `preview.tsx`). */
  slotOutlet?: (slot: string) => ReactNode
  /** Site only: given to components marked with `withLinkComponent`. */
  linkComponent: LinkComponent | null
  /**
   * Site only: how many more images load first. One object shared by every block of the first
   * section, so the count runs in page order. `null` outside the first section.
   */
  priority: { left: number } | null
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

/** The contexts a list block's `item` slot renders with: one per listed document or repeat row. */
function repeatContexts(block: Block, around: TemplateContext | null): TemplateContext[] {
  const collection = typeof block.props?.collection === 'string' ? block.props.collection : ''
  if (block.type === COLLECTION_LIST_BLOCK) return listItemsOf(block.props).map((doc, i) => listItemContext(doc, i, around, collection))
  const rows = block.props?.[LIST_ITEMS_PROP]
  return Array.isArray(rows) ? rows.map((row, i) => repeatRowContext(row, i, around, collection)) : []
}

/** True when a collection list shows its `empty` slot: it has no documents. */
const showsEmpty = (block: Block) => block.type === COLLECTION_LIST_BLOCK && listItemsOf(block.props).length === 0

/**
 * The `item` slot of a collection list (once per loaded document) or a repeat (once per row).
 * Each repetition binds to its own document or row. On the canvas only the first one is
 * editable; the others are repeats. With nothing to repeat, the editor still shows the item
 * design once, and the site shows nothing.
 */
function renderListItems(block: Block, ctx: Context): ReactNode {
  const contexts = repeatContexts(block, ctx.context)
  // `loadLayoutData` gives lists the relationship map their items' `<path>.$url` bindings need.
  const relations = relationsIn(block.props)
  const binding = relations ? { ...ctx.binding, relations } : ctx.binding
  const children = block.slots?.[LIST_ITEM_SLOT] ?? []
  if (contexts.length === 0) {
    if (ctx.mode !== 'canvas') return null
    const collection = block.type === COLLECTION_LIST_BLOCK && typeof block.props?.collection === 'string' ? block.props.collection : ''
    return renderSlot(block, LIST_ITEM_SLOT, { ...ctx, context: listItemContext({}, 0, ctx.context, collection) })
  }
  if (children.length === 0) return renderSlot(block, LIST_ITEM_SLOT, ctx)
  return contexts.map((context, i) => (
    <Fragment key={typeof context.doc.id === 'string' || typeof context.doc.id === 'number' ? context.doc.id : i}>
      {renderBlocks(
        children,
        {
          ...ctx,
          context,
          binding,
          repeat: ctx.repeat || (ctx.mode === 'canvas' && i > 0),
          copy: ctx.copy || i > 0,
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
  if (LIST_ITEMS_PROP in props || RELATIONS_PROP in props) {
    const { [LIST_ITEMS_PROP]: _items, [RELATIONS_PROP]: _relations, ...rest } = props
    props = rest
  }
  const definition = ctx.definitions.get(block.type)
  const fields = definition?.fields as FieldLike[] | undefined
  return fields ? mapFieldValues(props, fields, ctx.resolveLinks) : props
}

/**
 * True when the block's image loads first: its `priority` prop is on, or not set while the
 * first section still has images to give priority to (`priorityImages`). Each one counts.
 */
function takesPriority(block: Block, ctx: Context): boolean {
  const own = block.props?.priority
  if (!ctx.priority || ctx.priority.left <= 0 || own === false) return own === true
  const definition = ctx.definitions.get(block.type)
  const hasPriority = definition?.fields?.some((field) => 'name' in field && field.name === 'priority')
  if (!hasPriority) return own === true
  ctx.priority.left -= 1
  return true
}

/**
 * One block. `preview`: the block renders on the server for the canvas (`renderPreviewBlock`).
 * It gets no editor attributes (the canvas adds them to its first element), and each slot is
 * `ctx.slotOutlet`, where the canvas shows the children it rendered itself.
 */
function renderBlock(stored: Block, ctx: Context, preview = false, item = false): ReactNode {
  const canvas = ctx.mode === 'canvas'
  const editor = isEditor(ctx)
  if (stored.hidden && !editor) return null

  const block = ctx.context
    ? resolveBlockBindings(stored, ctx.context, ctx.definitions.get(stored.type), ctx.binding)
    : stored
  // Visibility conditions that do not match hide the block (the canvas shows it dimmed).
  if (block.hidden && !editor) return null

  const attributes: Record<string, string> = preview
    ? {}
    : editor
    ? { 'data-block-id': block.id, 'data-block-type': block.type }
    : canvas
      ? { 'data-builder-repeat': '' }
      : {}
  if (editor && !preview && block.hidden) attributes['data-builder-hidden'] = 'true'
  // The block's own HTML attributes (id, aria-label, aria-hidden). Copies of a list row leave out the id.
  if (stored.attrs) {
    const own = htmlAttributes(stored.attrs)
    if (ctx.copy) delete own.id
    Object.assign(attributes, own)
  }
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

  // Before the slots: a block's own image comes before the images of its children.
  const priority = takesPriority(block, ctx)
  const slots: Record<string, ReactNode> = {}
  const partAttributes: Record<string, Record<string, string>> = {}
  const definition = ctx.definitions.get(block.type)
  const isList = isRepeatSlot(block.type, LIST_ITEM_SLOT)
  for (const slot of slotNamesOf(block, ctx)) {
    if (slot === SECTION_REF_SLOT) {
      // A live saved section: its blocks render as repeats on the canvas (the ref is what the
      // editor selects), and its runtime slot is never a drop target.
      slots[slot] = renderBlocks(block.slots?.[slot] ?? [], { ...ctx, repeat: ctx.repeat || canvas })
      partAttributes[slot] = {}
      continue
    }
    if (preview) slots[slot] = ctx.slotOutlet?.(slot) ?? null
    else if (isRepeatSlot(block.type, slot)) slots[slot] = renderListItems(block, ctx)
    else if (block.type === COLLECTION_LIST_BLOCK && slot === LIST_EMPTY_SLOT) slots[slot] = showsEmpty(block) ? renderSlot(block, slot, ctx) : null
    else slots[slot] = renderSlot(block, slot, ctx)
    partAttributes[slot] = editor ? { 'data-slot-owner': block.id, 'data-slot': slot } : {}
  }
  if (isList && !(LIST_ITEM_SLOT in slots)) {
    slots[LIST_ITEM_SLOT] = renderListItems(block, ctx)
    partAttributes[LIST_ITEM_SLOT] = {}
  }
  // Parts (styled slots and `parts`) carry their own classes, with the marker class.
  for (const part of blockParts(definition)) {
    const own = (partAttributes[part.name] ??= {})
    const partClass = withBuilderCssClass(stored.partClassName?.[part.name])
    if (partClass) own.className = partClass
  }

  const props = componentPropsOf(block, ctx)
  // Plain data only: a component may be a client component rendered from the server.
  const componentProps: BlockComponentProps = {
    block: stored,
    props: priority && props.priority !== true ? { ...props, priority: true } : props,
    // The marker class: the generated CSS styles only elements that have it.
    className: withBuilderCssClass(block.className),
    slots,
    attributes,
    partAttributes,
    slotAttributes: partAttributes,
    mode: ctx.mode,
  }
  if (ctx.pageData && readsPageData(Component)) componentProps.pageData = ctx.pageData
  if (ctx.canvasMode) componentProps.canvasMode = ctx.canvasMode
  if (ctx.linkComponent && readsLinkComponent(Component)) componentProps.linkComponent = ctx.linkComponent
  if (ctx.linkComponent && readsClientLinks(Component)) componentProps.clientLinks = true
  return <Component key={block.id} {...componentProps} />
}

function createContext(
  mode: RenderMode,
  components: BlockComponents | undefined,
  blocks: BlockDefinition[] | undefined,
  resolveLink: ResolveLink,
  context: TemplateContext | null,
  pageData: PageData | null,
  relations: BindingRelations | null = null,
  linkComponent: LinkComponent | null = null,
): Context {
  return {
    mode,
    // The built-in rich text and Field blocks get the resolver through a closure, never through props.
    components: { ...defaultComponents, richText: richTextFor(resolveLink), field: fieldFor(resolveLink), ...components },
    definitions: new Map((blocks ?? DEFAULT_DEFINITIONS).map((definition) => [definition.type, definition])),
    resolveLinks: linkVisitor(resolveLink),
    binding: { url: urlResolver(resolveLink), ...(relations ? { relations } : {}) },
    context,
    repeat: false,
    copy: false,
    pageData,
    // The editor keeps plain links: a client-side router link would navigate the canvas.
    linkComponent: mode === 'site' ? linkComponent : null,
    priority: null,
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
  relations: BindingRelations | null,
  linkComponent: LinkComponent | null,
): Context {
  if (mode !== 'canvas') return createContext(mode, components, blocks, resolveLink, context, pageData, relations, linkComponent)
  const inputs = [components, blocks, resolveLink, context, pageData, relations]
  if (canvasContext && canvasContext.inputs.every((input, i) => input === inputs[i])) return canvasContext.ctx
  canvasContext = { inputs, ctx: createContext(mode, components, blocks, resolveLink, context, pageData, relations) }
  return canvasContext.ctx
}

function linkVisitor(resolveLink: ResolveLink): VisitField {
  return (field, value) => (isLinkField(field) ? resolveLinkValue(value, resolveLink) : value)
}

/**
 * The site's top-level blocks. The first shown one (the first section) gives its first
 * `priorityImages` images priority: it is the part of the page a visitor sees first.
 */
function renderSections(blocks: Block[], ctx: Context, priorityImages: number): ReactNode[] {
  const first = blocks.findIndex((block) => !block.hidden)
  return blocks.map((block, i) => renderBlock(block, i === first ? { ...ctx, priority: { left: priorityImages } } : ctx))
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
  relations,
  linkComponent,
  priorityImages = 1,
  faqJsonLd: faqMarkup = true,
}: RenderLayoutProps): ReactNode {
  const ctx = contextFor(mode, components, blocks, resolveLink, context ?? null, pageData ?? null, relations ?? null, linkComponent ?? null)
  const motion = mode === 'site' && blocksHaveMotion(layout.blocks)
  return (
    <>
      <BuilderStyle css={css} />
      {motion && <MotionStyle blocks={layout.blocks} />}
      {mode === 'site' && priorityImages > 0 ? renderSections(layout.blocks, ctx, priorityImages) : renderBlocks(layout.blocks, ctx)}
      {motion && <MotionRuntime />}
      {mode === 'site' && faqMarkup && <FaqJsonLd layout={layout} definitions={[...ctx.definitions.values()]} context={ctx.context} binding={ctx.binding} />}
    </>
  )
}

/** True when a block in the list (children included) is an accordion with `faqSchema` on. */
function hasFaqAccordion(list: Block[]): boolean {
  return list.some(
    (block) => (block.type === ACCORDION_BLOCK && block.props?.faqSchema === true) || Object.values(block.slots ?? {}).some(hasFaqAccordion),
  )
}

/**
 * FAQPage JSON-LD for the accordions with `faqSchema` on: one `<script>` per layout, nothing when
 * no accordion opts in or no item has a question and an answer. Bindings resolve against the
 * layout's document first, so a layout that skipped `loadLayoutData` still gets the values.
 */
function FaqJsonLd({ layout, definitions, context, binding }: { layout: Layout; definitions: BlockDefinition[]; context: TemplateContext | null; binding: BindingOptions }) {
  if (!hasFaqAccordion(layout.blocks)) return null
  const resolved = context ? resolveBindings(layout, context, definitions, binding) : layout
  const data = faqJsonLd(faqItems(resolved, definitions))
  if (!data) return null
  // `<` escaped, so a "</script>" in an answer cannot end the element.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}

export type PreviewBlockOptions = Pick<RenderLayoutProps, 'components' | 'blocks' | 'resolveLink' | 'context' | 'pageData'> & {
  /** Which canvas the block renders for. Default `'canvas'`. The component gets it as `canvasMode`. */
  canvasMode?: 'canvas' | 'thumbnail'
}

/**
 * One block rendered as the canvas would, with `slotOutlet` for each slot's children. Use
 * `renderPreviewBlock` (`preview.tsx`): this module must not import the client `SlotOutlet`, or
 * every site page would ship it.
 */
export function renderBlockPreview(block: Block, options: PreviewBlockOptions, slotOutlet: (slot: string) => ReactNode): ReactNode {
  const ctx = createContext(
    'canvas',
    options.components,
    options.blocks,
    options.resolveLink ?? defaultResolveLink,
    options.context ?? null,
    options.pageData ?? null,
  )
  ctx.canvasMode = options.canvasMode ?? 'canvas'
  ctx.slotOutlet = slotOutlet
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

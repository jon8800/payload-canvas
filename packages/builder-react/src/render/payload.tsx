// Renders components written for Payload's `blocks` data (`{ blockType, ...fields }`) inside a
// builder layout. No hooks here, so it works on the server (site) and in the canvas.

import type { ComponentType, ElementType, ReactNode } from 'react'
import { getBlockDefinition, payloadSlugOf, toPayloadBlock, withFieldDefaults, type BlockDefinition } from '@payload-toolkit/builder/core'

import { isAsyncComponent, renderOnServer, withPageData } from './marks'
import { PayloadRoot } from './PayloadRoot'
import type { BlockComponentProps, BlockComponents, PageData, RenderMode } from './types'

/** What the builder adds to a Payload-shaped component's props, under `builder`. */
export type PayloadBuilderProps = {
  mode: RenderMode
  /** The block's Tailwind classes (only for blocks with `styles: true`). */
  className?: string
  /** The editor attributes for the root element. The adapter applies them itself. */
  attributes: Record<string, string>
  /** Each slot rendered by the builder: every child carries its editor attributes. */
  slots: Record<string, ReactNode>
  /** Spread on the element that holds a slot's children, so the canvas can drop into it. */
  slotAttributes: Record<string, Record<string, string>>
}

/**
 * The props a Payload-shaped component receives: the block's field values as in Payload
 * (`depth`-loaded uploads and relationships, field defaults filled in), `id`, `blockType`,
 * `blockName`, every slot as a nested array of Payload-shaped blocks under its field name, and
 * `builder` with the rendered slots.
 */
export type PayloadBlockProps<T = Record<string, unknown>> = T & {
  id: string
  blockType: string
  blockName?: string
  builder?: PayloadBuilderProps
}

/**
 * A block as Payload's `blocks` field stores it: `id`, `blockType`, `blockName`, the field values
 * (uploads and relationships loaded, defaults filled in) and each slot as a nested array of such
 * blocks under its field name.
 */
export type PayloadBlockData = { id: string; blockType: string; blockName?: string } & Record<string, unknown>

export type FromPayloadComponentOptions = {
  /**
   * The block definitions (the same list as the plugin). They give the Payload `blockType` of
   * prefixed blocks, the slots of empty blocks and the field defaults. Without them, the block
   * `type` is the `blockType`.
   */
  blocks?: readonly BlockDefinition[]
  /**
   * Blocks with `styles: true` have Tailwind classes. `'wrap'` (default) wraps the component in
   * a `div` with the classes. `'prop'` passes them only as `builder.className`.
   */
  className?: 'wrap' | 'prop'
  /**
   * The props the component gets. Default: the block's data spread as props plus `builder`
   * (`{ ...block, builder }`). For components that take the block as one prop and the page's
   * data as another, as in `<Component block={block} context={context} />`:
   *
   * ```ts
   * fromPayloadComponent(Hero, { blocks, props: (block, context) => ({ block, context }) })
   * ```
   *
   * `context` is the page data: `RenderLayout`'s `pageData` on the site, and the `pageData`
   * loader of `createCanvasServer` in the canvas. `{}` when there is none.
   */
  props?: (block: PayloadBlockData, context: PageData, builder: PayloadBuilderProps) => object
  /**
   * `'server'`: the canvas renders this block on the server (see `createCanvasServer`), even
   * when the canvas can import the component. Async components (server components that load
   * data) render on the server without this.
   */
  render?: 'server'
}

const EMPTY_PAGE_DATA: PageData = Object.freeze({}) as PageData

/**
 * Wraps a component written for Payload's blocks data, so `RenderLayout` and the canvas can
 * render it. The component gets `{ id, blockType, blockName, ...fields }` as before, so it keeps
 * working unchanged.
 *
 * Slots: each slot arrives under its field name as a nested array of Payload-shaped blocks, so a
 * component that renders its children itself (with its own `RenderBlocks`) still works. The
 * canvas can then select the block itself, but not the children it renders: they carry no block
 * ids. Edit them in the outline and the inspector. To make children editable on the canvas,
 * render the slot with `PayloadSlot` (see there) instead of your own renderer.
 *
 * In the canvas the adapter puts the editor attributes (`data-block-id`) on the component's
 * first element. It adds no element of its own (see `PayloadRoot`). On the site it does the same
 * with a block's motion settings, unless the block has a class wrapper (`className: 'wrap'`),
 * which then carries them in the server HTML.
 *
 * Async components (server components that load data), and `render: 'server'`, render on the
 * server in the canvas, through the canvas server action (`createCanvasServer`).
 */
export function fromPayloadComponent<P extends object>(
  Component: ComponentType<P>,
  options: FromPayloadComponentOptions = {},
): ComponentType<BlockComponentProps> {
  const blocks = options.blocks ?? []
  const mapProps = options.props
  function PayloadBlock({ block, props, className, slots, attributes, slotAttributes, mode, pageData }: BlockComponentProps): ReactNode {
    const def = getBlockDefinition(blocks, block.type)
    const data: Record<string, unknown> = { ...withFieldDefaults(props, def?.fields ?? []) }
    for (const name of new Set([...Object.keys(def?.slots ?? {}), ...Object.keys(slots)])) {
      data[name] = (block.slots?.[name] ?? []).filter((child) => !child.hidden).map((child) => toPayloadBlock(child, blocks))
    }
    const builder: PayloadBuilderProps = { mode, attributes, slots, slotAttributes, ...(className ? { className } : {}) }
    const payloadBlock: PayloadBlockData = {
      ...data,
      id: block.id,
      blockType: def ? payloadSlugOf(def) : block.type,
      ...(block.label ? { blockName: block.label } : {}),
    }
    const payloadProps = (mapProps ? mapProps(payloadBlock, pageData ?? EMPTY_PAGE_DATA, builder) : { ...payloadBlock, builder }) as P
    let node: ReactNode = <Component {...payloadProps} />
    const wrap = Boolean(className && options.className !== 'prop')
    // On the site the attributes hold only motion settings (`data-motion`). They go on the class
    // wrapper when there is one, so they are in the server HTML; otherwise PayloadRoot puts them
    // on the component's first element after hydration.
    const site = mode === 'site' && Object.keys(attributes).length > 0
    if (wrap) node = <div className={className} {...(site ? attributes : {})}>{node}</div>
    if ((mode === 'canvas' && attributes['data-block-id']) || (site && !wrap)) {
      node = (
        <PayloadRoot attributes={attributes} label={def?.label ?? block.type} placeholder={mode === 'canvas'}>
          {node}
        </PayloadRoot>
      )
    }
    return node
  }
  PayloadBlock.displayName = `Payload(${Component.displayName ?? Component.name ?? 'Block'})`
  withPageData(PayloadBlock)
  if (options.render === 'server' || isAsyncComponent(Component)) renderOnServer(PayloadBlock)
  return PayloadBlock
}

/**
 * Any component of any props type: a function component (sync or async) or a class. `never`
 * props accept every props type, and it avoids `ComponentType<never>`, which rejects
 * `ComponentType<P>` because of the class `defaultProps`.
 */
export type AnyPayloadComponent = ((props: never) => ReactNode | Promise<ReactNode>) | (new (props: never, ...rest: never[]) => object)

/**
 * `fromPayloadComponent` for a whole map of components, keyed by Payload slug (your existing
 * `RenderBlocks` map). The keys become the builder types of the blocks made from those slugs.
 */
export function fromPayloadComponents(
  components: Readonly<Record<string, AnyPayloadComponent>>,
  blocks: readonly BlockDefinition[],
  options: Omit<FromPayloadComponentOptions, 'blocks'> = {},
): BlockComponents {
  const out: BlockComponents = {}
  for (const [slug, Component] of Object.entries(components)) {
    const def = blocks.find((b) => b.payload?.slug === slug) ?? getBlockDefinition(blocks, slug)
    out[def?.type ?? slug] = fromPayloadComponent(Component as unknown as ComponentType<object>, { ...options, blocks })
  }
  return out
}

type PayloadSlotProps = {
  /** The component's `builder` prop. Without it (your old renderer), `children` render instead. */
  readonly builder?: PayloadBuilderProps
  /** The slot: the name of the nested blocks field, e.g. "content". */
  readonly name: string
  /** The element that holds the children. Default "div". */
  readonly as?: ElementType
  readonly className?: string
  /** What renders outside the builder: usually your old `<RenderBlocks blocks={content} />`. */
  readonly children?: ReactNode
}

/**
 * Renders a slot of a Payload-shaped component with the builder, so its children can be
 * selected, dragged and dropped on the canvas. Outside the builder (no `builder` prop) it
 * renders `children`, so the component still works with your old renderer:
 *
 * ```tsx
 * <PayloadSlot builder={builder} name="content" className="space-y-8">
 *   <RenderLeaves blocks={content} />
 * </PayloadSlot>
 * ```
 *
 * The children render with the components registered for their types, so register your leaf
 * components with `fromPayloadComponents` too.
 */
export function PayloadSlot({ builder, name, as: As = 'div', className, children }: PayloadSlotProps): ReactNode {
  if (!builder) return children ?? null
  return (
    <As className={className} {...builder.slotAttributes[name]}>
      {builder.slots[name]}
    </As>
  )
}

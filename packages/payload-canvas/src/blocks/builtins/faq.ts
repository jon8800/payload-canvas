import {
  COLLECTION_LIST_BLOCK,
  FIELD_BLOCK,
  FIELD_VALUE_PROP,
  isRichText,
  LIST_ITEM_SLOT,
  LIST_ITEMS_PROP,
  listItemContext,
  REPEAT_BLOCK,
  repeatRowContext,
  resolveBindings,
  richTextToPlain,
} from '../../core/bindings'
import { normalizeLayout } from '../../core/tree'
import type { Block, BlockDefinition, TemplateContext } from '../../core/types'
import { ACCORDION_BLOCK, DISCLOSURE_BLOCK } from './disclosure'

export type FaqItem = { question: string; answer: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** The item design of a collection list or repeat, once per loaded document or row, with its values bound. */
function expanded(block: Block, blocks: readonly BlockDefinition[]): Block[] {
  const rows = block.props?.[LIST_ITEMS_PROP]
  const item = block.slots?.[LIST_ITEM_SLOT] ?? []
  if (!Array.isArray(rows) || item.length === 0) return []
  const collection = typeof block.props?.collection === 'string' ? block.props.collection : ''
  return rows.flatMap((row, index) => {
    const context: TemplateContext =
      block.type === REPEAT_BLOCK ? repeatRowContext(row, index, null, collection) : listItemContext(isRecord(row) ? row : {}, index, null, collection)
    return resolveBindings({ version: 1, blocks: item }, context, blocks).blocks
  })
}

/** Every block in order, list and repeat items expanded. Hidden blocks and their children are skipped. */
function* walk(list: Block[], blocks: readonly BlockDefinition[]): Generator<Block> {
  for (const block of list) {
    if (block.hidden) continue
    yield block
    if (block.type === REPEAT_BLOCK || block.type === COLLECTION_LIST_BLOCK) {
      yield* walk(expanded(block, blocks), blocks)
      continue
    }
    for (const children of Object.values(block.slots ?? {})) yield* walk(children, blocks)
  }
}

/** The readable text of blocks: text props, rich text and Field block values. */
function plainText(list: Block[], blocks: readonly BlockDefinition[]): string {
  const parts: string[] = []
  for (const block of walk(list, blocks)) {
    const props = block.props ?? {}
    if (typeof props.text === 'string') parts.push(props.text)
    if (isRichText(props.content)) parts.push(richTextToPlain(props.content))
    if (block.type !== FIELD_BLOCK) continue
    const value = props[FIELD_VALUE_PROP]
    if (typeof value === 'string' || typeof value === 'number') parts.push(String(value))
    else if (isRichText(value)) parts.push(richTextToPlain(value))
  }
  return parts.map((part) => part.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ')
}

/**
 * The questions and answers of a layout's accordions with "FAQ for search engines" on: the summary
 * text of each disclosure is the question, the content text the answer. Call it after
 * `loadLayoutData`, so bound props, Field blocks, collection lists and repeats hold the document's
 * values. `blocks` is the site's block list (it types bound values). Hidden blocks count as absent.
 */
export function faqItems(layout: unknown, blocks: readonly BlockDefinition[] = []): FaqItem[] {
  const items: FaqItem[] = []
  for (const block of walk(normalizeLayout(layout).blocks, blocks)) {
    if (block.type !== ACCORDION_BLOCK || block.props?.faqSchema === false) continue
    for (const item of walk(block.slots?.items ?? [], blocks)) {
      if (item.type !== DISCLOSURE_BLOCK) continue
      const question = plainText(item.slots?.summary ?? [], blocks)
      const answer = plainText(item.slots?.content ?? [], blocks)
      if (question && answer) items.push({ question, answer })
    }
  }
  return items
}

/**
 * FAQPage JSON-LD for the items, or null when there are none. Escape it for a `<script>` tag
 * (`JSON.stringify(...).replace(/</g, '\\u003c')`).
 */
export function faqJsonLd(items: readonly FaqItem[]): Record<string, unknown> | null {
  if (items.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

// Names for blocks in the outline, the breadcrumbs, the inspector and the publish problems.
// Pure functions: the type label comes from the caller (the block definition's `label`).

import { FORM_BLOCK, isFormFieldType } from '../../forms/pageForms'
import { iconLabel } from '../../blocks/builtins/icon'
import { SECTION_REF_BLOCK } from '../../blocks/builtins/sectionRef'
import { readsComponent } from '../../core/components'
import type { Block } from '../../core/types'
import { FIELD_BLOCK, LIST_BLOCK } from './templates/binding'

/** Longest preview text, in characters. The row cuts it with an ellipsis anyway. */
const PREVIEW_MAX = 80

/** Block types whose text names a container only when nothing else inside has text. */
const CHROME_TYPES = new Set(['menu', 'button', 'icon'])

/** HTML tags of a Stack that read better as a name than "Stack". */
const TAG_NAMES: Record<string, string> = {
  section: 'Section',
  header: 'Header',
  footer: 'Footer',
  nav: 'Navigation',
  article: 'Article',
  aside: 'Aside',
  main: 'Main',
}

export function childrenOf(block: Block): Block[] {
  return Object.values(block.slots ?? {}).flat()
}

/**
 * The `data-component` attribute for a component (a live saved section copy). The editor draws
 * components in their own color (`--be-component`) on the canvas and in Layers.
 */
export function componentMark(block: Block | null | undefined): { 'data-component'?: '' } {
  return isComponent(block) ? { 'data-component': '' } : {}
}

/** True for a component: a live saved section copy (`sectionRef`). */
export function isComponent(block: Block | null | undefined): boolean {
  return block?.type === SECTION_REF_BLOCK
}

/** The name the user gave the block, or null. */
export function customLabel(block: Block): string | null {
  const label = block.label?.trim()
  return label || null
}

/** Text of a Lexical node and everything inside it (links and formatted runs included). */
function lexicalInline(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const { text, children } = node as { text?: unknown; children?: unknown }
  if (typeof text === 'string') return text
  return Array.isArray(children) ? children.map(lexicalInline).join('') : ''
}

/** The first paragraph (or heading, list item…) with text in Lexical rich text JSON, links included. */
function lexicalText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const { root, children } = node as { root?: unknown; children?: unknown }
  if (root) return lexicalText(root)
  if (!Array.isArray(children)) return lexicalInline(node)
  // Block-level children (paragraphs, lists): the first one with text.
  const blocks = children.filter((child) => child && typeof child === 'object' && Array.isArray((child as { children?: unknown }).children))
  if (blocks.length === 0) return lexicalInline(node)
  for (const child of blocks) {
    const nested = (child as { children: unknown[] }).children
    // A list holds list items, which hold the text.
    const text = nested.some((n) => n && typeof n === 'object' && (n as { type?: unknown }).type === 'listitem') ? lexicalText(child) : lexicalInline(child)
    if (text.trim()) return text.replace(/\s+/g, ' ')
  }
  return ''
}

function linkText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const { url } = value as { url?: unknown }
  return typeof url === 'string' ? url : ''
}

/**
 * Bound blocks show the field they read: `{title}`. A component's properties do not count: the
 * block shows its own content, the default of every copy.
 */
function boundPreview(block: Block): string {
  const first = Object.values(block.bindings ?? {}).find((binding) => !readsComponent(binding))
  return first ? `{${first}}` : ''
}

const clip = (text: string) => (text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text)

/** The first heading inside a container, else its first text. Depth first. */
export function innerTitle(block: Block): string {
  const all: Block[] = []
  const visit = (list: Block[]) => {
    for (const child of list) {
      all.push(child)
      visit(childrenOf(child))
    }
  }
  visit(childrenOf(block))
  const heading = all.find((b) => b.type === 'heading' && typeof b.props?.text === 'string' && b.props.text.trim())
  if (heading) return clip(String(heading.props?.text).trim())
  // Menus and buttons name a container last: "Stack Main" (a menu's name) says little about a hero.
  const leaves = all.filter((child) => childrenOf(child).length === 0)
  for (const child of [...leaves.filter((b) => !CHROME_TYPES.has(b.type)), ...leaves.filter((b) => CHROME_TYPES.has(b.type))]) {
    const text = ownPreview(child)
    if (text) return text
  }
  return ''
}

/** A short text from the block's own content. Containers give their first heading inside. */
function ownPreview(block: Block): string {
  const props = block.props ?? {}
  const str = (key: string) => (typeof props[key] === 'string' ? (props[key] as string).trim() : '')
  const bound = boundPreview(block)
  if (bound) return bound
  switch (block.type) {
    case FIELD_BLOCK:
      return str('path') ? `{${str('path')}}` : ''
    case LIST_BLOCK:
      return str('collection')
    case 'richText':
      return clip(lexicalText(props.content).trim())
    case 'list': {
      // Items are listItem blocks; old lists kept them in `props.items`.
      const items = Array.isArray(props.items) ? (props.items as { text?: unknown }[]) : (block.slots?.items ?? []).map((item) => item.props ?? {})
      const first = items.find((item) => typeof item?.text === 'string' && item.text !== '')
      return first ? `${clip(String(first.text))}${items.length > 1 ? ` +${items.length - 1}` : ''}` : ''
    }
    case 'link':
      return innerTitle(block) || linkText(props.link)
    case 'video':
      return str('url')
    case 'icon':
      // The label for screen readers, else the icon's name ("arrowRight" -> "arrow right").
      return clip(str('label') || iconLabel(str('name')))
    default:
      // A form field shows its name: the key its answers are stored under. A form shows its title.
      if (isFormFieldType(block.type)) return clip(str('name') || str('label'))
      if (block.type === FORM_BLOCK) return clip(str('title'))
      if (childrenOf(block).length > 0) return innerTitle(block)
      return clip(str('text') || str('label') || str('quote') || str('title') || str('alt'))
  }
}

/** The text shown after the type name in an outline row. Empty when the block has a custom label. */
export function blockPreview(block: Block): string {
  if (customLabel(block)) return ''
  return ownPreview(block)
}

/** "Section" for a Stack rendered as `<section>`, else the type label. */
export function typeName(block: Block, typeLabel: string): string {
  const as = block.props?.as
  if (block.type === 'stack' && typeof as === 'string' && TAG_NAMES[as]) return TAG_NAMES[as]
  return typeLabel
}

/** The main name of a block: its custom label, else its type name. */
export function blockName(block: Block, typeLabel: string): string {
  return customLabel(block) ?? typeName(block, typeLabel)
}

/**
 * One line that tells blocks apart: the custom label, or "Section · Why teams choose us", or
 * "Heading · Our services", or just "Divider".
 */
export function blockSummary(block: Block, typeLabel: string): string {
  const label = customLabel(block)
  if (label) return label
  const preview = ownPreview(block)
  const name = typeName(block, typeLabel)
  return preview ? `${name} · ${preview}` : name
}

// Pure helpers for inline text editing on the canvas: which field a prop path points at, whether
// it is bound to document data, the text an edited element holds, and the layout with one prop
// held still while it is edited. No DOM globals, so the tests run in Node.

import type { Block, BlockDefinition, Layout } from '@payload-toolkit/builder/core'
import type { InlineKind } from '@payload-toolkit/builder/protocol'

type LooseField = { type?: unknown; name?: unknown; fields?: unknown; tabs?: unknown }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Fields that hold data under their own name. Rows, collapsibles, unnamed groups and unnamed tabs are flattened. */
function namedFields(fields: unknown): LooseField[] {
  if (!Array.isArray(fields)) return []
  const out: LooseField[] = []
  for (const field of fields as unknown[]) {
    if (!isObject(field)) continue
    const named = typeof field.name === 'string' && field.name !== ''
    if (field.type === 'tabs' && Array.isArray(field.tabs)) {
      for (const tab of field.tabs as unknown[]) {
        if (!isObject(tab)) continue
        if (typeof tab.name === 'string' && tab.name) out.push({ type: 'group', name: tab.name, fields: tab.fields })
        else out.push(...namedFields(tab.fields))
      }
      continue
    }
    if (!named && (field.type === 'row' || field.type === 'collapsible' || field.type === 'group')) {
      out.push(...namedFields(field.fields))
      continue
    }
    if (named) out.push(field)
  }
  return out
}

/** The field a prop path points at ("text", "items.2.text"), or null. Number segments step into array rows. */
export function fieldAtPath(fields: unknown, path: string): LooseField | null {
  let list = fields
  let found: LooseField | null = null
  for (const segment of path.split('.')) {
    if (/^\d+$/.test(segment)) {
      if (found?.type !== 'array') return null
      continue
    }
    found = namedFields(list).find((field) => field.name === segment) ?? null
    if (!found) return null
    list = found.fields
  }
  return found
}

/**
 * How a prop is edited on the canvas: `line` (text field), `lines` (textarea), `rich` (richText),
 * or null when it cannot be edited there. Without a block definition, a string value counts as one line.
 */
export function inlineKind(definition: BlockDefinition | undefined, path: string, value: unknown): InlineKind | null {
  if (!definition) return typeof value === 'string' ? 'line' : null
  const field = fieldAtPath(definition.fields, path)
  if (field?.type === 'text') return 'line'
  if (field?.type === 'textarea') return 'lines'
  if (field?.type === 'richText') return 'rich'
  return null
}

/** The value at a prop path, or undefined. */
export function valueAtPath(props: Record<string, unknown> | undefined, path: string): unknown {
  let current: unknown = props
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)]
    else if (isObject(current) && !Array.isArray(current)) current = current[segment]
    else return undefined
  }
  return current
}

/**
 * The document field that feeds this prop path, or null. Bindings are keyed by prop path, so a
 * binding on "items" also covers "items.2.text".
 */
export function bindingFor(block: Pick<Block, 'bindings'>, path: string): string | null {
  const bindings = block.bindings
  if (!bindings) return null
  const segments = path.split('.')
  for (let i = segments.length; i > 0; i--) {
    const field = bindings[segments.slice(0, i).join('.')]
    if (typeof field === 'string' && field) return field
  }
  return null
}

function mapBlocks(blocks: Block[], id: string, fn: (block: Block) => Block): Block[] | null {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.id === id) {
      const next = blocks.slice()
      next[i] = fn(block)
      return next
    }
    for (const [slot, children] of Object.entries(block.slots ?? {})) {
      const mapped = mapBlocks(children, id, fn)
      if (!mapped) continue
      const next = blocks.slice()
      next[i] = { ...block, slots: { ...block.slots, [slot]: mapped } }
      return next
    }
  }
  return null
}

/**
 * A copy of `layout` where block `id` has `props[key] = value`. Returns `layout` itself when the
 * block is not there. The canvas renders an edited prop with its value from the start of editing,
 * so React never touches the element the user types in.
 */
export function withPropValue(layout: Layout, id: string, key: string, value: unknown): Layout {
  const blocks = mapBlocks(layout.blocks, id, (block) => ({ ...block, props: { ...block.props, [key]: value } }))
  return blocks ? { ...layout, blocks } : layout
}

/** The parts of a DOM node `readText` needs. */
export type TextNodeLike = {
  nodeType: number
  nodeName: string
  nodeValue: string | null
  childNodes: ArrayLike<TextNodeLike>
}

const TEXT_NODE = 3
const ELEMENT_NODE = 1
/** Elements a browser may insert for a new line while editing. */
const LINE_ELEMENTS = new Set(['DIV', 'P'])

/**
 * The text an edited element holds. `<br>` and line elements a browser inserted (`<div>`, `<p>`)
 * become "\n". A `<br>` at the very end only makes an empty last line visible, so it is dropped.
 * Non-breaking spaces become normal spaces. With `multiline: false`, line breaks become spaces.
 */
export function readText(root: TextNodeLike, multiline: boolean): string {
  let out = ''
  let trailingBreak = false
  const walk = (node: TextNodeLike) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]
      if (child.nodeType === TEXT_NODE) {
        const text = child.nodeValue ?? ''
        if (text) trailingBreak = false
        out += text
      } else if (child.nodeName === 'BR') {
        out += '\n'
        trailingBreak = true
      } else if (child.nodeType === ELEMENT_NODE) {
        if (LINE_ELEMENTS.has(child.nodeName) && out !== '' && !out.endsWith('\n')) out += '\n'
        walk(child)
      }
    }
  }
  walk(root)
  if (trailingBreak && out.endsWith('\n')) out = out.slice(0, -1)
  out = out.replaceAll(' ', ' ')
  return multiline ? out.replaceAll('\r\n', '\n') : singleLine(out)
}

/** Line breaks (and the spaces around them) become one space. */
export function singleLine(text: string): string {
  return text.replace(/[ \t]*\r?\n[ \t]*/g, ' ')
}

// Lexical nodes for the canvas rich text editor that write the same JSON as Payload's editor.
// Payload's link and autolink nodes are ported here (Payload is MIT licensed) instead of imported:
// they live in `@payloadcms/richtext-lexical/client`, which would pull the whole admin editor
// into the canvas. Headings, quotes and lists are the stock @lexical nodes, as in Payload.
// Any other node (upload, relationship, block, horizontal rule, …) gets a pass-through node that
// shows a label and writes its JSON back unchanged.

import {
  $applyNodeReplacement,
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  DecoratorNode,
  ElementNode,
  type BaseSelection,
  type EditorConfig,
  type Klass,
  type LexicalNode,
  type NodeKey,
  type RangeSelection,
  type SerializedElementNode,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'

export type LinkFields = {
  linkType?: 'custom' | 'internal'
  url?: string
  newTab?: boolean
  doc?: { relationTo: string; value: unknown } | null
  [key: string]: unknown
}

export type SerializedLinkNode = Spread<{ fields: LinkFields; id?: string; type: string; version: number }, SerializedElementNode>

const SUPPORTED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'sms:', 'tel:'])

/** A 24 character hex id, like the ObjectID Payload gives new links. */
export function newLinkId(): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function sanitizeUrl(url: string): string {
  try {
    if (!SUPPORTED_URL_PROTOCOLS.has(new URL(url).protocol)) return 'about:blank'
  } catch {
    return url.startsWith('/') || url.startsWith('#') ? url : 'https://'
  }
  return url
}

/** Payload's link node: `{ type: 'link', fields: { linkType, url | doc, newTab }, id, version: 3 }`. */
export class LinkNode extends ElementNode {
  __fields: LinkFields
  __id: string | undefined

  static getType(): string {
    return 'link'
  }

  static clone(node: LinkNode): LinkNode {
    return new LinkNode(node.__fields, node.__id, node.__key)
  }

  constructor(fields: LinkFields = { linkType: 'custom', newTab: false }, id?: string, key?: NodeKey) {
    super(key)
    this.__fields = fields
    this.__id = id
  }

  static importJSON(serialized: SerializedLinkNode): LinkNode {
    migrateLink(serialized)
    return $createLinkNode({}).updateFromJSON(serialized)
  }

  updateFromJSON(serialized: SerializedLinkNode): this {
    return super.updateFromJSON(serialized).setFields(serialized.fields).setID(serialized.id)
  }

  exportJSON(): SerializedLinkNode {
    const fields = { ...this.getFields() }
    if (fields.linkType === 'internal') delete fields.url
    else if (fields.linkType === 'custom') delete fields.doc
    const json: SerializedLinkNode = { ...super.exportJSON(), type: 'link', fields, version: 3 }
    const id = this.getID()
    if (id) json.id = id
    return json
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const a = document.createElement('a')
    if (this.__fields.linkType === 'custom') a.href = sanitizeUrl(this.__fields.url ?? '')
    if (this.__fields.newTab) {
      a.target = '_blank'
      a.rel = 'noopener'
    }
    return a
  }

  updateDOM(prev: LinkNode, a: HTMLAnchorElement): boolean {
    const { url, newTab, linkType } = this.__fields
    if (linkType === 'custom' && url != null && url !== prev.__fields.url) a.href = sanitizeUrl(url)
    if (linkType === 'internal') a.removeAttribute('href')
    if (newTab !== prev.__fields.newTab) {
      if (newTab) {
        a.target = '_blank'
        a.rel = 'noopener'
      } else {
        a.removeAttribute('target')
        a.removeAttribute('rel')
      }
    }
    return false
  }

  getFields(): LinkFields {
    return this.getLatest().__fields
  }

  getID(): string | undefined {
    return this.getLatest().__id
  }

  setFields(fields: LinkFields): this {
    const writable = this.getWritable()
    writable.__fields = fields
    return writable
  }

  setID(id: string | undefined): this {
    const writable = this.getWritable()
    writable.__id = id
    return writable
  }

  insertNewAfter(selection: RangeSelection, restoreSelection = true): ElementNode | null {
    const element = this.getParentOrThrow().insertNewAfter(selection, restoreSelection)
    if (!$isElementNode(element)) return null
    const link = $createLinkNode({ fields: this.__fields })
    element.append(link)
    return link
  }

  canInsertTextBefore(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }

  canBeEmpty(): false {
    return false
  }

  isInline(): true {
    return true
  }

  extractWithChild(_child: LexicalNode, selection: BaseSelection): boolean {
    if (!$isRangeSelection(selection)) return false
    return (
      this.isParentOf(selection.anchor.getNode()) &&
      this.isParentOf(selection.focus.getNode()) &&
      selection.getTextContent().length > 0
    )
  }
}

/** Payload's older link versions, upgraded as Payload's own importJSON does. */
function migrateLink(serialized: SerializedLinkNode) {
  const doc = serialized.fields?.doc as { value?: unknown } | null | undefined
  const value = doc?.value as { id?: unknown } | undefined
  if (serialized.version === 1 && doc && typeof value === 'object' && value?.id) {
    doc.value = value.id
    serialized.version = 2
  }
  if (serialized.type === 'link' && serialized.version === 2 && !serialized.id) {
    serialized.id = newLinkId()
    serialized.version = 3
  }
}

/** Payload's autolink node (a URL typed in the text). Same fields, `type: 'autolink'`, no id. */
export class AutoLinkNode extends LinkNode {
  static getType(): string {
    return 'autolink'
  }

  static clone(node: AutoLinkNode): AutoLinkNode {
    return new AutoLinkNode(node.__fields, undefined, node.__key)
  }

  static importJSON(serialized: SerializedLinkNode): AutoLinkNode {
    migrateLink(serialized)
    return $applyNodeReplacement(new AutoLinkNode({})).updateFromJSON(serialized)
  }

  exportJSON(): SerializedLinkNode {
    const json = super.exportJSON()
    return {
      type: 'autolink',
      children: json.children,
      direction: json.direction,
      fields: json.fields,
      format: json.format,
      indent: json.indent,
      version: 2,
    }
  }
}

export function $createLinkNode({ id, fields }: { id?: string; fields?: LinkFields }): LinkNode {
  return $applyNodeReplacement(new LinkNode(fields, id ?? newLinkId()))
}

export function $isLinkNode(node: LexicalNode | null | undefined): node is LinkNode {
  return node instanceof LinkNode
}

function $linkAncestor(node: LexicalNode): LinkNode | null {
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    if ($isLinkNode(parent)) return parent
  }
  return null
}

/** The link around a node (or the node itself), or null. */
export function $findLink(node: LexicalNode): LinkNode | null {
  return $isLinkNode(node) ? node : $linkAncestor(node)
}

/**
 * Links the selected text (`fields`), updates the link around it, or removes links (`null`).
 * Ported from Payload's `$toggleLink`.
 */
export function $toggleLink(fields: LinkFields | null) {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const nodes = selection.extract()
  if (fields === null) {
    for (const node of nodes) {
      const parent = node.getParent()
      if (!$isLinkNode(parent)) continue
      for (const child of parent.getChildren()) parent.insertBefore(child)
      parent.remove()
    }
    return
  }
  if (nodes.length === 1) {
    const link = $findLink(nodes[0])
    if (link) {
      link.setFields(fields)
      return
    }
  }
  let prevParent: ElementNode | null = null
  let link: LinkNode | null = null
  for (const node of nodes) {
    const parent = node.getParent()
    if (parent === link || parent === null || ($isElementNode(node) && !node.isInline())) continue
    if ($isLinkNode(parent)) {
      link = parent
      parent.setFields(fields)
      continue
    }
    if (!parent.is(prevParent)) {
      prevParent = parent
      link = $createLinkNode({ fields })
      node.insertBefore(link)
    }
    if ($isLinkNode(node)) {
      if (node.is(link)) continue
      if (link) link.append(...node.getChildren())
      node.remove()
      continue
    }
    if (link) link.append(node)
  }
}

/** Inserts `text` linked to `fields` at the caret and selects it. */
export function $insertLinkedText(text: string, fields: LinkFields) {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const link = $createLinkNode({ fields })
  const textNode = $createTextNode(text)
  link.append(textNode)
  selection.insertNodes([link])
  textNode.select(0, text.length)
}

// ---------------------------------------------------------------------------
// Pass-through nodes
// ---------------------------------------------------------------------------

/** Node types the canvas editor edits itself. Everything else passes through unchanged. */
export const KNOWN_TYPES = new Set(['root', 'paragraph', 'text', 'linebreak', 'tab', 'heading', 'quote', 'list', 'listitem', 'link', 'autolink'])

const LABELS: Record<string, string> = {
  upload: 'Image or file',
  relationship: 'Linked document',
  block: 'Block',
  inlineBlock: 'Inline block',
}

type JsonNode = { type?: unknown; children?: unknown }

/** Unknown node types in Lexical JSON, with whether each sits inside text (inline) or on its own. */
export function unknownTypes(value: unknown): Map<string, boolean> {
  const found = new Map<string, boolean>()
  const walk = (node: JsonNode, parentType: string | null) => {
    const type = typeof node.type === 'string' ? node.type : null
    if (type && !KNOWN_TYPES.has(type)) {
      const inline = parentType !== null && parentType !== 'root'
      found.set(type, (found.get(type) ?? false) || inline)
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children as unknown[]) {
        if (typeof child === 'object' && child !== null) walk(child as JsonNode, type)
      }
    }
  }
  const root = (value as { root?: unknown } | null)?.root
  if (typeof root === 'object' && root !== null) walk(root as JsonNode, null)
  return found
}

/**
 * A node class for one unknown type: it keeps the node's JSON as it is and shows a label
 * ("Image or file") in the editor. A horizontal rule shows as a rule.
 */
export function passThroughNode(type: string, inline: boolean): Klass<LexicalNode> {
  class PassThroughNode extends DecoratorNode<null> {
    __json: SerializedLexicalNode

    static getType(): string {
      return type
    }

    static clone(node: PassThroughNode): PassThroughNode {
      return new PassThroughNode(node.__json, node.__key)
    }

    static importJSON(json: SerializedLexicalNode): PassThroughNode {
      return new PassThroughNode(json)
    }

    constructor(json: SerializedLexicalNode, key?: NodeKey) {
      super(key)
      this.__json = json
    }

    exportJSON(): SerializedLexicalNode {
      return this.__json
    }

    createDOM(): HTMLElement {
      if (type === 'horizontalrule') return document.createElement('hr')
      const el = document.createElement(inline ? 'span' : 'div')
      el.setAttribute('data-builder-passthrough', '')
      el.textContent = `${LABELS[type] ?? type} · edit in the inspector`
      return el
    }

    updateDOM(): false {
      return false
    }

    decorate(): null {
      return null
    }

    isInline(): boolean {
      return inline
    }
  }
  return PassThroughNode
}

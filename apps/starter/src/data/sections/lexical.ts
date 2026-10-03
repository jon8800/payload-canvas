// Builds Lexical rich text JSON for the richText block and form messages.

type TextNode = { type: 'text'; text: string; format: number; detail: 0; mode: 'normal'; style: ''; version: 1 }
type ElementBase = { direction: 'ltr'; format: ''; indent: 0; version: 1 }
type ParagraphNode = ElementBase & { type: 'paragraph'; children: TextNode[]; textFormat: 0; textStyle: '' }
type HeadingNode = ElementBase & { type: 'heading'; tag: 'h2' | 'h3'; children: TextNode[] }
type ListItemNode = ElementBase & { type: 'listitem'; value: number; children: TextNode[] }
type ListNode = ElementBase & { type: 'list'; listType: 'bullet' | 'number'; tag: 'ul' | 'ol'; start: 1; children: ListItemNode[] }
type RootChild = ParagraphNode | HeadingNode | ListNode

/** A paragraph (string), a heading, or a bullet list. */
export type RichTextInput = string | { h2: string } | { h3: string } | { ul: string[] }

const element: ElementBase = { direction: 'ltr', format: '', indent: 0, version: 1 }

function textNode(value: string): TextNode {
  return { type: 'text', text: value, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }
}

function toNode(input: RichTextInput): RootChild {
  if (typeof input === 'string') {
    return { ...element, type: 'paragraph', children: [textNode(input)], textFormat: 0, textStyle: '' }
  }
  if ('h2' in input) return { ...element, type: 'heading', tag: 'h2', children: [textNode(input.h2)] }
  if ('h3' in input) return { ...element, type: 'heading', tag: 'h3', children: [textNode(input.h3)] }
  return {
    ...element,
    type: 'list',
    listType: 'bullet',
    tag: 'ul',
    start: 1,
    children: input.ul.map((item, i) => ({ ...element, type: 'listitem', value: i + 1, children: [textNode(item)] })),
  }
}

export function lexical(content: RichTextInput[]) {
  return { root: { ...element, type: 'root', children: content.map(toNode) } }
}

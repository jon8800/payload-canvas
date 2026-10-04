import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { $getRoot, $getSelection, $isElementNode, $isRangeSelection, $isTextNode, type LexicalEditor, type LexicalNode, type RangeSelection } from 'lexical'

import { $formatState, createRichEditor, loadValue, registerCommands, runCommand } from './editor'
import { $toggleLink, unknownTypes } from './nodes'

const text = (value: string, format = 0) => ({ detail: 0, format, mode: 'normal', style: '', text: value, type: 'text', version: 1 })
const paragraph = (...children: unknown[]) => ({
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  type: 'paragraph',
  version: 1,
  textFormat: 0,
  textStyle: '',
})

/** Lexical JSON as Payload's admin editor saves it, with every node type it may hold. */
const PAYLOAD_STATE = {
  root: {
    children: [
      { children: [text('Title')], direction: 'ltr', format: '', indent: 0, type: 'heading', version: 1, tag: 'h2' },
      paragraph(
        text('Plain '),
        text('bold', 1),
        text(' and '),
        {
          children: [text('a link')],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'link',
          version: 3,
          fields: { linkType: 'custom', newTab: true, url: 'https://example.com' },
          id: '6650a1b2c3d4e5f6a7b8c9d0',
        },
        {
          children: [text('internal')],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'link',
          version: 3,
          fields: { linkType: 'internal', newTab: false, doc: { relationTo: 'pages', value: 4 } },
          id: '6650a1b2c3d4e5f6a7b8c9d1',
        },
      ),
      {
        children: [
          { children: [text('One')], direction: 'ltr', format: '', indent: 0, type: 'listitem', version: 1, value: 1 },
          { children: [text('Two')], direction: 'ltr', format: '', indent: 0, type: 'listitem', version: 1, value: 2 },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'list',
        version: 1,
        listType: 'bullet',
        start: 1,
        tag: 'ul',
      },
      { children: [text('Said')], direction: 'ltr', format: '', indent: 0, type: 'quote', version: 1 },
      { type: 'upload', version: 3, format: '', id: '6650a1b2c3d4e5f6a7b8c9d2', fields: null, relationTo: 'media', value: 7 },
      { type: 'horizontalrule', version: 1 },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
}

const load = (value: unknown): LexicalEditor => {
  const editor = createRichEditor(value, (error) => {
    throw error
  })
  assert.equal(loadValue(editor, value), true)
  registerCommands(editor)
  return editor
}

/** The saved JSON, as it reaches the server (`undefined` values dropped). */
const json = (editor: LexicalEditor) => JSON.parse(JSON.stringify(editor.getEditorState().toJSON())) as typeof PAYLOAD_STATE

/**
 * Finds the first text node with `value` and selects `start`..`end` of it. Returns the selection,
 * as the canvas keeps it for toolbar commands (a headless editor does not carry it into the next update).
 */
function select(editor: LexicalEditor, value: string, start: number, end: number): RangeSelection {
  editor.update(
    () => {
      const find = (node: LexicalNode): LexicalNode | null => {
        if ($isTextNode(node) && node.getTextContent() === value) return node
        if (!$isElementNode(node)) return null
        for (const child of node.getChildren()) {
          const found = find(child)
          if (found) return found
        }
        return null
      }
      const node = find($getRoot())
      if (!$isTextNode(node)) throw new Error(`no text "${value}"`)
      node.select(start, end)
    },
    { discrete: true },
  )
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) throw new Error('no selection')
    return selection.clone()
  })
}

describe('rich text round trip', () => {
  test('Payload JSON loads and saves unchanged, unknown nodes included', () => {
    assert.deepEqual(json(load(PAYLOAD_STATE)), PAYLOAD_STATE)
  })

  test('unknown node types pass through and know whether they sit inside text', () => {
    assert.deepEqual([...unknownTypes(PAYLOAD_STATE)], [['upload', false], ['horizontalrule', false]])
    const inline = { root: { type: 'root', children: [paragraph(text('a'), { type: 'inlineBlock', version: 1, fields: { id: 'x', blockType: 'b' } })] } }
    assert.deepEqual([...unknownTypes(inline)], [['inlineBlock', true]])
  })

  test('an empty value starts with one empty paragraph', () => {
    const state = json(load(null))
    assert.equal(state.root.children.length, 1)
    assert.equal(state.root.children[0].type, 'paragraph')
  })

  test('JSON Lexical cannot read is refused', () => {
    const editor = createRichEditor({ root: { type: 'root', children: [{ type: 'text' }] } }, () => undefined)
    assert.equal(loadValue(editor, { root: { type: 'nope', children: 5 } }), false)
  })
})

describe('rich text commands', () => {
  test('a new link has Payload’s shape: fields, a 24 character id, version 3', () => {
    const editor = load({ root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [paragraph(text('Go here now'))] } })
    select(editor, 'Go here now', 3, 7)
    editor.update(() => $toggleLink({ linkType: 'custom', url: '/contact', newTab: false, doc: null }), { discrete: true })
    const [, link] = (json(editor).root.children[0] as { children: Array<Record<string, unknown>> }).children
    assert.equal(link.type, 'link')
    assert.equal(link.version, 3)
    assert.match(String(link.id), /^[0-9a-f]{24}$/)
    assert.deepEqual(link.fields, { linkType: 'custom', url: '/contact', newTab: false })
    assert.deepEqual((link.children as Array<{ text: string }>).map((c) => c.text), ['here'])
  })

  test('format state shows bold and the link at the caret', () => {
    const editor = load(PAYLOAD_STATE)
    select(editor, 'bold', 0, 4)
    const state = editor.getEditorState().read($formatState)
    assert.deepEqual(state.formats, ['bold'])
    assert.equal(state.block, 'paragraph')
    assert.equal(state.link, null)
    select(editor, 'a link', 0, 2)
    const inLink = editor.getEditorState().read($formatState)
    assert.deepEqual(inLink.link, { url: 'https://example.com', newTab: true, internal: false })
    assert.equal(inLink.collapsed, false)
  })

  test('list commands toggle a bulleted list', () => {
    const editor = load({ root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [paragraph(text('Item'))] } })
    runCommand(editor, { kind: 'block', block: 'bullet' }, select(editor, 'Item', 0, 0))
    const list = json(editor).root.children[0] as { type: string; listType?: string }
    assert.equal(list.type, 'list')
    assert.equal(list.listType, 'bullet')
    runCommand(editor, { kind: 'block', block: 'bullet' }, select(editor, 'Item', 0, 0))
    assert.equal(json(editor).root.children[0].type, 'paragraph')
  })

  test('block commands turn a paragraph into a heading and back', () => {
    const editor = load({ root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [paragraph(text('Hello'))] } })
    const caret = select(editor, 'Hello', 0, 0)
    runCommand(editor, { kind: 'block', block: 'h3' }, caret)
    assert.equal(json(editor).root.children[0].type, 'heading')
    assert.equal((json(editor).root.children[0] as { tag?: string }).tag, 'h3')
    runCommand(editor, { kind: 'block', block: 'h3' }, select(editor, 'Hello', 0, 0))
    assert.equal(json(editor).root.children[0].type, 'paragraph')
  })

  test('format commands toggle bold on the selection', () => {
    const editor = load({ root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [paragraph(text('Hello'))] } })
    runCommand(editor, { kind: 'format', format: 'bold' }, select(editor, 'Hello', 0, 5))
    assert.equal((json(editor).root.children[0] as { children: Array<{ format: number }> }).children[0].format, 1)
  })

  test('unlink removes the link around the caret and keeps its text', () => {
    const editor = load(PAYLOAD_STATE)
    runCommand(editor, { kind: 'unlink' }, select(editor, 'a link', 2, 2))
    const children = (json(editor).root.children[1] as { children: Array<{ type: string; text?: string }> }).children
    assert.equal(JSON.stringify(children).includes('example.com'), false)
    assert.ok(children.some((c) => c.type === 'text' && c.text?.includes('a link')))
    // The internal link next to it stays.
    assert.ok(children.some((c) => c.type === 'link'))
  })
})

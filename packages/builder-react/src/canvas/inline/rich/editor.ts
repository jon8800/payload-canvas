// The canvas rich text editor without the DOM parts: its nodes, loading Payload's Lexical JSON,
// the toolbar state at the caret and the toolbar commands. Tests run it headless.

import { $isHeadingNode, $isQuoteNode, $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode, registerRichText } from '@lexical/rich-text'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
  registerList,
} from '@lexical/list'
import { $setBlocksType } from '@lexical/selection'
import { $getNearestNodeOfType, mergeRegister } from '@lexical/utils'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  createEditor,
  FORMAT_TEXT_COMMAND,
  type EditorThemeClasses,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
  type SerializedEditorState,
} from 'lexical'
import type { RichBlockType, RichCommand, RichFormatState, RichTextFormat } from '@payload-toolkit/builder/protocol'

import { $findLink, $insertLinkedText, $toggleLink, AutoLinkNode, LinkNode, passThroughNode, unknownTypes } from './nodes'

/** Lexical adds these classes for formats that have no tag of their own. The canvas CSS styles them. */
export const THEME: EditorThemeClasses = {
  text: {
    underline: 'builder-lx-underline',
    strikethrough: 'builder-lx-strike',
    underlineStrikethrough: 'builder-lx-underline-strike',
  },
}

const FORMATS: RichTextFormat[] = ['bold', 'italic', 'underline', 'strikethrough', 'code']

export function isRichValue(value: unknown): value is SerializedEditorState {
  const root = (value as { root?: unknown } | null)?.root
  return typeof root === 'object' && root !== null
}

/** The node classes for a value: Payload's standard nodes plus a pass-through node per unknown type. */
export function richNodes(value: unknown): Array<Klass<LexicalNode>> {
  const passThrough = [...unknownTypes(value)].map(([type, inline]) => passThroughNode(type, inline))
  return [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, ...passThrough]
}

export function createRichEditor(value: unknown, onError: (error: Error) => void): LexicalEditor {
  return createEditor({ namespace: 'builder-canvas', nodes: richNodes(value), theme: THEME, onError })
}

/** Registers the editing commands the toolbar uses (formats, lists, paragraphs, paste). Returns the cleanup. */
export function registerCommands(editor: LexicalEditor): () => void {
  return mergeRegister(registerRichText(editor), registerList(editor))
}

/**
 * Loads a stored value (Lexical JSON, or nothing). An empty editor gets one paragraph so the caret
 * has a place. Returns false when the JSON cannot be read.
 */
export function loadValue(editor: LexicalEditor, value: unknown): boolean {
  if (isRichValue(value)) {
    try {
      editor.setEditorState(editor.parseEditorState(value))
    } catch {
      return false
    }
  }
  editor.update(
    () => {
      const root = $getRoot()
      if (root.isEmpty()) root.append($createParagraphNode())
    },
    { discrete: true, tag: 'history-merge' },
  )
  return true
}

/** The toolbar state at the caret. Run inside `editorState.read`. */
export function $formatState(): RichFormatState {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return { formats: [], block: 'other', link: null, collapsed: true }
  const anchor = selection.anchor.getNode()
  let block: RichBlockType = 'other'
  const list = $getNearestNodeOfType(anchor, ListNode)
  if (list) {
    const type = list.getListType()
    block = type === 'number' ? 'number' : type === 'check' ? 'check' : 'bullet'
  } else {
    const top = anchor.getKey() === 'root' ? null : anchor.getTopLevelElement()
    if ($isHeadingNode(top)) block = top.getTag()
    else if ($isQuoteNode(top)) block = 'quote'
    else if ($isParagraphNode(top)) block = 'paragraph'
  }
  const linkNode = $findLink(anchor) ?? $findLink(selection.focus.getNode())
  const fields = linkNode?.getFields()
  // A caret uses the selection's format (it includes a format toggled for the next letters).
  // Selected text has a format when every selected text node has it.
  const texts = selection.isCollapsed() ? [] : selection.getNodes().filter($isTextNode)
  const has = (format: RichTextFormat) =>
    texts.length === 0 ? selection.hasFormat(format) : texts.every((node) => node.hasFormat(format))
  return {
    formats: FORMATS.filter(has),
    block,
    link: fields
      ? { url: typeof fields.url === 'string' ? fields.url : '', newTab: fields.newTab === true, internal: fields.linkType === 'internal' }
      : null,
    collapsed: selection.isCollapsed(),
  }
}

/**
 * Runs a toolbar command in one update. `saved` is the last range selection: the editor uses it
 * when it has none (the focus went to the admin's link form).
 */
export function runCommand(editor: LexicalEditor, command: RichCommand, saved: RangeSelection | null) {
  editor.update(
    () => {
      if (!$isRangeSelection($getSelection()) && saved) {
        try {
          $setSelection(saved.clone())
        } catch {
          $getRoot().selectEnd()
        }
      }
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      switch (command.kind) {
        case 'focus':
          return
        case 'format':
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, command.format)
          return
        case 'block':
          setBlock(editor, command.block)
          return
        case 'link': {
          const fields = { linkType: 'custom' as const, url: command.url, newTab: command.newTab, doc: null }
          const link = $findLink(selection.anchor.getNode())
          if (selection.isCollapsed() && link) link.setFields(fields)
          else if (selection.isCollapsed()) $insertLinkedText(command.url, fields)
          else $toggleLink(fields)
          return
        }
        case 'unlink': {
          const link = $findLink(selection.anchor.getNode())
          if (!selection.isCollapsed() || !link) {
            $toggleLink(null)
            return
          }
          for (const child of link.getChildren()) link.insertBefore(child)
          link.remove()
        }
      }
    },
    { discrete: true },
  )
}

/** Sets the block type of the selected blocks. Choosing the current type again goes back to a paragraph. */
function setBlock(editor: LexicalEditor, block: Extract<RichCommand, { kind: 'block' }>['block']) {
  const current = $formatState().block
  const inList = current === 'bullet' || current === 'number' || current === 'check'
  if (block === 'bullet' || block === 'number') {
    if (current === block) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
    else editor.dispatchCommand(block === 'number' ? INSERT_ORDERED_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND, undefined)
    return
  }
  if (inList) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const target = block === current ? 'paragraph' : block
  $setBlocksType(selection, () =>
    target === 'paragraph' ? $createParagraphNode() : target === 'quote' ? $createQuoteNode() : $createHeadingNode(target),
  )
}

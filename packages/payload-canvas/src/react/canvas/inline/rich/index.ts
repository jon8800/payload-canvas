// Loaded with `import()` when a rich text editing session starts, so Lexical stays out of every
// other bundle (the public site never loads it).

import { createEmptyHistoryState, registerHistory } from '@lexical/history'
import { mergeRegister } from '@lexical/utils'
import { $getSelection, $isRangeSelection, type RangeSelection } from 'lexical'

import { createThrottle, placeCaret, restoreDom, snapshotDom } from '../dom'
import { CHANGE_MS, type InlineSession, type SessionOptions } from '../session'
import { $formatState, createRichEditor, loadValue, registerCommands, runCommand } from './editor'

/** Undo steps inside the session merge typing within this time. */
const HISTORY_DELAY_MS = 300

/**
 * Edits rich text in place: a Lexical editor takes over the block's element (its React children
 * are kept aside and put back at the end). Returns null when the stored JSON cannot be read.
 */
export function startRichSession(el: HTMLElement, value: unknown, options: SessionOptions): InlineSession | null {
  const editor = createRichEditor(value, (error) => console.error('[builder canvas] rich text:', error))
  if (!loadValue(editor, value)) return null

  const snapshot = snapshotDom(el)
  el.replaceChildren()
  el.setAttribute('data-builder-editing', 'rich')
  // Lexical does not make its root editable itself (its React wrapper does).
  el.setAttribute('contenteditable', 'true')
  el.setAttribute('spellcheck', 'true')

  // Before Lexical's own listeners: these keys end editing or open the link form.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return
    const mod = e.ctrlKey || e.metaKey
    const exit = e.key === 'Escape' || (e.key === 'Enter' && mod)
    const link = mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k'
    if (!exit && !link) return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (exit) options.onExit()
    else options.onLinkRequest?.()
  }
  el.addEventListener('keydown', onKeyDown)

  editor.setRootElement(el)
  let sent = JSON.stringify(editor.getEditorState().toJSON())
  let saved: RangeSelection | null = null
  let lastFormat = ''

  const send = () => {
    if (editor.isComposing()) return
    const next = editor.getEditorState().toJSON()
    const json = JSON.stringify(next)
    if (json === sent) return
    sent = json
    options.onChange(next)
  }
  const throttle = createThrottle(send, CHANGE_MS)
  let formatFrame = 0
  const sendFormat = () => {
    formatFrame = 0
    const format = editor.getEditorState().read($formatState)
    const key = JSON.stringify(format)
    if (key === lastFormat) return
    lastFormat = key
    options.onFormat?.(format)
  }

  const unregister = mergeRegister(
    registerCommands(editor),
    registerHistory(editor, createEmptyHistoryState(), HISTORY_DELAY_MS),
    editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) saved = selection.clone()
      })
      if (!formatFrame) formatFrame = requestAnimationFrame(sendFormat)
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
      if (!editor.isComposing()) throttle.schedule()
    }),
  )

  // Lexical skips focusing its root while an update is pending (the first render is), so focus it here.
  el.focus({ preventScroll: true })
  editor.focus(
    () => {
      // Lexical rendered its own DOM: map the double-click point onto it.
      if (options.point) placeCaret(el, options.point)
      sendFormat()
    },
    { defaultSelection: 'rootEnd' },
  )

  return {
    element: el,
    command(command) {
      runCommand(editor, command, saved)
      editor.focus()
    },
    finish() {
      throttle.cancel()
      if (formatFrame) cancelAnimationFrame(formatFrame)
      const final = editor.getEditorState().toJSON()
      const changed = JSON.stringify(final) !== sent
      unregister()
      el.removeEventListener('keydown', onKeyDown)
      editor.setRootElement(null)
      el.ownerDocument.getSelection()?.removeAllRanges()
      restoreDom(el, snapshot)
      delete (el as HTMLElement & { __lexicalEditor?: unknown }).__lexicalEditor
      return { changed, value: final }
    },
  }
}

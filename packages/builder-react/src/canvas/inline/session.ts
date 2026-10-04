import type { InlineKind, RichCommand, RichFormatState } from '@payload-toolkit/builder/protocol'
import { createThrottle, placeCaret, restoreDom, snapshotDom } from './dom'
import { readText, singleLine } from './model'

/** Typing reaches the admin (and collaborators) at most this often. */
export const CHANGE_MS = 150

export type SessionOptions = {
  /** Viewport point of the double-click: the caret goes there. `null` puts it at the end. */
  point: { x: number; y: number } | null
  /** The prop's new value. Throttled to one call per CHANGE_MS while typing. */
  onChange: (value: unknown) => void
  /** The user ended editing (Escape, or Enter in a one-line prop). */
  onExit: () => void
  /** Rich text: the toolbar state at the caret. */
  onFormat?: (format: RichFormatState) => void
  /** Rich text: Ctrl+K. */
  onLinkRequest?: () => void
}

export type InlineSession = {
  element: HTMLElement
  /**
   * Ends editing and puts the DOM back as React rendered it. `changed` is true when the value
   * changed after the last `onChange` call; `value` is the final value.
   */
  finish: () => { changed: boolean; value: unknown }
  /** Rich text toolbar commands. */
  command?: (command: RichCommand) => void
}

/** Dropped content could be HTML: plain text props refuse drops. */
const onDrop = (e: DragEvent) => e.preventDefault()

/** Formatting the browser offers in editable elements (Ctrl+B, …). Plain text props refuse it. */
const FORMAT_INPUT = /^format/

/**
 * Edits a plain text prop in place: the element itself becomes editable. `line` props stay on one
 * line (Enter ends editing); `lines` props take line breaks (Enter adds one, Ctrl+Enter ends).
 * Paste inserts plain text only. Nothing is sent while an IME composition is open.
 */
export function startPlainSession(el: HTMLElement, kind: Exclude<InlineKind, 'rich'>, options: SessionOptions): InlineSession {
  const doc = el.ownerDocument
  const snapshot = snapshotDom(el)
  const multiline = kind === 'lines'
  // An empty prop shows a placeholder ("Heading"). Edit an empty element; CSS shows the hint.
  const placeholder = el.querySelector('[data-builder-placeholder]')
  const hint = placeholder?.textContent ?? ''
  if (placeholder) el.replaceChildren()

  el.setAttribute('contenteditable', 'plaintext-only')
  // Browsers without plaintext-only fall back to a normal editable element; paste and format guards still apply.
  if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true')
  el.setAttribute('data-builder-editing', kind)
  el.setAttribute('spellcheck', 'true')
  if (hint) el.setAttribute('data-builder-hint', hint)

  const read = () => readText(el, multiline)
  const markBlank = () => el.toggleAttribute('data-builder-blank', read() === '')
  let sent = read()
  let composing = false
  const send = () => {
    if (composing) return
    const value = read()
    if (value === sent) return
    sent = value
    options.onChange(value)
  }
  const throttle = createThrottle(send, CHANGE_MS)

  const onInput = (e: Event) => {
    markBlank()
    if (composing || (e as InputEvent).isComposing) return
    throttle.schedule()
  }
  const onCompositionStart = () => {
    composing = true
  }
  const onCompositionEnd = () => {
    composing = false
    throttle.schedule()
  }
  const onBeforeInput = (e: InputEvent) => {
    if (FORMAT_INPUT.test(e.inputType)) e.preventDefault()
    if (!multiline && (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak')) e.preventDefault()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    // Enter that confirms an IME candidate is not ours.
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape' || (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      e.stopPropagation()
      options.onExit()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      doc.execCommand('insertLineBreak')
    }
  }
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const text = (e.clipboardData?.getData('text/plain') ?? '').replaceAll('\r\n', '\n')
    doc.execCommand('insertText', false, multiline ? text : singleLine(text))
  }

  el.addEventListener('input', onInput)
  el.addEventListener('compositionstart', onCompositionStart)
  el.addEventListener('compositionend', onCompositionEnd)
  el.addEventListener('beforeinput', onBeforeInput)
  el.addEventListener('keydown', onKeyDown)
  el.addEventListener('paste', onPaste)
  el.addEventListener('drop', onDrop)
  markBlank()
  el.focus({ preventScroll: true })
  placeCaret(el, options.point)

  return {
    element: el,
    finish() {
      throttle.cancel()
      composing = false
      const value = read()
      const changed = value !== sent
      el.removeEventListener('input', onInput)
      el.removeEventListener('compositionstart', onCompositionStart)
      el.removeEventListener('compositionend', onCompositionEnd)
      el.removeEventListener('beforeinput', onBeforeInput)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('paste', onPaste)
      el.removeEventListener('drop', onDrop)
      if (doc.activeElement === el) el.blur()
      doc.getSelection()?.removeAllRanges()
      restoreDom(el, snapshot)
      return { changed, value }
    },
  }
}

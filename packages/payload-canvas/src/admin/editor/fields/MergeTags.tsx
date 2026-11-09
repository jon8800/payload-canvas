'use client'

// `admin.custom.builderMergeTags`: an "Insert field" menu over a text, code or rich text input of
// a form's settings (an email's To, Subject, Body). It lists the form's fields as merge tags
// (`{{email}}`) and `{{*}}` for every answer, and inserts the tag at the cursor. Text inputs get
// the new value through `onChange`; rich text gets typed text, so Lexical handles it as typing.

import { useEffect, useRef, type ReactNode } from 'react'

import { ALL_ANSWERS_TAG, mergeTag } from '../../../forms/mergeTags'
import { Icon } from '../icons'
import { MenuButton } from '../menu/Menu'
import { useFormFieldOptions } from './FormFieldName'

type Props = {
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  readonly children: ReactNode
}

const TEXT_INPUT = 'textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'

export function MergeTagsFrame({ value, onChange, children }: Props) {
  const fields = useFormFieldOptions()
  const root = useRef<HTMLDivElement>(null)
  // The last cursor in the rich text editor: opening the menu moves the focus away from it.
  const range = useRef<Range | null>(null)
  useEffect(() => {
    const remember = () => {
      const selection = document.getSelection()
      const editable = root.current?.querySelector('[contenteditable="true"]')
      if (editable && selection && selection.rangeCount > 0 && editable.contains(selection.anchorNode)) range.current = selection.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
  }, [])

  const insert = (tag: string) => {
    const editable = root.current?.querySelector<HTMLElement>('[contenteditable="true"]')
    if (editable) {
      editable.focus()
      const selection = document.getSelection()
      if (selection && range.current && editable.contains(range.current.startContainer)) {
        selection.removeAllRanges()
        selection.addRange(range.current)
      }
      // A typed text: the rich text editor keeps its own state and undo.
      // oxlint-disable-next-line typescript/no-deprecated -- the one way to type into a contenteditable as the user would
      document.execCommand('insertText', false, tag)
      return
    }
    const input = root.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(TEXT_INPUT)
    const text = typeof value === 'string' ? value : ''
    const start = input?.selectionStart ?? text.length
    const end = input?.selectionEnd ?? start
    onChange(`${text.slice(0, start)}${tag}${text.slice(end)}`)
    // The cursor goes after the tag once the new value renders.
    requestAnimationFrame(() => {
      if (!input) return
      input.focus()
      input.setSelectionRange(start + tag.length, start + tag.length)
    })
  }

  return (
    <div ref={root} className="builder-merge-tags">
      <MenuButton
        className="builder-merge-tags__button"
        triggerLabel="Insert a field of the form"
        label="Insert field"
        items={() => [
          ...(fields.length > 0
            ? fields.map((field) => ({ label: field.title, keys: mergeTag(field.value), ownFocus: true, run: () => insert(mergeTag(field.value)) }))
            : [{ label: 'The form has no fields yet', disabled: true }]),
          'separator' as const,
          { label: 'All answers, as a table', keys: ALL_ANSWERS_TAG, ownFocus: true, run: () => insert(ALL_ANSWERS_TAG) },
        ]}
      >
        <Icon name="plus" size={12} />
        Insert field
      </MenuButton>
      {children}
    </div>
  )
}

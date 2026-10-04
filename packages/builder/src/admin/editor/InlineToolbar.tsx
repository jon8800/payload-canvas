'use client'

// The rich text toolbar shown over a rich text block while it is edited on the canvas. It lives
// in the admin overlay (Payload's look, never the site's CSS) and sends commands to the Lexical
// editor in the canvas iframe. Buttons keep the keyboard focus in the iframe (no focus on press).

import { CheckboxInput } from '@payloadcms/ui'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import type { Rect } from '../../core/types'
import type { RichCommand, RichFormatState, RichTextFormat } from '../../protocol'
import { Icon, type IconName } from './icons'
import { sendRichCommand, type InlineEditing } from './inline'
import { contentRects, placeToolbar } from './placement'
import { useRuntime } from './runtime'
import { useValue } from './valueStore'

/** Screen height of the toolbar row, in pixels. */
const TOOLBAR_HEIGHT = 30
/** Screen space between the toolbar and the edited text, in pixels. */
const TOOLBAR_GAP = 6
/** Screen width of the toolbar row, about. */
const TOOLBAR_WIDTH = 440

type BlockChoice = Extract<RichCommand, { kind: 'block' }>['block']

const BLOCKS: Array<{ block: BlockChoice; label: string; text?: string; icon?: IconName }> = [
  { block: 'paragraph', label: 'Paragraph', text: 'Text' },
  { block: 'h2', label: 'Heading 2', text: 'H2' },
  { block: 'h3', label: 'Heading 3', text: 'H3' },
  { block: 'h4', label: 'Heading 4', text: 'H4' },
  { block: 'quote', label: 'Quote', icon: 'quote' },
  { block: 'bullet', label: 'Bulleted list', icon: 'list' },
  { block: 'number', label: 'Numbered list', text: '1.' },
]

const FORMATS: Array<{ format: RichTextFormat; label: string; keys: string; glyph: ReactNode }> = [
  { format: 'bold', label: 'Bold', keys: 'Ctrl+B', glyph: <b>B</b> },
  { format: 'italic', label: 'Italic', keys: 'Ctrl+I', glyph: <i>I</i> },
  { format: 'underline', label: 'Underline', keys: 'Ctrl+U', glyph: <u>U</u> },
  { format: 'strikethrough', label: 'Strikethrough', keys: '', glyph: <s>S</s> },
  { format: 'code', label: 'Inline code', keys: '', glyph: <code>{'<>'}</code> },
]

/** Keeps the keyboard focus (and the text selection) in the canvas iframe. */
const keepFocus = (e: MouseEvent) => e.preventDefault()

function ToolButton({
  label,
  active,
  onPress,
  children,
}: {
  label: string
  active?: boolean
  onPress: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="builder-editor__inline-button"
      aria-label={label}
      aria-pressed={active}
      data-tooltip={label}
      onMouseDown={keepFocus}
      onClick={onPress}
    >
      {children}
    </button>
  )
}

export function InlineToolbar({ inline, rect, zoom }: { inline: InlineEditing; rect: Rect; zoom: number }) {
  const runtime = useRuntime()
  const measurement = useValue(runtime.measurement)
  const format: RichFormatState = inline.format ?? { formats: [], block: 'other', link: null, collapsed: true }
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [newTab, setNewTab] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const command = (next: RichCommand) => sendRichCommand(runtime, next)

  const openLink = () => {
    setUrl(format.link?.url ?? '')
    setNewTab(format.link?.newTab ?? false)
    setLinkOpen(true)
  }
  const closeLink = () => {
    setLinkOpen(false)
    command({ kind: 'focus' })
  }
  const applyLink = () => {
    const value = url.trim()
    setLinkOpen(false)
    command(value ? { kind: 'link', url: value, newTab } : { kind: 'unlink' })
  }

  // Ctrl+K in the canvas opens the form.
  const { linkRequest } = inline
  const lastRequest = useRef(linkRequest)
  useEffect(() => {
    if (linkRequest === lastRequest.current) return
    lastRequest.current = linkRequest
    setUrl(format.link?.url ?? '')
    setNewTab(format.link?.newTab ?? false)
    setLinkOpen(true)
  }, [linkRequest, format.link])
  useEffect(() => {
    if (linkOpen) input.current?.focus()
  }, [linkOpen])

  // Above or under the text, whichever covers less of the page; always inside the canvas viewport.
  const { place, left, top } = useMemo(() => {
    const size = { width: TOOLBAR_WIDTH / zoom, height: TOOLBAR_HEIGHT / zoom }
    const viewport = measurement?.viewport ?? { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY }
    const obstacles = measurement ? contentRects(runtime.store.getState().layout, measurement, inline.id) : []
    return placeToolbar(rect, size, viewport, obstacles, TOOLBAR_GAP / zoom)
  }, [rect, zoom, measurement, runtime, inline.id])
  // Above, the toolbar grows upward (its bottom stays by the text), so the link form never covers the text.
  const style: CSSProperties = { left, top: place === 'above' ? top + TOOLBAR_HEIGHT / zoom : top }

  const onFormKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyLink()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeLink()
    }
  }

  return (
    <div className={`builder-editor__inline-toolbar builder-editor__inline-toolbar--${place}`} style={style} data-inline-toolbar="">
      <div className="builder-editor__inline-row" role="toolbar" aria-label="Text formatting">
        {BLOCKS.map(({ block, label, text, icon }) => (
          <ToolButton key={block} label={label} active={format.block === block} onPress={() => command({ kind: 'block', block })}>
            {icon ? <Icon name={icon} size={14} /> : <span className="builder-editor__inline-glyph">{text}</span>}
          </ToolButton>
        ))}
        <span className="builder-editor__actions-sep" />
        {FORMATS.map(({ format: name, label, keys, glyph }) => (
          <ToolButton
            key={name}
            label={keys ? `${label} (${keys})` : label}
            active={format.formats.includes(name)}
            onPress={() => command({ kind: 'format', format: name })}
          >
            <span className="builder-editor__inline-glyph">{glyph}</span>
          </ToolButton>
        ))}
        <span className="builder-editor__actions-sep" />
        <ToolButton label="Link (Ctrl+K)" active={Boolean(format.link) || linkOpen} onPress={() => (linkOpen ? closeLink() : openLink())}>
          <Icon name="link" size={14} />
        </ToolButton>
        {format.link && (
          <ToolButton label="Remove link" onPress={() => command({ kind: 'unlink' })}>
            <Icon name="unlink" size={14} />
          </ToolButton>
        )}
      </div>
      {linkOpen && (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Enter and Escape for the inputs inside
        <div className="builder-editor__inline-link" onKeyDown={onFormKeyDown}>
          {format.link?.internal ? (
            <p className="builder-editor__inline-note">This links to a document. Change it in the inspector, or remove the link.</p>
          ) : (
            <>
              <input
                ref={input}
                className="builder-editor__inline-url"
                type="text"
                inputMode="url"
                placeholder="https://… or /page"
                aria-label="Link URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <CheckboxInput
                id={`builder-inline-${inline.session}-newtab`}
                name="builder-inline-newtab"
                label="Open in a new tab"
                checked={newTab}
                onToggle={(e: ChangeEvent<HTMLInputElement>) => setNewTab(e.target.checked)}
              />
            </>
          )}
          <div className="builder-editor__inline-actions">
            {format.link && (
              <button type="button" className="builder-editor__inline-text-button" onClick={() => { setLinkOpen(false); command({ kind: 'unlink' }) }}>
                Remove link
              </button>
            )}
            <button type="button" className="builder-editor__inline-text-button" onClick={closeLink}>
              Cancel
            </button>
            {!format.link?.internal && (
              <button type="button" className="builder-editor__inline-text-button builder-editor__inline-text-button--primary" onClick={applyLink}>
                {format.link ? 'Update link' : 'Add link'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

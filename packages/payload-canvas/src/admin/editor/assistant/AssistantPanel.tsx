'use client'

// The Assistant tab of the inspector: the chat with the AI that edits this layout.
// State lives in the runtime's assistant controller; this file only renders it.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

import { findBlock, getBlockDefinition } from '../../../core'
import { Icon } from '../icons'
import { MenuButton } from '../menu/Menu'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { useCollectionLabel } from '../templates/useTemplate'
import { useValue } from '../valueStore'
import type { AiClientConfig } from '../../../ai/types'
import { ConnectAgents, useCopy } from './ConnectAgents'
import type { AssistantController, AssistantNotice, AssistantState } from './controller'
import { failedAction, failureParts, humanizeTool, retriedCalls, transcript, type ToolInfo, type TranscriptItem, type TranscriptPart } from './history'
import { Markdown } from './MarkdownView'

import './assistant.scss'

const PROVIDER_DOCS = 'https://github.com/jon8800/payload-canvas/blob/main/docs/ai/providers.md'
/** Distance from the bottom (px) within which new content keeps the list scrolled to the end. */
const STICK_DISTANCE = 48
const MAX_INPUT_HEIGHT = 168

export function AssistantPanel({ hidden }: { hidden: boolean }) {
  const runtime = useRuntime()
  const assistant = runtime.assistant
  if (!assistant) return null
  return <Panel assistant={assistant} hidden={hidden} />
}

function Panel({ assistant, hidden }: { assistant: AssistantController; hidden: boolean }) {
  const state = useValue(assistant.state)
  const { history, streaming, live, notice, failed } = state
  const items = buildItems(state)
  // An info note (e.g. "New chat: the assistant now uses …") shows inside the welcome. A note that
  // comes with the user's message (after Stop) belongs to the conversation.
  const empty = items.length === 0 && !failed && (!notice || (notice.kind === 'info' && !notice.echo))
  const [connect, setConnect] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  // Opening the tab, starting a chat or sending a message jumps to the end.
  const jumpKey = `${hidden}:${history.messages.length === 0}:${live?.turnStart ?? ''}`
  const lastJump = useRef('')

  // Follow new content while the user is at the bottom. Scrolling up pauses it.
  useLayoutEffect(() => {
    if (lastJump.current !== jumpKey) {
      lastJump.current = jumpKey
      stick.current = true
    }
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })
  // A resized panel (window, viewport) keeps the end in view.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="builder-assistant" hidden={hidden} aria-label="AI assistant">
      <div
        ref={scrollRef}
        className="builder-assistant__scroll"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE
        }}
      >
        {connect ? (
          <div className="builder-assistant__log">
            <ConnectAgents onClose={() => setConnect(false)} />
          </div>
        ) : state.setup ? (
          <div className="builder-assistant__log">
            <SetupState assistant={assistant} message={state.setup} />
          </div>
        ) : !state.key ? (
          <div className="builder-assistant__empty">
            <EmptyMark />
            <p className="builder-assistant__empty-title">Save the document first</p>
            <p className="builder-editor__hint">The assistant works on saved documents. Save once, then ask it to build.</p>
          </div>
        ) : empty ? (
          <Welcome assistant={assistant} note={notice?.kind === 'info' ? notice.message : null} />
        ) : (
          <div className="builder-assistant__log" role="log" aria-live="polite" aria-busy={streaming} aria-label="Conversation">
            {state.restored && items.some((item) => item.kind === 'assistant') && (
              <p className="builder-assistant__info">Undo of earlier replies is not available after a reload.</p>
            )}
            {items.map((item, i) =>
              item.kind === 'user' ? (
                <UserBubble key={item.key} text={item.text} />
              ) : (
                <AssistantTurn
                  key={item.key}
                  parts={item.parts}
                  tools={history.tools}
                  streaming={streaming && i === items.length - 1}
                />
              ),
            )}
            {failed && <UserBubble text={failed} failed />}
            {notice?.kind === 'info' && notice.echo && <UserBubble text={notice.echo} failed label="Not sent" />}
            {notice && <Notice assistant={assistant} notice={notice} canRetry={Boolean(failed)} />}
          </div>
        )}
      </div>

      {!state.setup && (
        <Composer assistant={assistant} state={state} connect={connect} onToggleConnect={() => setConnect((value) => !value)} />
      )}
    </section>
  )
}

/**
 * The model name in the menu. Anthropic: "claude-opus-5-5" -> "Claude Opus 5.5". Others: "OpenRouter ·
 * openai/gpt-6-luna" (shortened by CSS; the title has the full text).
 */
function modelLabel(ai: AiClientConfig): string {
  const model = ai.model
  if (ai.adapter !== 'anthropic') return model ? `${ai.label} · ${model}` : ai.label
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(model)
  if (!match) return model
  const [, family, major, minor] = match
  return `Claude ${family[0].toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

/** The history plus the reply streaming in. The live parts join the last assistant turn. */
function buildItems(state: AssistantState): TranscriptItem[] {
  const items = transcript(state.history.messages)
  const { live } = state
  if (!live) return items
  const last = items.at(-1)
  if (last?.kind === 'assistant') {
    return [...items.slice(0, -1), { ...last, parts: [...last.parts, ...live.parts] }]
  }
  // The key matches the one `transcript` gives this reply once its first message is confirmed,
  // so the turn does not remount (and animate in again) when the stream ends.
  return [...items, { kind: 'assistant', key: `m${live.turnStart + 1}`, parts: live.parts }]
}

function EmptyMark() {
  return (
    <span className="builder-assistant__mark" aria-hidden="true">
      <Icon name="sparkle" size={20} />
    </span>
  )
}

function UserBubble({ text, failed = false, label = 'Not sent' }: { text: string; failed?: boolean; label?: string }) {
  return (
    <div className={`builder-assistant__user${failed ? ' builder-assistant__user--failed' : ''}`}>
      <p className="builder-assistant__bubble">{text}</p>
      {failed && <span className="builder-assistant__failed-label">{label}</span>}
    </div>
  )
}

function AssistantTurn({
  parts,
  tools,
  streaming,
}: {
  parts: TranscriptPart[]
  tools: Record<string, ToolInfo>
  /** The reply is streaming into this turn: thinking indicator, caret, no copy button yet. */
  streaming: boolean
}) {
  const text = parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('\n\n')
  const last = parts.at(-1)
  const toolRunning = parts.some((p) => p.kind === 'tool' && tools[p.callId]?.status === 'running')
  const thinking = streaming && !toolRunning && last?.kind !== 'text'
  const groups = groupParts(parts)
  const retried = retriedCalls(
    parts.flatMap((p) => (p.kind === 'tool' ? [p] : [])),
    tools,
  )

  return (
    <article className="builder-assistant__turn" aria-label="Assistant reply">
      <div className="builder-assistant__turn-head">
        <span className="builder-assistant__badge builder-assistant__badge--small">
          <Icon name="sparkle" size={10} />
        </span>
        <span>Assistant</span>
        {text && !streaming && <CopyButton text={text} />}
      </div>
      {groups.map((group, i) =>
        group.kind === 'text' ? (
          <div
            key={i}
            className={`builder-assistant__text${streaming && i === groups.length - 1 && last?.kind === 'text' ? ' builder-assistant__text--streaming' : ''}`}
          >
            <Markdown text={group.text} />
          </div>
        ) : (
          <ul key={i} className="builder-assistant__tools" aria-label="Changes">
            {group.calls.map((call) => (
              <ToolChip key={call.callId} name={call.name} info={tools[call.callId]} retried={retried.has(call.callId)} />
            ))}
          </ul>
        ),
      )}
      {thinking && (
        <output className="builder-assistant__thinking">
          <span className="builder-assistant__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {parts.length === 0 ? 'Thinking…' : 'Working…'}
        </output>
      )}
    </article>
  )
}

type PartGroup = { kind: 'text'; text: string } | { kind: 'tools'; calls: { callId: string; name: string }[] }

/** Consecutive tool calls form one compact list; text parts stay separate. */
function groupParts(parts: TranscriptPart[]): PartGroup[] {
  const groups: PartGroup[] = []
  for (const part of parts) {
    const last = groups.at(-1)
    if (part.kind === 'text') groups.push({ kind: 'text', text: part.text })
    else if (last?.kind === 'tools') last.calls.push(part)
    else groups.push({ kind: 'tools', calls: [part] })
  }
  return groups
}

/**
 * One tool call. A failed call shows a short line ("Could not insert FAQ"); the raw error is behind
 * "Details". When the model retried the same tool and it worked, the failed call is a quiet
 * "Retried: Insert FAQ", like a call that never ran.
 */
function ToolChip({ name, info, retried }: { name: string; info: ToolInfo | undefined; retried: boolean }) {
  const runtime = useRuntime()
  const status = info?.status ?? 'done'
  const failure = status === 'error' ? failureParts(info?.summary ?? '') : null
  const label = failure
    ? retried
      ? `Retried: ${failedAction(failure.short, name)}`
      : failure.short || `Could not run ${humanizeTool(name).toLowerCase()}`
    : info?.summary || humanizeTool(name)
  // A tool that ran but had changes that did not apply here is a warning, not a failure.
  const problem = status === 'error' || (status === 'done' && Boolean(info?.note))
  const tone = retried ? 'retried' : status === 'error' ? 'error' : problem ? 'warn' : status
  const icon = status === 'running' ? null : status === 'cancelled' ? 'minus' : retried ? 'retry' : problem ? 'warning' : 'check'
  const showId = status === 'done' ? info?.showId : undefined
  const canShow = useEditor(runtime.store, (s) => Boolean(showId && findBlock(s.layout, showId)))
  return (
    <li className={`builder-assistant__chip builder-assistant__chip--${tone}`}>
      <span className="builder-assistant__chip-row">
        <span className="builder-assistant__chip-icon" aria-hidden="true">
          {icon ? <Icon name={icon} size={12} /> : <span className="builder-assistant__spinner" />}
        </span>
        <span className="builder-assistant__chip-label">{label}</span>
        <span className="builder-assistant__sr-only">
          {status === 'running' ? ' (running)' : status === 'cancelled' ? ' (not run)' : retried ? ' (retried)' : problem ? ' (failed)' : ' (done)'}
        </span>
        {canShow && showId && (
          <button
            type="button"
            className="builder-assistant__ghost builder-assistant__chip-show"
            aria-label="Show the changed block on the canvas"
            onClick={() => runtime.assistant?.show(showId)}
          >
            Show
          </button>
        )}
      </span>
      {failure?.detail && (
        <details className="builder-assistant__details builder-assistant__chip-details">
          <summary>
            Details<span className="builder-assistant__sr-only"> of {label}</span>
          </summary>
          <p className="builder-assistant__chip-detail">{failure.detail}</p>
        </details>
      )}
      {info?.note && <span className="builder-assistant__chip-note">{info.note}</span>}
      {info?.image?.url && (
        <img
          className="builder-assistant__chip-image"
          src={info.image.url}
          alt={info.image.alt ?? 'Generated image'}
          title={info.image.alt ?? undefined}
          loading="lazy"
          style={info.image.width && info.image.height ? { aspectRatio: `${info.image.width} / ${info.image.height}` } : undefined}
        />
      )}
    </li>
  )
}

function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopy()
  return (
    <button
      type="button"
      className="builder-editor__icon-button builder-editor__icon-button--small builder-assistant__copy"
      aria-label={copied ? 'Copied' : 'Copy reply'}
      data-tooltip={copied ? 'Copied' : 'Copy'}
      onClick={() => copy(text)}
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  )
}

function Notice({ assistant, notice, canRetry }: { assistant: AssistantController; notice: AssistantNotice; canRetry: boolean }) {
  if (notice.kind === 'info') {
    return <p className="builder-assistant__info">{notice.message}</p>
  }
  // A setup notice never stays in the state: the controller turns it into the setup state.
  if (notice.kind === 'setup') return null
  return (
    <div className="builder-assistant__card builder-assistant__card--error" role="alert">
      <p className="builder-assistant__card-text">
        <Icon name="warning" size={14} /> {notice.message}
      </p>
      <div className="builder-assistant__card-actions">
        {canRetry && (
          <button type="button" className="builder-assistant__ghost" onClick={assistant.retry}>
            <Icon name="retry" size={12} /> Try again
          </button>
        )}
        <button type="button" className="builder-assistant__ghost" onClick={assistant.dismissNotice}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

/**
 * No key on the server. Plain words for an editor first. The technical details sit behind a
 * disclosure for the developer. The Claude Code and Codex card is the other way in.
 */
function SetupState({ assistant, message }: { assistant: AssistantController; message: string }) {
  const runtime = useRuntime()
  const ai = runtime.config.ai
  const noAdapter = !ai || ai.adapter === 'none'
  const keyEnv = ai?.keyEnv ?? null
  const keyPage = ai?.keyUrl ?? null
  return (
    <>
      <output className="builder-assistant__card builder-assistant__card--setup">
        <p className="builder-assistant__card-title">The AI assistant is not set up yet</p>
        <p className="builder-assistant__card-text">
          The AI assistant is not set up on this site yet. Ask your developer to add an API key.
        </p>
        <details className="builder-assistant__details">
          <summary>Details for developers</summary>
          <div className="builder-assistant__details-body">
            <p className="builder-assistant__card-text">{message}</p>
            {keyEnv && <pre className="builder-assistant__card-code">{keyEnv}=…</pre>}
            {!noAdapter && (
              <p className="builder-assistant__card-text">
                The adapter is {ai.label}. To use another one, change <code>ai.adapter</code> in <code>payload.config.ts</code>.
              </p>
            )}
            <div className="builder-assistant__card-actions">
              {keyPage && (
                <a className="builder-assistant__link" href={keyPage} target="_blank" rel="noopener noreferrer">
                  Get an API key <Icon name="external" size={12} />
                </a>
              )}
              <a className="builder-assistant__link" href={PROVIDER_DOCS} target="_blank" rel="noopener noreferrer">
                Provider guide <Icon name="external" size={12} />
              </a>
            </div>
          </div>
        </details>
        <div className="builder-assistant__card-actions">
          <button type="button" className="builder-assistant__ghost" onClick={assistant.clearSetup}>
            <Icon name="retry" size={12} /> Check again
          </button>
        </div>
      </output>
      <p className="builder-assistant__info">Or use your own Claude or ChatGPT plan.</p>
      <ConnectAgents />
    </>
  )
}

type BlockKind = 'text' | 'button' | 'image' | 'container' | 'other'

const TEXT_BLOCKS = new Set(['heading', 'text', 'richText', 'quote'])
const CONTAINER_BLOCKS = new Set(['stack', 'grid', 'section'])

/** What kind of block is selected, so the suggestions fit it. */
function blockKind(type: string, blocks: Parameters<typeof getBlockDefinition>[0]): BlockKind {
  if (TEXT_BLOCKS.has(type)) return 'text'
  if (type === 'button') return 'button'
  if (type === 'image') return 'image'
  if (CONTAINER_BLOCKS.has(type)) return 'container'
  const slots = getBlockDefinition(blocks, type)?.slots
  return slots && Object.keys(slots).length > 0 ? 'container' : 'other'
}

const BLOCK_SUGGESTIONS: Record<BlockKind, string[]> = {
  text: ['Rewrite this text to be punchier', 'Make this text shorter', 'Make this stand out more', 'Make this look good on mobile'],
  button: ['Make this button stand out more', 'Change the button text to be clearer', 'Add more space around this', 'Make this look good on mobile'],
  image: ['Make this image fill the width', 'Round the corners of this image', 'Add more space around this', 'Make this look good on mobile'],
  container: [
    'Add a heading and a short intro',
    'Make this section two columns',
    'Add more space inside this section',
    'Make this look good on mobile',
  ],
  other: ['Make this stand out more', 'Add more space around this', 'Make this look good on mobile'],
}

/** The empty chat: a short intro and suggestions that fit the page, the selection or the template. */
function Welcome({ assistant, note }: { assistant: AssistantController; note: string | null }) {
  const runtime = useRuntime()
  const template = useValue(runtime.template)
  const singular = useCollectionLabel(template.target, 'singular').toLowerCase()
  const isEmptyPage = useEditor(runtime.store, (s) => s.layout.blocks.length === 0)
  const selectedType = useEditor(runtime.store, (s) => (s.selectedId ? (findBlock(s.layout, s.selectedId)?.type ?? null) : null))
  const kind = selectedType ? blockKind(selectedType, runtime.config.blocks) : null

  const suggestions = kind
    ? BLOCK_SUGGESTIONS[kind]
    : template.isTemplate && template.target
      ? [
          `Bind the heading to the ${singular} title`,
          `Build a layout for a ${singular}`,
          'Show the featured image at the top',
          'Add a related items list at the end',
        ]
      : isEmptyPage
        ? [
            'Build a landing page for a design studio',
            'Add a hero section',
            'Add a pricing section with three plans',
            'Add a FAQ section',
          ]
        : [
            'Add a testimonials section',
            'Add a call to action at the end',
            'Tighten the spacing across the page',
            'Make the page look good on mobile',
          ]

  return (
    <div className="builder-assistant__welcome">
      {note && <p className="builder-assistant__info">{note}</p>}
      <EmptyMark />
      <p className="builder-assistant__empty-title">
        {selectedType ? `What should change in this ${runtime.blockLabel(selectedType).toLowerCase()}?` : 'What should we build?'}
      </p>
      <p className="builder-editor__hint">
        The assistant edits this {template.isTemplate ? 'template' : 'page'} on the canvas as you watch. One Ctrl+Z undoes a
        whole reply.
      </p>
      <div className="builder-assistant__suggestions">
        {suggestions.map((text) => (
          <button key={text} type="button" className="builder-assistant__suggestion" onClick={() => void assistant.send(text)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** What the assistant will target: the selected block, the template sample, or the whole page. */
function ContextChips() {
  const runtime = useRuntime()
  const template = useValue(runtime.template)
  const selectedType = useEditor(runtime.store, (s) => (s.selectedId ? (findBlock(s.layout, s.selectedId)?.type ?? null) : null))
  return (
    <div className="builder-assistant__context" aria-label="Context">
      {selectedType ? (
        <span className="builder-assistant__context-chip builder-assistant__context-chip--selected">
          <Icon name="cursor" size={12} />
          <span className="builder-assistant__context-text">Selected: {runtime.blockLabel(selectedType)}</span>
          <button
            type="button"
            className="builder-assistant__context-clear"
            aria-label="Clear the selection"
            onClick={() => runtime.store.select(null)}
          >
            <Icon name="close" size={10} />
          </button>
        </span>
      ) : (
        <span className="builder-assistant__context-chip">
          <Icon name="stack" size={12} />
          <span className="builder-assistant__context-text">{template.isTemplate ? 'Whole template' : 'Whole page'}</span>
        </span>
      )}
      {template.isTemplate && template.sample && (
        <span className="builder-assistant__context-chip" data-tooltip={template.sample.title}>
          <Icon name="link" size={12} />
          <span className="builder-assistant__context-text">Template · sample: {template.sample.title}</span>
        </span>
      )}
    </div>
  )
}

function Composer({
  assistant,
  state,
  connect,
  onToggleConnect,
}: {
  assistant: AssistantController
  state: AssistantState
  connect: boolean
  onToggleConnect: () => void
}) {
  const runtime = useRuntime()
  const { draft, streaming, key } = state
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stopRef = useRef<HTMLButtonElement>(null)
  const wasStreaming = useRef(streaming)

  // The panel opened (toolbar button, tab, Ctrl+I): focus the input, or Stop while a reply streams.
  const focusAt = useValue(runtime.assistantFocus)
  useEffect(() => {
    if (!focusAt) return
    if (inputRef.current?.disabled) stopRef.current?.focus()
    else inputRef.current?.focus()
  }, [focusAt])

  // Grow with the text, up to a limit. Runs after every render: measuring is cheap.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const height = Math.min(MAX_INPUT_HEIGHT, el.scrollHeight)
    el.style.height = `${height}px`
    // A scrollbar only once the text is taller than the limit.
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden'
  })

  // Focus follows the reply: Stop while it streams (the input is disabled), the input when it ends.
  useEffect(() => {
    const active = document.activeElement
    const idle = !active || active === document.body
    if (streaming && !wasStreaming.current && (idle || active === inputRef.current)) stopRef.current?.focus()
    // The Stop button was replaced by Send: focus inside the field goes back to the input.
    const inField = Boolean(active && inputRef.current?.parentElement?.contains(active))
    if (!streaming && wasStreaming.current && (idle || inField)) inputRef.current?.focus()
    wasStreaming.current = streaming
  }, [streaming])

  // Escape stops the reply while focus is inside the panel.
  useEffect(() => {
    if (!streaming) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const panel = inputRef.current?.closest('.builder-assistant')
      if (!panel?.contains(document.activeElement)) return
      e.preventDefault()
      assistant.stop()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [streaming, assistant])

  const send = () => {
    if (!draft.trim() || streaming) return
    void assistant.send(draft)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
      return
    }
    // With an empty input there is no text to undo: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo
    // the page, so the assistant's last change can be reverted without leaving the panel.
    const mod = e.ctrlKey || e.metaKey
    const pressed = e.key.toLowerCase()
    if (mod && !e.altKey && draft === '' && (pressed === 'z' || pressed === 'y')) {
      e.preventDefault()
      if (pressed === 'y' || e.shiftKey) runtime.store.redo()
      else runtime.store.undo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      runtime.toggleAssistant()
    }
  }

  return (
    <div className="builder-assistant__composer">
      <ContextChips />
      <div className="builder-assistant__field" data-disabled={streaming || !key || undefined}>
        <textarea
          ref={inputRef}
          className="builder-assistant__input"
          rows={1}
          value={draft}
          disabled={streaming || !key}
          placeholder={streaming ? 'Working…' : 'Ask for a change…'}
          aria-label="Message the assistant"
          onChange={(e) => assistant.setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {streaming ? (
          <button
            key="stop"
            ref={stopRef}
            type="button"
            className="builder-assistant__send builder-assistant__send--stop"
            aria-label="Stop"
            data-tooltip="Stop · Esc"
            onClick={assistant.stop}
          >
            <Icon name="stop" size={14} />
          </button>
        ) : (
          <button
            key="send"
            type="button"
            className="builder-assistant__send"
            aria-label="Send"
            data-tooltip="Send · Enter"
            disabled={!draft.trim() || !key}
            onClick={send}
          >
            <Icon name="arrowUp" size={14} />
          </button>
        )}
      </div>
      <div className="builder-assistant__foot">
        <p className="builder-assistant__footnote">
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line
        </p>
        <MoreMenu assistant={assistant} state={state} connect={connect} onToggleConnect={onToggleConnect} />
      </div>
    </div>
  )
}

/** The "⋯" menu in the footer: new chat, the Claude Code and Codex route, and the model name. */
function MoreMenu({
  assistant,
  state,
  connect,
  onToggleConnect,
}: {
  assistant: AssistantController
  state: AssistantState
  connect: boolean
  onToggleConnect: () => void
}) {
  const runtime = useRuntime()
  const ai = runtime.config.ai
  const { history, streaming, failed, notice } = state
  return (
    <MenuButton
      className="builder-editor__icon-button builder-editor__icon-button--small"
      triggerLabel="Assistant options"
      tooltip="Options"
      label="Assistant options"
      side="top"
      items={() => [
        {
          icon: 'compose',
          label: 'New chat',
          ownFocus: true,
          disabled: history.messages.length === 0 && !failed && !notice && !streaming,
          run: () => {
            assistant.newChat()
            runtime.assistantFocus.set(Date.now())
          },
        },
        { icon: 'link', label: 'Use Claude Code or Codex', checked: connect, run: onToggleConnect },
      ]}
      footer={ai && ai.adapter !== 'none' && <span data-tooltip={`${ai.label} · ${ai.model}`}>Model: {modelLabel(ai)}</span>}
    >
      <Icon name="more" size={14} />
    </MenuButton>
  )
}

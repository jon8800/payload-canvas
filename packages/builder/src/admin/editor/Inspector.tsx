'use client'

import { CheckboxInput } from '@payloadcms/ui'
import { useDeferredValue, useEffect, useState, type ChangeEvent } from 'react'

import { findBlock, getBlockDefinition } from '../../core'
import type { Block } from '../../core/types'
import { BlockIcon, Icon, type IconName } from './icons'
import { blockMenuEntries } from './menu/blockMenu'
import { MenuButton } from './menu/Menu'
import { renameRequest } from './menu/requests'
import { blockName, typeName } from './names'
import { RenameInput } from './Outline'
import { EditingBanner } from './live/PresenceUI'
import { AssistantPanel } from './assistant/AssistantPanel'
import { BlockContentFields } from './renderField'
import { useRuntime, type InspectorTab } from './runtime'
import { shortcutList } from './shortcuts'
import { useEditor } from './store'
import { StylesPanel } from './styles/StylesPanel'
import { useValue, useValueSelector } from './valueStore'

type TabsProps<T extends string> = {
  value: T
  options: { id: T; label: string; icon?: IconName }[]
  onChange: (id: T) => void
  variant?: 'segmented' | 'underline'
}

function Tabs<T extends string>({ value, options, onChange, variant = 'underline' }: TabsProps<T>) {
  return (
    <div className={variant === 'segmented' ? 'builder-editor__segmented builder-editor__segmented--full' : 'builder-editor__tabs'} role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={variant === 'segmented' ? 'builder-editor__segment' : 'builder-editor__tab'}
          onClick={() => onChange(option.id)}
        >
          {option.icon && <Icon name={option.icon} size={13} />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Inspector() {
  const runtime = useRuntime()
  const { inspectorRef } = runtime
  const tab = useValue(runtime.inspectorTab)
  const setTab = (next: InspectorTab) => (next === 'assistant' ? runtime.toggleAssistant(true) : runtime.inspectorTab.set(next))
  // The document's own fields open in Payload's drawer from the top bar ("Page settings").
  return (
    <div ref={inspectorRef} className="builder-editor__inspector">
      {runtime.assistant && (
        <div className="builder-editor__inspector-head">
          <Tabs
            value={tab}
            onChange={setTab}
            variant="segmented"
            options={[
              { id: 'block', label: 'Block' },
              { id: 'assistant', label: 'Assistant', icon: 'sparkle' },
            ]}
          />
        </div>
      )}
      <div className="builder-editor__inspector-body" hidden={tab !== 'block'}>
        <BlockPane />
      </div>
      {runtime.assistant && <AssistantPanel hidden={tab !== 'assistant'} />}
    </div>
  )
}

const TIP_LABELS: Record<string, string> = {
  'Publish changes': 'Publish',
  'Open or close the AI assistant': 'AI assistant',
  'Copy block': 'Copy block',
  'Paste into or after the selection': 'Paste',
  Undo: 'Undo',
  'Show this list': 'All shortcuts',
}

function EmptyState() {
  const runtime = useRuntime()
  const drafts = useValueSelector(runtime.doc.meta, (meta) => meta.drafts)
  const tips = shortcutList({ ai: Boolean(runtime.assistant), publish: drafts }).filter((s) => s.label in TIP_LABELS)
  return (
    <div className="builder-editor__empty builder-editor__empty--inspector">
      <Icon name="cursor" size={20} />
      <p>No block selected</p>
      <p className="builder-editor__hint">
        Click a block on the canvas or in the outline to edit its content and styles. Drag blocks from the Add panel to build
        the page.
      </p>
      <dl className="builder-editor__tips">
        {tips.map(({ keys, label }) => (
          <div key={label} className="builder-editor__help-row">
            <dt>{TIP_LABELS[label]}</dt>
            <dd>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function BlockPane() {
  const runtime = useRuntime()
  // Another block selected: the selection on the canvas and in the outline paints first, the
  // inspector (Payload's inputs, the slowest part to mount) follows in a deferred render.
  // Edits to the shown block stay synchronous, so a controlled input never lags behind typing.
  const selectedId = useEditor(runtime.store, (s) => s.selectedId)
  const shownId = useDeferredValue(selectedId)
  const block = useEditor(runtime.store, (s) => (shownId ? findBlock(s.layout, shownId) : null))
  const [tab, setTab] = useState<'content' | 'styles'>('content')
  const [shownType, setShownType] = useState<string | null>(null)
  const focusRequest = useValue(runtime.focusRequest)

  // Styles stays open while the user styles blocks of one type. Another type opens its content,
  // so its fields never seem to vanish.
  if (block && block.type !== shownType) {
    setShownType(block.type)
    if (shownType !== null) setTab('content')
  }
  // A block that was just added opens on its content.
  if (block && focusRequest === block.id && tab !== 'content') setTab('content')

  // A block that was just added: focus its first content field.
  useEffect(() => {
    if (!block || focusRequest !== block.id) return
    runtime.focusRequest.set(null)
    const frame = requestAnimationFrame(() => {
      const field = runtime.inspectorRef.current?.querySelector<HTMLElement>(
        '.builder-editor__fields input:not([type="hidden"]):not([type="checkbox"]), .builder-editor__fields textarea, .builder-editor__fields [contenteditable="true"]',
      )
      field?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [block, focusRequest, runtime])

  if (!block) return <EmptyState />

  return (
    // `key` remounts the inputs per block, so input state (loaded documents) never leaks between blocks.
    <div key={block.id} className="builder-editor__block-pane">
      <BlockHeader block={block} />
      <BlockProblems blockId={block.id} />
      <EditingBanner blockId={block.id} />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'content', label: 'Content' },
          { id: 'styles', label: 'Styles' },
        ]}
      />
      {tab === 'content' ? <BlockContentFields block={block} /> : <StyleFields block={block} />}
    </div>
  )
}

/** What stopped the last publish, for this block. */
function BlockProblems({ blockId }: { blockId: string }) {
  const runtime = useRuntime()
  const problems = useValue(runtime.problems).filter((p) => p.blockId === blockId)
  if (problems.length === 0) return null
  return (
    <div className="builder-editor__block-problems" role="alert">
      <Icon name="warning" size={14} />
      <div>
        <p className="builder-editor__block-problems-title">Fix this to publish</p>
        <ul>
          {problems.map((p) => (
            <li key={p.message}>{p.message}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function BlockHeader({ block }: { block: Block }) {
  const runtime = useRuntime()
  const def = getBlockDefinition(runtime.config.blocks, block.type)
  const [renamingHere, setRenaming] = useState(false)
  // "Rename" in a block menu (or F2 outside the outline) renames here.
  const requested = useValueSelector(renameRequest(runtime), (r) => r?.where === 'inspector' && r.id === block.id)
  const renaming = renamingHere || requested
  const endRename = () => {
    setRenaming(false)
    if (requested) renameRequest(runtime).set(null)
  }
  const typeLabel = runtime.blockLabel(block.type)
  const name = blockName(block, typeLabel)
  const kind = typeName(block, typeLabel)
  // The type shows under a custom name; else the category does.
  const sub = block.label ? kind : def?.category
  const tag = typeof block.props?.as === 'string' && block.props.as !== 'div' ? `<${block.props.as}>` : null

  return (
    <div className="builder-editor__block-head">
      <span className="builder-editor__block-icon">
        <BlockIcon name={runtime.blockIcon(block.type)} size={16} />
      </span>
      <span className="builder-editor__block-name">
        {renaming ? (
          <RenameInput block={block} placeholder={kind} onDone={endRename} />
        ) : (
          <button
            type="button"
            className="builder-editor__block-title"
            aria-label={`${name}. Rename the block`}
            data-tooltip="Rename"
            onClick={() => setRenaming(true)}
          >
            {name}
          </button>
        )}
        {(sub || tag) && (
          <span className="builder-editor__block-sub">
            {sub}
            {sub && tag ? ' · ' : ''}
            {tag && <code>{tag}</code>}
          </span>
        )}
      </span>
      {block.hidden && (
        <span className="builder-editor__pill" data-tooltip="Hidden on the site">
          <Icon name="eyeOff" size={12} /> Hidden
        </span>
      )}
      <MenuButton
        className="builder-editor__icon-button"
        triggerLabel="More actions"
        tooltip="More actions"
        label="Block actions"
        items={() => blockMenuEntries(runtime, block.id, 'inspector')}
        footer={
          <>
            Block ID <code>{block.id}</code>
          </>
        }
      >
        <Icon name="more" />
      </MenuButton>
    </div>
  )
}

function StyleFields({ block }: { block: Block }) {
  const runtime = useRuntime()
  const def = getBlockDefinition(runtime.config.blocks, block.type)

  return (
    <div className="builder-editor__fields">
      {def?.styles === false ? (
        <p className="builder-editor__hint">This block has no style controls.</p>
      ) : (
        <StylesPanel block={block} />
      )}
      <CheckboxInput
        id={`builder-${block.id}-hidden`}
        name={`builder.${block.id}.hidden`}
        label="Hide on the site"
        checked={block.hidden === true}
        onToggle={(e: ChangeEvent<HTMLInputElement>) =>
          runtime.store.apply({ type: 'update', id: block.id, hidden: e.target.checked })
        }
      />
    </div>
  )
}

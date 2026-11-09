'use client'

import { CheckboxInput, TextInput } from '@payloadcms/ui'
import { useDeferredValue, useEffect, useState, type ChangeEvent } from 'react'

import { blockParts, findBlock, getBlockDefinition, htmlIdProblem, htmlIdsOf } from '../../core'
import type { Block, BlockDefinition, Operation } from '../../core/types'
import { BlockIcon, Icon, type IconName } from './icons'
import { useContentMode } from './contentMode'
import { blockMenuEntries } from './menu/blockMenu'
import { MenuButton } from './menu/Menu'
import { renameRequest } from './menu/requests'
import { blockName, typeName } from './names'
import { RenameInput } from './Outline'
import { EditingBanner } from './live/PresenceUI'
import { LocaleNote } from './locale/LocaleField'
import { MotionPanel } from './motion/MotionPanel'
import { AssistantPanel } from './assistant/AssistantPanel'
import { useAccessRefresh } from './fields/access'
import { InputError } from './fields/CheckedInputs'
import { BlockContentFields } from './renderField'
import { useRuntime, type InspectorTab } from './runtime'
import { storesBuilderData } from './actions'
import { shortcutList } from './shortcuts'
import { useEditor } from './store'
import { StylesPanel } from './styles/StylesPanel'
import { Select } from './ui/Select'
import { usePayloadControlNames } from './ui/payloadA11y'
import { useOptionalValue, useValue, useValueSelector } from './valueStore'
import { RegionPane } from './regions/RegionPane'
import { SECTION_REF_BLOCK } from '../../blocks/builtins/sectionRef'
import { ComponentBanner, ComponentValuesPanel } from './sections/ComponentFields'

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
  // Field access: ask the server again after edits to blocks with access rules.
  useAccessRefresh()
  // Payload's icon-only buttons and selects get accessible names.
  usePayloadControlNames(inspectorRef)
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
        <ComponentBanner />
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

/** The tips content mode keeps: the others add, copy or paste blocks. */
const CONTENT_TIPS = new Set(['Publish changes', 'Open or close the AI assistant', 'Undo', 'Show this list'])

function EmptyState() {
  const runtime = useRuntime()
  const drafts = useValueSelector(runtime.doc.meta, (meta) => meta.drafts)
  const contentMode = useContentMode(runtime)
  const tips = shortcutList({ ai: Boolean(runtime.assistant), publish: drafts }).filter((s) => s.label in TIP_LABELS && (!contentMode || s.label in CONTENT_TIPS))
  return (
    <div className="builder-editor__empty builder-editor__empty--inspector">
      <Icon name="cursor" size={20} />
      <p>No block selected</p>
      <p className="builder-editor__hint">
        {contentMode
          ? 'Click a text, image or link on the canvas or in Layers to edit it.'
          : 'Click a block on the canvas or in Layers to edit its content and styles. Drag blocks from the Blocks tab to build the page.'}
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

type BlockTab = 'content' | 'styles' | 'motion' | 'advanced'

const TAB_STORAGE_KEY = 'payload-builder:inspector-tab'
const BLOCK_TABS: readonly BlockTab[] = ['content', 'styles', 'motion', 'advanced']

/** The tab the user last chose, kept in this browser. Styles first, as in Webflow. */
function readTabChoice(): BlockTab {
  try {
    const value = localStorage.getItem(TAB_STORAGE_KEY)
    return BLOCK_TABS.includes(value as BlockTab) ? (value as BlockTab) : 'styles'
  } catch {
    return 'styles'
  }
}

function saveTabChoice(tab: BlockTab) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    // Storage blocked: the choice lasts until the editor closes.
  }
}

/** The tab a block opens on: the chosen tab, unless the block has nothing to show there. */
function tabFor(chosen: BlockTab, def: BlockDefinition | undefined, justAdded: boolean): BlockTab {
  const hasFields = (def?.fields.length ?? 0) > 0
  // A block that was just added opens on its content, so typing starts at once.
  if (justAdded && hasFields) return 'content'
  if (chosen !== 'content' && def?.styles === false) return 'content'
  if (chosen === 'content' && !hasFields && def?.styles !== false) return 'styles'
  return chosen
}

function BlockPane() {
  const runtime = useRuntime()
  // Another block selected: the selection on the canvas and in the outline paints first, the
  // inspector (Payload's inputs, the slowest part to mount) follows in a deferred render.
  // Edits to the shown block stay synchronous, so a controlled input never lags behind typing.
  const selectedId = useEditor(runtime.store, (s) => s.selectedId)
  const shownId = useDeferredValue(selectedId)
  // The block in the editor's locale: the inspector shows and edits that locale's values.
  const block = useEditor(runtime.store, (s) => (shownId ? findBlock(s.view, shownId) : null))
  // The user's tab stays chosen across blocks and visits, like Webflow's Style panel.
  const [chosen, setChosen] = useState<BlockTab>(() => (typeof window === 'undefined' ? 'styles' : readTabChoice()))
  const focusRequest = useValue(runtime.focusRequest)
  // A selected page region shows its own pane.
  const region = useOptionalValue(runtime.regions?.selected ?? null)
  // A block that was just added keeps its content open while it stays selected, also after the
  // focus request clears.
  const [addedId, setAddedId] = useState<string | null>(null)
  if (block && focusRequest === block.id && addedId !== block.id) setAddedId(block.id)
  const def = block ? getBlockDefinition(runtime.config.blocks, block.type) : undefined
  // Content mode edits content only: no Styles, Motion or Advanced tab.
  const contentMode = useContentMode(runtime)
  const tab = storesBuilderData(runtime) && !contentMode ? tabFor(chosen, def, block !== null && block.id === addedId) : 'content'
  const setTab = (next: BlockTab) => {
    setAddedId(null)
    setChosen(next)
    saveTabChoice(next)
  }

  // A block that was just added: focus its first content field.
  useEffect(() => {
    if (!block || focusRequest !== block.id) return
    // The request clears inside the frame: clearing it here re-renders the inspector, and the
    // cleanup would cancel the frame before the field gets focus.
    const frame = requestAnimationFrame(() => {
      runtime.focusRequest.set(null)
      const field = runtime.inspectorRef.current?.querySelector<HTMLElement>(
        '.builder-editor__fields input:not([type="hidden"]):not([type="checkbox"]), .builder-editor__fields textarea, .builder-editor__fields [contenteditable="true"]',
      )
      field?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [block, focusRequest, runtime])

  if (!block) {
    // A selected region shows its pane. Without a selection, a panel region (a form's settings) shows its fields.
    const shownRegion = region ?? runtime.regions?.config.find((r) => r.panel)?.name ?? null
    return shownRegion && runtime.regions ? <RegionPane key={shownRegion} regions={runtime.regions} name={shownRegion} /> : <EmptyState />
  }

  return (
    // `key` remounts the inputs per block, so input state (loaded documents) never leaks between blocks.
    <div key={block.id} className="builder-editor__block-pane">
      <BlockHeader block={block} />
      <BlockProblems blockId={block.id} />
      <EditingBanner blockId={block.id} />
      <LocaleNote blockId={block.id} tab={tab} />
      {!contentMode && (
        <Tabs
          value={tab}
          onChange={setTab}
          options={
            storesBuilderData(runtime)
              ? [
                  { id: 'content', label: 'Content' },
                  { id: 'styles', label: 'Styles' },
                  { id: 'motion', label: 'Motion' },
                  { id: 'advanced', label: 'Advanced' },
                ]
              : // A Payload blocks field holds the blocks' own fields only.
                [{ id: 'content', label: 'Content' }]
          }
        />
      )}
      {tab === 'content' && <BlockContentFields block={block} />}
      {tab === 'content' && block.type === SECTION_REF_BLOCK && <ComponentValuesPanel block={block} />}
      {tab === 'styles' && storesBuilderData(runtime) && <StyleFields block={block} />}
      {tab === 'motion' && storesBuilderData(runtime) && <MotionPanel blockId={block.id} blockType={block.type} motion={block.motion} />}
      {tab === 'advanced' && storesBuilderData(runtime) && <AdvancedFields block={block} />}
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
  const [renamingHere, setRenaming] = useState(false)
  // "Rename" in a block menu (or F2 outside the outline) renames here.
  const requested = useValueSelector(renameRequest(runtime), (r) => r?.where === 'inspector' && r.id === block.id)
  // Content mode does not rename blocks.
  const contentMode = useContentMode(runtime)
  const renaming = !contentMode && (renamingHere || requested)
  const endRename = () => {
    setRenaming(false)
    if (requested) renameRequest(runtime).set(null)
  }
  const typeLabel = runtime.blockLabel(block.type)
  const name = blockName(block, typeLabel)
  const kind = typeName(block, typeLabel)
  // The type shows under a custom name. The category is only for the Blocks tab: here it would
  // repeat the "Content" tab right below.
  const sub = block.label ? kind : null
  const tag = typeof block.props?.as === 'string' && block.props.as !== 'div' ? `<${block.props.as}>` : null

  return (
    <div className="builder-editor__block-head">
      <span className="builder-editor__block-icon">
        <BlockIcon name={runtime.blockIcon(block.type)} size={16} />
      </span>
      <span className="builder-editor__block-name">
        {renaming ? (
          <RenameInput block={block} placeholder={kind} onDone={endRename} />
        ) : contentMode ? (
          <span className="builder-editor__block-title">{name}</span>
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
  // The block's parts (styled slots and `parts` entries) are style targets next to the block.
  const parts = blockParts(def)
  const [target, setTarget] = useState<string | null>(null)
  const part = target && parts.some(({ name }) => name === target) ? target : null
  const blockStyles = def?.styles !== false

  return (
    <div className="builder-editor__fields">
      {parts.length > 0 && (
        <Select
          aria-label="Style target"
          emptyLabel={blockStyles ? 'This block' : undefined}
          placeholder="Pick a part"
          value={part}
          onValueChange={setTarget}
          options={parts.map(({ name, label }) => ({
            value: name,
            label,
            ...(block.partClassName?.[name] ? { suffix: <span className="builder-styles__dot" aria-label="has classes" /> } : {}),
          }))}
        />
      )}
      {part ? (
        <StylesPanel key={part} block={block} part={part} />
      ) : !blockStyles ? (
        <p className="builder-editor__hint">This block has no style controls.</p>
      ) : (
        <StylesPanel block={block} />
      )}
    </div>
  )
}

/**
 * The block's HTML attributes (`block.attrs`): an id for "#id" links, an ARIA label and
 * aria-hidden. The id is stored only when it is valid and no other block of the page has it.
 */
function AdvancedFields({ block }: { block: Block }) {
  const runtime = useRuntime()
  const def = getBlockDefinition(runtime.config.blocks, block.type)
  const layout = useEditor(runtime.store, (s) => s.layout)
  const stored = block.attrs?.id ?? ''
  // `source` is the stored id the draft belongs to: another stored id (undo, AI edit) replaces the draft.
  const [draft, setDraft] = useState({ text: stored, source: stored })
  if (draft.source !== stored) setDraft({ text: stored, source: stored })
  const idProblem = (text: string): string | null => {
    if (!text) return null
    const owner = htmlIdsOf(layout.blocks).get(text)
    if (owner && owner !== block.id) return `Another block of this page has the id "${text}".`
    return htmlIdProblem(text)
  }
  const problem = idProblem(draft.text.trim())
  const setAttr = (attrs: NonNullable<Extract<Operation, { type: 'update' }>['attrs']>) => runtime.store.apply({ type: 'update', id: block.id, attrs })

  return (
    <div className="builder-editor__fields">
      <div>
        <TextInput
          description='Links to this block with "#id", for example "contact".'
          label="HTML id"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const text = e.target.value
            const id = text.trim()
            if (id === stored || idProblem(id)) {
              setDraft({ text, source: stored })
              return
            }
            setDraft({ text, source: id })
            setAttr({ id: id || null })
          }}
          path={`builder.${block.id}.attrs.id`}
          showError={problem !== null}
          value={draft.text}
        />
        {problem && <InputError>{problem}</InputError>}
      </div>
      <TextInput
        description="The name screen readers read, for example for a link that shows only an icon."
        label="ARIA label"
        onChange={(e: ChangeEvent<HTMLInputElement>) => setAttr({ ariaLabel: e.target.value || null })}
        path={`builder.${block.id}.attrs.ariaLabel`}
        value={block.attrs?.ariaLabel ?? ''}
      />
      <div>
        <CheckboxInput
          id={`builder-${block.id}-hidden`}
          name={`builder.${block.id}.hidden`}
          label="Hide at all screen sizes"
          checked={block.hidden === true}
          onToggle={(e: ChangeEvent<HTMLInputElement>) => runtime.store.apply({ type: 'update', id: block.id, hidden: e.target.checked })}
        />
        <p className="field-description">
          The site does not show this block. To hide it on some screens only, open Styles, pick a screen size, and set
          Display to Hidden. That hides it at this size and wider.
        </p>
      </div>
      {def?.slots && Object.keys(def.slots).length > 0 && (
        <div>
          <CheckboxInput
            id={`builder-${block.id}-editable-items`}
            name={`builder.${block.id}.editableItems`}
            label="Editors can add, remove and reorder its items"
            checked={block.editableItems === true}
            onToggle={(e: ChangeEvent<HTMLInputElement>) => runtime.store.apply({ type: 'update', id: block.id, editableItems: e.target.checked })}
          />
          <p className="field-description">For lists like FAQs or team cards. Editors can copy, delete and reorder the items, but not restyle them.</p>
        </div>
      )}
      <CheckboxInput
        id={`builder-${block.id}-aria-hidden`}
        name={`builder.${block.id}.attrs.ariaHidden`}
        label="Hide from screen readers"
        checked={block.attrs?.ariaHidden === true}
        onToggle={(e: ChangeEvent<HTMLInputElement>) => setAttr({ ariaHidden: e.target.checked || null })}
      />
    </div>
  )
}

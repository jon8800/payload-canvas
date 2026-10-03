'use client'

import { CheckboxInput, RenderFields, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useMemo, useState, type ChangeEvent } from 'react'
import type { ClientField } from 'payload'

import { findBlock, findLocation, getBlockDefinition } from '../../core'
import type { Block } from '../../core/types'
import { copySelection, duplicateBlock, removeBlock, toggleHidden } from './actions'
import { BlockIcon, Icon, type IconName } from './icons'
import { BlockContentFields } from './renderField'
import { useRuntime } from './runtime'
import { shortcutList } from './shortcuts'
import { useEditor } from './store'
import { Popover, usePopover } from './styles/popover'
import { StylesPanel } from './styles/StylesPanel'
import { useValue } from './valueStore'

type TabsProps<T extends string> = {
  value: T
  options: { id: T; label: string }[]
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
  const setTab = runtime.inspectorTab.set
  return (
    <div ref={inspectorRef} className="builder-editor__inspector">
      <div className="builder-editor__inspector-head">
        <Tabs
          value={tab}
          onChange={setTab}
          variant="segmented"
          options={[
            { id: 'block', label: 'Block' },
            { id: 'document', label: 'Document' },
          ]}
        />
      </div>
      {/* The Document pane stays mounted so its form fields keep their state. */}
      <div className="builder-editor__inspector-body" hidden={tab !== 'block'}>
        <BlockPane />
      </div>
      <div className="builder-editor__inspector-body builder-editor__document" hidden={tab !== 'document'}>
        <DocumentPane />
      </div>
    </div>
  )
}

function EmptyState() {
  const tips = shortcutList().filter((s) => ['Copy block', 'Paste into or after the selection', 'Undo', 'Show this list'].includes(s.label))
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
            <dt>{label === 'Paste into or after the selection' ? 'Paste' : label === 'Show this list' ? 'All shortcuts' : label}</dt>
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
  const block = useEditor(runtime.store, (s) => (s.selectedId ? findBlock(s.layout, s.selectedId) : null))
  const [tab, setTab] = useState<'content' | 'styles'>('content')

  if (!block) return <EmptyState />

  return (
    // `key` remounts the inputs per block, so input state (loaded documents) never leaks between blocks.
    <div key={block.id} className="builder-editor__block-pane">
      <BlockHeader block={block} />
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

function BlockHeader({ block }: { block: Block }) {
  const runtime = useRuntime()
  const def = getBlockDefinition(runtime.config.blocks, block.type)
  const menu = usePopover('auto')
  const parentId = useEditor(runtime.store, (s) => findLocation(s.layout, block.id)?.parentId ?? null)

  const items: { icon: IconName; label: string; run: () => void; disabled?: boolean; danger?: boolean }[] = [
    { icon: 'parent', label: 'Select parent', disabled: !parentId, run: () => parentId && runtime.store.select(parentId) },
    { icon: 'duplicate', label: 'Duplicate', run: () => duplicateBlock(runtime, block.id) },
    { icon: 'copy', label: 'Copy block', run: () => copySelection(runtime) },
    {
      icon: block.hidden ? 'eye' : 'eyeOff',
      label: block.hidden ? 'Show on the site' : 'Hide on the site',
      run: () => toggleHidden(runtime, block.id),
    },
    {
      icon: 'hash',
      label: 'Copy block ID',
      run: () => {
        void navigator.clipboard?.writeText(block.id).then(
          () => runtime.notify(`Copied ID ${block.id}`),
          () => runtime.notify(`Block ID: ${block.id}`),
        )
      },
    },
    { icon: 'delete', label: 'Delete', danger: true, run: () => removeBlock(runtime, block.id) },
  ]

  return (
    <div className="builder-editor__block-head">
      <span className="builder-editor__block-icon">
        <BlockIcon name={runtime.blockIcon(block.type)} size={16} />
      </span>
      <span className="builder-editor__block-name">
        <span className="builder-editor__block-title">{runtime.blockLabel(block.type)}</span>
        {def?.category && <span className="builder-editor__block-sub">{def.category}</span>}
      </span>
      {block.hidden && (
        <span className="builder-editor__pill" title="Hidden on the site">
          <Icon name="eyeOff" size={12} /> Hidden
        </span>
      )}
      <button
        type="button"
        className="builder-editor__icon-button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        data-tooltip="More actions"
        onClick={(e) => menu.toggle(e.currentTarget)}
      >
        <Icon name="more" />
      </button>
      <Popover {...menu.props} className="builder-editor__menu" label="Block actions">
        <div role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`builder-editor__menu-item${item.danger ? ' builder-editor__menu-item--danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                menu.hide()
                item.run()
              }}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          ))}
          <p className="builder-editor__menu-meta">
            ID <code>{block.id}</code>
          </p>
        </div>
      </Popover>
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

/** Marks the layout field as `admin.disabled`. Keeps array positions, so index paths stay valid. */
function disableField(fields: ClientField[], name: string): ClientField[] {
  return fields.map((field) => {
    if ('name' in field && field.name === name) {
      return { ...field, admin: { ...field.admin, disabled: true } } as ClientField
    }
    if (field.type === 'tabs') {
      return { ...field, tabs: field.tabs.map((tab) => ('name' in tab ? tab : { ...tab, fields: disableField(tab.fields, name) })) }
    }
    if ('fields' in field && Array.isArray(field.fields) && !('name' in field)) {
      return { ...field, fields: disableField(field.fields, name) } as ClientField
    }
    return field
  })
}

/** The document's other fields (title, SEO, …), bound to Payload's own form. */
function DocumentPane() {
  const runtime = useRuntime()
  const { config } = runtime
  const { isTemplate } = useValue(runtime.template)
  const { collectionSlug, docPermissions } = useDocumentInfo()
  const { getEntityConfig } = useConfig()
  const fields = useMemo(
    () => disableField(getEntityConfig({ collectionSlug })?.fields ?? [], config.field),
    [collectionSlug, getEntityConfig, config.field],
  )

  return (
    <>
      <p className="builder-editor__hint builder-editor__document-intro">
        {isTemplate
          ? 'Template settings: the collection it is for and the default preview document. Changes save with the template.'
          : 'Page settings. Changes save with the page, like in the Edit tab.'}
      </p>
      <RenderFields
        fields={fields}
        forceRender
        parentIndexPath=""
        parentPath=""
        parentSchemaPath={collectionSlug ?? ''}
        permissions={docPermissions?.fields ?? {}}
      />
    </>
  )
}

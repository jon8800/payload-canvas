'use client'

import { CheckboxInput, RenderFields, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useMemo, useState, type ChangeEvent } from 'react'
import type { ClientField } from 'payload'

import { findBlock, getBlockDefinition } from '../../core'
import type { Block } from '../../core/types'
import { BlockContentFields } from './renderField'
import { useRuntime } from './runtime'
import { useEditor } from './store'
import { StylesPanel } from './styles/StylesPanel'

type TabsProps<T extends string> = { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void }

function Tabs<T extends string>({ value, options, onChange }: TabsProps<T>) {
  return (
    <div className="builder-editor__tabs" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className="builder-editor__tab"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Inspector() {
  const [tab, setTab] = useState<'block' | 'document'>('block')
  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'block', label: 'Block' },
          { id: 'document', label: 'Document' },
        ]}
      />
      {/* The Document pane stays mounted so its form fields keep their state. */}
      <div className="builder-editor__inspector-body" hidden={tab !== 'block'}>
        <BlockPane />
      </div>
      <div className="builder-editor__inspector-body" hidden={tab !== 'document'}>
        <DocumentPane />
      </div>
    </>
  )
}

function BlockPane() {
  const runtime = useRuntime()
  const block = useEditor(runtime.store, (s) => (s.selectedId ? findBlock(s.layout, s.selectedId) : null))
  const [tab, setTab] = useState<'content' | 'styles'>('content')

  if (!block) return <p className="builder-editor__hint">Select a block on the canvas or in the outline.</p>

  return (
    // `key` remounts the inputs per block, so input state (loaded documents) never leaks between blocks.
    <div key={block.id} className="builder-editor__block-pane">
      <p className="builder-editor__block-title">
        {runtime.blockLabel(block.type)} <span>{block.id}</span>
      </p>
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
  const { config } = useRuntime()
  const { collectionSlug, docPermissions } = useDocumentInfo()
  const { getEntityConfig } = useConfig()
  const fields = useMemo(
    () => disableField(getEntityConfig({ collectionSlug })?.fields ?? [], config.field),
    [collectionSlug, getEntityConfig, config.field],
  )

  return (
    <RenderFields
      fields={fields}
      forceRender
      parentIndexPath=""
      parentPath=""
      parentSchemaPath={collectionSlug ?? ''}
      permissions={docPermissions?.fields ?? {}}
    />
  )
}

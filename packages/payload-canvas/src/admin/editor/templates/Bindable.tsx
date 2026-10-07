'use client'

// Data binding in the block inspector: the "bind" button next to bindable props, the bound chip
// with a live sample value, the Field block's field picker and the collection list's inputs.

import { FieldLabel, SelectInput, TextInput, useConfig } from '@payloadcms/ui'
import { createContext, use, useCallback, useState, type ChangeEvent, type ReactNode } from 'react'
import type { Field, OptionObject } from 'payload'

import { isLinkField } from '../../../blocks/link'
import { getBlockDefinition, propField } from '../../../core'
import type { BindingField, Block, BlockDefinition } from '../../../core/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { usePopover } from '../styles/popover'
import { useValue } from '../valueStore'
import {
  bindingTrail,
  docTitle,
  FIELD_BLOCK,
  findBindingField,
  hasBindableField,
  isCompatible,
  isFieldBlockSource,
  isObviousPath,
  LIST_BLOCK,
  listAncestor,
  previewValue,
  propKind,
  propPathOf,
  URL_PATH,
  urlField,
  valueAt,
  type PropKind,
} from './binding'
import { FieldPicker, fieldIcon } from './FieldPicker'
import { useCollectionLabel, useListSample, useTitleField } from './useTemplate'
import './templates.scss'

/** Where the selected block's bindings read from: the template's document, or each list item. */
export type BindingScope = {
  kind: 'template' | 'list'
  /** Null when the template has no target yet, or the list has no collection. */
  collection: string | null
  fields: BindingField[]
  /** The document previews read from: the template's sample, or the list's first item. */
  sample: Record<string, unknown> | null
  sampleTitle: string
  loading: boolean
}

type ScopeContext = { block: Block; def: BlockDefinition | undefined; prefix: string; scope: BindingScope | null }

const BindingScopeContext = createContext<ScopeContext | null>(null)

/** The sources plus the `$url` field, unless the plugin already lists it. */
function withUrl(kind: 'template' | 'list', fields: BindingField[]): BindingField[] {
  return fields.some((f) => f.path === URL_PATH) ? fields : [urlField(kind), ...fields]
}

/** The binding scope of a block, or null when nothing can be bound (a normal page, outside lists). */
export function useBindingScope(block: Block): BindingScope | null {
  const runtime = useRuntime()
  const list = useEditor(runtime.store, (s) => listAncestor(s.layout, block.id))
  const template = useValue(runtime.template)
  const sources = runtime.config.templates?.sources ?? {}
  const listCollection = typeof list?.props?.collection === 'string' && list.props.collection ? list.props.collection : null
  const listSort = typeof list?.props?.sort === 'string' && list.props.sort ? list.props.sort : undefined
  const listTitle = useTitleField(listCollection)
  // Same rule as the renderer: a list of the template's own collection leaves out the current document.
  const exclude =
    list?.props?.excludeCurrent !== false && template.isTemplate && template.target === listCollection ? template.sample?.id : undefined
  const locale = useEditor(runtime.store, (s) => s.locale)
  const listSample = useListSample(runtime.api, list ? listCollection : null, listSort, exclude, locale)

  if (list) {
    return {
      kind: 'list',
      collection: listCollection,
      fields: listCollection ? withUrl('list', sources[listCollection] ?? []) : [],
      sample: listSample.doc,
      sampleTitle: listSample.doc ? docTitle(listSample.doc, listTitle) : '',
      loading: listSample.loading,
    }
  }
  if (!template.isTemplate) return null
  return {
    kind: 'template',
    collection: template.target,
    fields: template.target ? withUrl('template', sources[template.target] ?? []) : [],
    sample: template.sample?.doc ?? null,
    sampleTitle: template.sample?.title ?? '',
    loading: template.status === 'loading',
  }
}

/** Wraps a block's content fields: every field below can show binding controls. */
export function BindingScopeProvider({ block, prefix, children }: { block: Block; prefix: string; children: ReactNode }) {
  const runtime = useRuntime()
  const scope = useBindingScope(block)
  const def = getBlockDefinition(runtime.config.blocks, block.type)
  return (
    <BindingScopeContext value={{ block, def, prefix, scope }}>
      <ScopeBanner block={block} scope={scope} />
      {children}
    </BindingScopeContext>
  )
}

type SlotProps = {
  field: Field
  path: string
  value: unknown
  onChange: (value: unknown) => void
  label: string
  /** The normal input for the field. */
  children: ReactNode
}

/**
 * One inspector field. Shows the normal input, plus a bind button when the prop can bind; the
 * bound chip when it is bound; or a special input for the Field block and the collection list.
 */
export function FieldSlot(props: SlotProps) {
  const ctx = use(BindingScopeContext)
  if (!ctx) return props.children
  const propPath = propPathOf(ctx.prefix, props.path)
  if (!propPath) return props.children
  const { block, def, scope } = ctx

  if (block.type === FIELD_BLOCK && propPath === 'path') return <FieldPathInput {...props} scope={scope} />
  if (block.type === LIST_BLOCK && propPath === 'collection') return <ListCollectionInput {...props} />
  if (block.type === LIST_BLOCK && propPath === 'sort') return <ListSortInput {...props} block={block} />
  if (block.type === FIELD_BLOCK || block.type === LIST_BLOCK) return props.children

  const kind = propKind(props.field as { type: string; hasMany?: boolean })
  if (!kind) return props.children
  const bound = block.bindings?.[propPath]
  if (bound) return <BoundField {...props} block={block} propPath={propPath} bound={bound} kind={kind} scope={scope} />
  if (!scope?.collection) return props.children
  // A link group binds as a whole (to a URL), so its own URL input gets no second bind button.
  if (def && propPath.includes('.') && isLinkField(propField(def.fields as unknown[], propPath.slice(0, propPath.lastIndexOf('.'))))) {
    return props.children
  }
  return (
    <div className="builder-bind">
      {props.children}
      <BindButton block={block} propPath={propPath} kind={kind} scope={scope} field={props.field} label={props.label} />
    </div>
  )
}

function scopeTitle(scope: BindingScope, collectionLabel: string): string {
  return scope.kind === 'list' ? `Fields of each item · ${collectionLabel}` : `Fields of ${collectionLabel}`
}

const KIND_NAMES: Record<PropKind, string> = {
  text: 'text',
  link: 'URL',
  richText: 'rich text',
  upload: 'upload',
  number: 'number',
  date: 'date',
  relationship: 'relationship',
  any: '',
}

/** The compatible-field filter for a prop. Stable per prop, so the picker's rows memoize. */
function useAccept(kind: PropKind, field: Field) {
  const relationTo = 'relationTo' in field ? (field.relationTo as string | string[]) : undefined
  return useCallback((source: BindingField) => isCompatible(kind, source, { type: field.type, relationTo }), [kind, field.type, relationTo])
}

function useBind(block: Block, propPath: string, propLabel: string) {
  const runtime = useRuntime()
  return (source: BindingField | null) => {
    const done = runtime.store.apply({ type: 'update', id: block.id, bindings: { [propPath]: source ? source.path : null } })
    if (done) runtime.notify(source ? `${propLabel} now shows ${source.label}` : `${propLabel} is no longer bound`)
  }
}

function BindButton({
  block,
  propPath,
  kind,
  scope,
  field,
  label,
}: {
  block: Block
  propPath: string
  kind: PropKind
  scope: BindingScope
  field: Field
  label: string
}) {
  const popover = usePopover('auto')
  const accept = useAccept(kind, field)
  const bind = useBind(block, propPath, label)
  const collectionLabel = useCollectionLabel(scope.collection)
  return (
    <>
      <button
        type="button"
        className="builder-bind__button"
        aria-label={`Bind ${label} to a field`}
        aria-haspopup="listbox"
        aria-expanded={popover.open}
        data-tooltip="Bind to a field"
        onClick={(e) => popover.toggle(e.currentTarget)}
      >
        <Icon name="bind" size={13} />
      </button>
      <FieldPicker
        popover={popover}
        title={scopeTitle(scope, collectionLabel)}
        fields={scope.fields}
        accept={accept}
        sample={scope.sample}
        current={null}
        emptyText={`${collectionLabel} has no ${KIND_NAMES[kind]} fields.`}
        onPick={bind}
      />
    </>
  )
}

function BoundField({
  field,
  label,
  children,
  block,
  propPath,
  bound,
  kind,
  scope,
}: SlotProps & { block: Block; propPath: string; bound: string; kind: PropKind; scope: BindingScope | null }) {
  const popover = usePopover('auto')
  const accept = useAccept(kind, field)
  const bind = useBind(block, propPath, label)
  const collectionLabel = useCollectionLabel(scope?.collection ?? null)
  const [showFallback, setShowFallback] = useState(false)
  const fields = scope?.collection ? scope.fields : [urlField(scope?.kind ?? 'list')]
  const source = findBindingField(fields, bound)
  const trail = source ? bindingTrail(fields, bound) : bound.split('.')
  const required = 'required' in field ? Boolean(field.required) : false

  return (
    <div className="builder-bind builder-bind--bound field-type">
      {/* Visual label only: the button below and the fallback input carry the accessible names. */}
      <div aria-hidden="true">
        <FieldLabel as="span" label={label} required={required} />
      </div>
      <div className={`builder-bind__chip${source ? '' : ' builder-bind__chip--missing'}`}>
        <button
          type="button"
          className="builder-bind__chip-main"
          aria-haspopup="listbox"
          aria-expanded={popover.open}
          disabled={!scope?.collection}
          aria-label={`${label} shows ${trail.join(' › ')}${scope?.collection ? '. Change the field' : ''}`}
          title={scope?.collection ? 'Change the field' : undefined}
          onClick={(e) => popover.toggle(e.currentTarget.parentElement ?? e.currentTarget)}
        >
          <Icon name={source ? fieldIcon(source) : 'warning'} size={13} />
          <span className="builder-bind__chip-label">{trail.join(' › ')}</span>
          {!isObviousPath(source?.label ?? '', bound) && <code className="builder-bind__chip-path">{bound}</code>}
        </button>
        <button type="button" className="builder-bind__chip-x" aria-label="Unbind" data-tooltip="Unbind" onClick={() => bind(null)}>
          <Icon name="close" size={12} />
        </button>
      </div>
      {source ? (
        <SamplePreview scope={scope} source={source} />
      ) : (
        <p className="builder-bind__note builder-bind__note--warn">
          {scope?.collection
            ? `${collectionLabel} has no field “${bound}”. The fallback shows instead.`
            : 'This block is not inside a template or a collection list, so the binding has no data. Unbind it or move the block.'}
        </p>
      )}
      <button
        type="button"
        className="builder-bind__fallback-toggle"
        aria-expanded={showFallback}
        onClick={() => setShowFallback(!showFallback)}
      >
        <Icon name={showFallback ? 'chevronDown' : 'chevronRight'} size={12} />
        Fallback when the field is empty
      </button>
      {showFallback && <div className="builder-bind__fallback">{children}</div>}
      {scope?.collection && (
        <FieldPicker
          popover={popover}
          title={scopeTitle(scope, collectionLabel)}
          fields={scope.fields}
          accept={accept}
          sample={scope.sample}
          current={bound}
          emptyText={`${collectionLabel} has no ${KIND_NAMES[kind]} fields.`}
          onPick={bind}
        />
      )}
    </div>
  )
}

/** The sample document's value for a bound field: text, an image, or a note when it is empty. */
export function SamplePreview({ scope, source }: { scope: BindingScope | null; source: BindingField }) {
  if (source.path === URL_PATH) {
    return (
      <p className="builder-bind__note">
        {scope?.kind === 'template' ? 'Links to the document’s own page.' : 'Links to each item’s page.'}
      </p>
    )
  }
  if (!scope || scope.loading) return <p className="builder-bind__note">Loading the sample…</p>
  if (!scope.sample) {
    return (
      <p className="builder-bind__note">
        {scope.kind === 'list' ? 'The list has no items yet.' : 'No sample document to preview.'}
      </p>
    )
  }
  const preview = previewValue(valueAt(scope.sample, source.path), source.type)
  const from = scope.kind === 'list' ? 'First item' : 'Sample'
  return (
    <div className="builder-bind__preview">
      <span className="builder-bind__preview-from" title={scope.sampleTitle}>
        {from}: {scope.sampleTitle || 'untitled'}
      </span>
      {preview.kind === 'text' && <span className="builder-bind__preview-text">{preview.text}</span>}
      {preview.kind === 'image' && (
        // oxlint-disable-next-line nextjs/no-img-element -- admin preview of an upload URL
        <img className="builder-bind__preview-image" src={preview.url} alt={preview.alt} />
      )}
      {preview.kind === 'empty' && <span className="builder-bind__preview-empty">Empty here. The fallback shows instead.</span>}
    </div>
  )
}

/** The Field block's `path`: picks any field of the scope's document. */
function FieldPathInput({ value, onChange, label, children, scope }: SlotProps & { scope: BindingScope | null }) {
  const popover = usePopover('auto')
  const accept = isFieldBlockSource
  const collectionLabel = useCollectionLabel(scope?.collection ?? null)
  const path = typeof value === 'string' && value ? value : null

  if (!scope?.collection) {
    return (
      <div className="builder-bind__stack">
        <p className="builder-bind__note">
          {scope?.kind === 'list'
            ? 'Choose the list’s collection first. Then pick the field each item shows.'
            : scope?.kind === 'template'
              ? 'Choose which collection this template is for. Then pick a field here.'
              : 'A Field block shows a field of the template’s document or of each list item. Use it in a template or inside a collection list.'}
        </p>
        {children}
      </div>
    )
  }

  const source = path ? findBindingField(scope.fields, path) : null
  const trail = path ? bindingTrail(scope.fields, path) : []
  return (
    <div className="field-type builder-bind">
      <FieldLabel as="span" label={label} required />
      <button
        type="button"
        className={`builder-bind__select${path && !source ? ' builder-bind__select--missing' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={popover.open}
        onClick={(e) => popover.toggle(e.currentTarget)}
      >
        {path ? (
          <>
            <Icon name={source ? fieldIcon(source) : 'warning'} size={13} />
            <span className="builder-bind__chip-label">{trail.join(' › ')}</span>
            {!isObviousPath(source?.label ?? '', path) && <code className="builder-bind__chip-path">{path}</code>}
          </>
        ) : (
          <span className="builder-bind__placeholder">Choose a field…</span>
        )}
        <Icon name="chevronDown" size={12} className="builder-bind__select-caret" />
      </button>
      {source && <SamplePreview scope={scope} source={source} />}
      {path && !source && <p className="builder-bind__note builder-bind__note--warn">{collectionLabel} has no field “{path}”.</p>}
      <FieldPicker
        popover={popover}
        title={scopeTitle(scope, collectionLabel)}
        fields={scope.fields.filter((f) => f.path !== URL_PATH)}
        accept={accept}
        sample={scope.sample}
        current={path}
        emptyText={`${collectionLabel} has no fields.`}
        onPick={(picked) => onChange(picked.path)}
      />
    </div>
  )
}

/** Collection list: which collection it lists. Only collections with binding sources. */
function ListCollectionInput({ value, onChange, label, path, field }: SlotProps) {
  const runtime = useRuntime()
  const { getEntityConfig } = useConfig()
  // The plugin turns the field into a select of the collections that have a URL. Else: every binding source.
  const fieldOptions = field.type === 'select' ? field.options.map((o) => (typeof o === 'string' ? o : o.value)) : []
  const slugs = fieldOptions.length > 0 ? fieldOptions : Object.keys(runtime.config.templates?.sources ?? {})
  const options: OptionObject[] = slugs.map((slug) => {
    const labels = getEntityConfig({ collectionSlug: slug })?.labels as { plural?: unknown } | undefined
    return { label: typeof labels?.plural === 'string' ? labels.plural : slug, value: slug }
  })
  if (options.length === 0) {
    return <p className="builder-bind__note">No collection can be listed. Turn on templates for a collection in the plugin options.</p>
  }
  return (
    <SelectInput
      label={label}
      name={'name' in field ? field.name : 'collection'}
      path={path}
      required
      options={options}
      value={typeof value === 'string' ? value : undefined}
      onChange={(option: { value: unknown } | { value: unknown }[] | null) => onChange(Array.isArray(option) ? null : (option?.value ?? null))}
    />
  )
}

const CUSTOM = '__custom'

/** Collection list: sort presets (newest, oldest, title A–Z and Z–A) and a custom sort field. */
function ListSortInput({ value, onChange, label, path, field, block }: SlotProps & { block: Block }) {
  const collection = typeof block.props?.collection === 'string' ? block.props.collection : null
  const titleField = useTitleField(collection) ?? 'title'
  const current = typeof value === 'string' ? value : ''
  const presets: OptionObject[] = [
    { label: 'Newest first', value: '-createdAt' },
    { label: 'Oldest first', value: 'createdAt' },
    { label: 'Title A–Z', value: titleField },
    { label: 'Title Z–A', value: `-${titleField}` },
  ]
  const isPreset = presets.some((p) => p.value === current)
  const [custom, setCustom] = useState(() => current !== '' && !isPreset)
  const selected = custom || (current !== '' && !isPreset) ? CUSTOM : current || undefined

  return (
    <div className="builder-bind__stack">
      <SelectInput
        label={label}
        name={'name' in field ? field.name : 'sort'}
        path={path}
        options={[...presets, { label: 'Custom…', value: CUSTOM }]}
        value={selected}
        onChange={(option: { value: unknown } | { value: unknown }[] | null) => {
          const next = Array.isArray(option) ? null : (option?.value ?? null)
          if (next === CUSTOM) {
            setCustom(true)
            return
          }
          setCustom(false)
          onChange(next)
        }}
      />
      {selected === CUSTOM && (
        <TextInput
          label="Sort by field"
          description="A field name. Start with - for descending, e.g. -publishedAt."
          path={`${path}.custom`}
          value={current}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value.trim() || null)}
        />
      )}
    </div>
  )
}

/** A one-line explanation above a bindable block's fields: what bindings read from, or what is missing. */
function ScopeBanner({ block, scope }: { block: Block; scope: BindingScope | null }) {
  const runtime = useRuntime()
  const collectionLabel = useCollectionLabel(scope?.collection ?? null)
  const singular = useCollectionLabel(scope?.collection ?? null, 'singular')
  if (!scope || block.type === FIELD_BLOCK || block.type === LIST_BLOCK) return null
  const def = getBlockDefinition(runtime.config.blocks, block.type)
  if (!def || !hasBindableField(def.fields as Parameters<typeof hasBindableField>[0])) return null

  if (scope.kind === 'template' && !scope.collection) {
    return (
      <div className="builder-bind__banner builder-bind__banner--warn">
        <Icon name="warning" size={14} />
        <div>
          <p>Choose which collection this template is for. Then you can bind this block to its fields.</p>
          <button type="button" className="builder-bind__link" onClick={runtime.doc.openSettings}>
            Open the template settings
          </button>
        </div>
      </div>
    )
  }
  if (scope.kind === 'list' && !scope.collection) {
    return (
      <div className="builder-bind__banner builder-bind__banner--warn">
        <Icon name="collectionList" size={14} />
        <p>This block is inside a collection list. Choose the list’s collection to bind fields of each item.</p>
      </div>
    )
  }
  return (
    <div className="builder-bind__banner">
      <Icon name={scope.kind === 'list' ? 'collectionList' : 'template'} size={14} />
      <p>
        {scope.kind === 'list' ? `Repeats for each ${singular.toLowerCase() || 'item'} in the list. ` : `Template for ${collectionLabel}. `}
        Use <Icon name="bind" size={12} className="builder-bind__inline-icon" /> next to a field to show{' '}
        {scope.kind === 'list' ? 'the item’s' : 'the document’s'} data.
      </p>
    </div>
  )
}

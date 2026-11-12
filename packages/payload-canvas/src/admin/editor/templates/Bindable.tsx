'use client'

// Data binding in the block inspector: the "bind" button next to bindable props, the bound chip
// with a live sample value and a format picker, the Field block's field picker and the collection
// list's inputs.

import { FieldLabel, SelectInput, useConfig } from '@payloadcms/ui'
import { createContext, use, useCallback, useState, type ReactNode } from 'react'
import type { Field, OptionObject } from 'payload'

import { isLinkField } from '../../../blocks/link'
import {
  BINDING_FORMATTER_INFO,
  bindingFromParts,
  bindingParts,
  bindingValue,
  COLLECTION_LIST_BLOCK,
  getBlockDefinition,
  itemSources,
  listItemContext,
  propField,
  repeatAncestors,
  repeatRowContext,
  repeatRows,
} from '../../../core'
import type { BindingFormat } from '../../../core/bindings'
import type { BindingField, Block, BlockDefinition, TemplateContext } from '../../../core/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { usePopover } from '../styles/popover'
import { Select } from '../ui/Select'
import { useValue } from '../valueStore'
import {
  bindingTrail,
  docTitle,
  FIELD_BLOCK,
  REPEAT_BLOCK,
  findBindingField,
  hasBindableField,
  isCompatible,
  isFieldBlockSource,
  isRepeatSource,
  isObviousPath,
  LIST_BLOCK,
  previewDoc,
  previewValue,
  propKind,
  propPathOf,
  URL_PATH,
  urlField,
  valueAt,
  type PropKind,
} from './binding'
import { propertyOf } from '../../../core/components'
import { editsSection, propertyTypeOf } from '../sections/components'
import { PropertySlot, VisibleProperty } from '../sections/PropertyControls'
import { FieldPicker, fieldIcon } from './FieldPicker'
import { useCollectionLabel, useListSample, useTitleField } from './useTemplate'
import './templates.css'

/** Where the selected block's bindings read from: the template's document, each list item, or each repeat row. */
export type BindingScope = {
  kind: 'template' | 'list' | 'row'
  /** Null when the template has no target yet, or the list has no collection. */
  collection: string | null
  fields: BindingField[]
  /** The document previews read from: the template's sample, the list's first item, or the first row (`previewDoc`). */
  sample: Record<string, unknown> | null
  /** The same sample as a binding context, for expression previews. */
  context: TemplateContext | null
  sampleTitle: string
  loading: boolean
  /** Repeats only: the field whose rows repeat, e.g. "faqs". */
  rowPath?: string
}

type ScopeContext = { block: Block; def: BlockDefinition | undefined; prefix: string; scope: BindingScope | null }

const BindingScopeContext = createContext<ScopeContext | null>(null)

/** The sources plus the `$url` field, unless the plugin already lists it. */
function withUrl(kind: 'template' | 'list' | 'row', fields: BindingField[]): BindingField[] {
  return fields.some((f) => f.path === URL_PATH) ? fields : [urlField(kind), ...fields]
}

const sameBlocks = (a: Block[], b: Block[]) => a.length === b.length && a.every((block, i) => block === b[i])

/**
 * The binding scope of a block, or null when nothing can be bound (a normal page, outside lists).
 * Inside repeats the scope narrows to the row: the row's fields, `$item`, `$index`, `$parent` and
 * `$page`, and the first row of the sample.
 */
export function useBindingScope(block: Block): BindingScope | null {
  const runtime = useRuntime()
  const template = useValue(runtime.template)
  const repeats = useEditor(runtime.store, (s) => repeatAncestors(s.layout, block.id), sameBlocks)
  const nearest = repeats.findLastIndex((b) => b.type === COLLECTION_LIST_BLOCK)
  const scope = useOuterScope(block, nearest >= 0 ? repeats[nearest]! : null)
  const rows = repeats.slice(nearest + 1)
  if (!scope || rows.length === 0) return scope
  const sources = runtime.config.templates?.sources ?? {}
  const page = template.isTemplate && template.target ? sources[template.target] : undefined
  let fields: BindingField[] | undefined = scope.fields
  let context = scope.context
  for (const row of rows) {
    fields = itemSources(row, fields, sources, page)
    const first = context ? repeatRows(context, row.props)[0] : undefined
    const collection = typeof row.props?.collection === 'string' ? row.props.collection : ''
    context = first === undefined || !context ? null : repeatRowContext(first, 0, context, collection)
  }
  return {
    ...scope,
    kind: 'row',
    fields: fields ?? [],
    sample: context ? previewDoc(context) : null,
    context,
    sampleTitle: context ? docTitle(context.item) : '',
    rowPath: typeof rows.at(-1)?.props?.path === 'string' ? (rows.at(-1)!.props!.path as string) : '',
  }
}

/** The scope of the template or of the nearest collection list around the block. */
function useOuterScope(block: Block, list: Block | null): BindingScope | null {
  const runtime = useRuntime()
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

  const page = template.isTemplate && template.target ? sources[template.target] : undefined
  const pageContext: TemplateContext | null =
    template.isTemplate && template.sample?.doc ? { collection: template.target ?? '', doc: template.sample.doc } : null
  if (list) {
    const context = listSample.doc ? listItemContext(listSample.doc, 0, pageContext, listCollection ?? '') : null
    return {
      kind: 'list',
      collection: listCollection,
      fields: listCollection ? withUrl('list', itemSources(list, undefined, sources, page) ?? []) : [],
      sample: context ? previewDoc(context) : null,
      context,
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
    context: pageContext,
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
      {!scope && <VisibleProperty block={block} />}
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
  const runtime = useRuntime()
  const ctx = use(BindingScopeContext)
  if (!ctx) return props.children
  const propPath = propPathOf(ctx.prefix, props.path)
  if (!propPath) return props.children
  const { block, def, scope } = ctx

  if (block.type === FIELD_BLOCK && propPath === 'path') return <FieldPathInput {...props} scope={scope} />
  if (block.type === REPEAT_BLOCK && propPath === 'path') return <FieldPathInput {...props} scope={scope} rows />
  if (block.type === LIST_BLOCK && propPath === 'collection') return <ListCollectionInput {...props} />
  if (block.type === FIELD_BLOCK || block.type === LIST_BLOCK || block.type === REPEAT_BLOCK) return props.children

  // A saved section (outside lists): content fields can become the component's properties.
  const inLinkGroup = def && propPath.includes('.') && isLinkField(propField(def.fields as unknown[], propPath.slice(0, propPath.lastIndexOf('.'))))
  const isProperty = propertyOf(block.bindings?.[propPath] ?? '') !== null
  if (!scope && !inLinkGroup && editsSection(runtime) && (isProperty || propertyTypeOf(runtime, block, propPath))) {
    return (
      <PropertySlot block={block} propPath={propPath} label={props.label}>
        {props.children}
      </PropertySlot>
    )
  }

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
  if (scope.kind === 'row') return `Fields of each row · ${scope.rowPath ?? ''}`
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

/** Sets the prop's binding (`null` unbinds). `what` names the new source for the notice; none: no notice. */
function useBind(block: Block, propPath: string, propLabel: string) {
  const runtime = useRuntime()
  return (binding: string | null, what?: string) => {
    const done = runtime.store.apply({ type: 'update', id: block.id, bindings: { [propPath]: binding } })
    if (!done) return
    if (binding === null) runtime.notify(`${propLabel} is no longer bound`)
    else if (what) runtime.notify(`${propLabel} now shows ${what}`)
  }
}

const FORMAT_OPTIONS = Object.entries(BINDING_FORMATTER_INFO).map(([value, info]) => ({ value, label: info.label }))
/** ":" and "|" separate the parts of a binding, so an argument cannot hold them. */
const cleanArg = (text: string) => text.replace(/[:|{}]/g, '')

/**
 * How a bound value shows as text: a formatter (date, number, currency, uppercase, shorten…) and
 * its arguments as small inputs. Writes the binding's `|name:arg` part, so nobody types it.
 */
function FormatPicker({ format, onChange, label }: { format: BindingFormat | null; onChange: (format: BindingFormat | null) => void; label: string }) {
  const info = format ? BINDING_FORMATTER_INFO[format.name] : undefined
  const setArg = (index: number, value: string) => {
    if (!format) return
    const args = [...format.args]
    while (args.length < index) args.push('')
    args[index] = value
    onChange({ ...format, args })
  }
  return (
    <fieldset className="builder-format" aria-label={`${label}: format`}>
      <Select
        className="builder-format__name"
        aria-label={`${label}: format`}
        emptyLabel="No format"
        value={format?.name ?? null}
        options={FORMAT_OPTIONS}
        onValueChange={(name) => onChange(name ? { name, args: [] } : null)}
      />
      {format &&
        info?.args.map((arg, index) => {
          const value = format.args[index] ?? ''
          if (arg.options) {
            const [first, ...rest] = arg.options
            return (
              <Select
                key={arg.label}
                aria-label={`${label}: ${arg.label.toLowerCase()}`}
                emptyLabel={first?.value === '' ? first.label : undefined}
                value={value || null}
                options={first?.value === '' ? rest : [...arg.options]}
                onValueChange={(next) => setArg(index, next ?? '')}
              />
            )
          }
          return (
            <input
              key={arg.label}
              type="text"
              className="builder-where__input"
              aria-label={`${label}: ${arg.label.toLowerCase()}`}
              placeholder={arg.placeholder ? `${arg.label}: ${arg.placeholder}` : arg.label}
              value={value}
              onChange={(e) => setArg(index, cleanArg(e.target.value))}
            />
          )
        })}
    </fieldset>
  )
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
        onPick={(source) => bind(source.path, source.label)}
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
  // One field with at most one formatter shows as the field and a format; templates and fallback
  // chains show as their text.
  const parts = bindingParts(bound)
  const single = parts && parts.paths.length === 1 ? parts.paths[0]! : null
  const expression = single === null
  // In a template, `$page.<path>` is the template's own document.
  const own = single && scope?.kind === 'template' && single.startsWith('$page.') ? single.slice('$page.'.length) : single
  const source = expression ? { path: bound, label: bound, type: 'text' } : findBindingField(fields, own!)
  const trail = source && !expression ? bindingTrail(fields, own!) : [bound]
  const shownPath = single ?? bound
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
          {!isObviousPath(source?.label ?? '', shownPath) && <code className="builder-bind__chip-path">{shownPath}</code>}
        </button>
        <button type="button" className="builder-bind__chip-x" aria-label="Unbind" data-tooltip="Unbind" onClick={() => bind(null)}>
          <Icon name="close" size={12} />
        </button>
      </div>
      {kind === 'text' && parts && (
        <FormatPicker label={label} format={parts.format} onChange={(format) => bind(bindingFromParts({ paths: parts.paths, format }))} />
      )}
      {!expression && !source ? (
        <p className="builder-bind__note builder-bind__note--warn">
          {scope?.collection
            ? `${collectionLabel} has no field “${shownPath}”. The fallback shows instead.`
            : 'No data here: the block is not in a template or a collection list.'}
        </p>
      ) : expression || parts?.format ? (
        <ExpressionPreview scope={scope} binding={bound} />
      ) : (
        source && <SamplePreview scope={scope} source={source} />
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
          current={shownPath}
          emptyText={`${collectionLabel} has no ${KIND_NAMES[kind]} fields.`}
          onPick={(picked) => bind(bindingFromParts({ paths: [picked.path], format: parts?.format ?? null }), picked.label)}
        />
      )}
    </div>
  )
}

/** The sample's value for a binding with a format, a fallback chain or a template string. */
function ExpressionPreview({ scope, binding }: { scope: BindingScope | null; binding: string }) {
  if (!scope?.context) return <p className="builder-bind__note">No sample to preview.</p>
  const text = previewValue(bindingValue(scope.context, binding), 'text')
  return (
    <div className="builder-bind__preview">
      <span className="builder-bind__preview-from" title={scope.sampleTitle}>
        {scope.kind === 'list' ? 'First item' : scope.kind === 'row' ? 'First row' : 'Sample'}: {scope.sampleTitle || 'untitled'}
      </span>
      {text.kind === 'text' ? <span className="builder-bind__preview-text">{text.text}</span> : <span className="builder-bind__preview-empty">Empty here. The fallback shows instead.</span>}
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
        {scope.kind === 'list' ? 'The list has no items yet.' : scope.kind === 'row' ? 'The field has no rows in the sample.' : 'No sample document to preview.'}
      </p>
    )
  }
  const preview = previewValue(valueAt(scope.sample, source.path), source.type)
  const from = scope.kind === 'list' ? 'First item' : scope.kind === 'row' ? 'First row' : 'Sample'
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

/**
 * The Field block's `path`: picks any field of the scope's document, with a format. `rows`: a
 * repeat's path (fields with rows), without a format.
 */
function FieldPathInput({ value, onChange, label, children, scope, rows = false }: SlotProps & { scope: BindingScope | null; rows?: boolean }) {
  const popover = usePopover('auto')
  const accept = rows ? isRepeatSource : isFieldBlockSource
  const collectionLabel = useCollectionLabel(scope?.collection ?? null)
  const stored = typeof value === 'string' && value ? value : null
  // The Field block's path may end in a formatter ("price|currency:EUR"): the picker shows the field.
  const parts = stored && !rows ? bindingParts(stored) : null
  const path = parts && parts.paths.length === 1 ? parts.paths[0]! : stored

  if (!scope?.collection) {
    return (
      <div className="builder-bind__stack">
        <p className="builder-bind__note">
          {scope?.kind === 'list'
            ? 'Choose the list’s collection first.'
            : scope?.kind === 'template'
              ? 'Choose the template’s collection first.'
              : 'Works only in a template or a collection list.'}
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
      {parts && (
        <FormatPicker label={label} format={parts.format} onChange={(format) => onChange(bindingFromParts({ paths: parts.paths, format }))} />
      )}
      {source && (parts?.format ? <ExpressionPreview scope={scope} binding={stored ?? ''} /> : <SamplePreview scope={scope} source={source} />)}
      {path && !source && <p className="builder-bind__note builder-bind__note--warn">{collectionLabel} has no field “{path}”.</p>}
      <FieldPicker
        popover={popover}
        title={scopeTitle(scope, collectionLabel)}
        fields={scope.fields.filter((f) => f.path !== URL_PATH)}
        accept={accept}
        sample={scope.sample}
        current={path}
        emptyText={`${collectionLabel} has no fields.`}
        onPick={(picked) => onChange(rows ? picked.path : bindingFromParts({ paths: [picked.path], format: parts?.format ?? null }))}
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


/** A one-line explanation above a bindable block's fields: what bindings read from, or what is missing. */
function ScopeBanner({ block, scope }: { block: Block; scope: BindingScope | null }) {
  const runtime = useRuntime()
  const collectionLabel = useCollectionLabel(scope?.collection ?? null)
  const singular = useCollectionLabel(scope?.collection ?? null, 'singular')
  if (!scope || block.type === FIELD_BLOCK || block.type === LIST_BLOCK || block.type === REPEAT_BLOCK) return null
  const def = getBlockDefinition(runtime.config.blocks, block.type)
  if (!def || !hasBindableField(def.fields as Parameters<typeof hasBindableField>[0])) return null

  if (scope.kind === 'template' && !scope.collection) {
    return (
      <div className="builder-bind__banner builder-bind__banner--warn">
        <Icon name="warning" size={14} />
        <div>
          <p>Choose the template’s collection first.</p>
          <button type="button" className="builder-bind__link" onClick={() => runtime.doc.openSettings()}>
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
        <p>Choose the list’s collection first.</p>
      </div>
    )
  }
  if (scope.kind === 'row') {
    return (
      <div className="builder-bind__banner">
        <Icon name="collectionList" size={14} />
        <p>
          Repeats for each row of “{scope.rowPath}”. Use <Icon name="bind" size={12} className="builder-bind__inline-icon" /> next
          to a field to show the row’s data.
        </p>
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

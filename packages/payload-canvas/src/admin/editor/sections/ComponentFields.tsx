'use client'

// Components in the inspector. On a copy (a `sectionRef` block): the component's properties as
// normal fields, "Edit component" and how many places use it. In a saved section with
// properties: a banner with the same count. The property buttons are in ./PropertyControls.tsx.

import { useConfig, useRouter, useRouteTransition } from '@payloadcms/ui'
import { useEffect, useMemo } from 'react'
import type { Field } from 'payload'

import { SECTION_REF_VALUES, sectionRefId } from '../../../blocks/builtins/sectionRef'
import {
  componentProperties,
  componentValuesOf,
  fieldValue,
  storedValue,
  toPlainText,
  type ComponentProperty,
  type ComponentValues,
} from '../../../core'
import type { Block } from '../../../core/types'
import { useContentMode } from '../contentMode'
import { Icon } from '../icons'
import { editSectionPath } from '../Library'
import { RenderBlockFields } from '../renderField'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import { editsSection, usedInText, useOwnProperties, useUsedIn } from './components'
import './components.css'

/** The input of a property on a copy: the bound field, named after the property, never required. */
function propertyField(property: ComponentProperty): Field {
  if (property.type === 'visible') return { name: property.name, label: property.label, type: 'checkbox' } as Field
  const base = (property.field ?? { type: 'json' }) as Record<string, unknown>
  const { defaultValue: _default, required: _required, localized: _localized, validate: _validate, ...rest } = base
  const admin = { ...(base.admin as Record<string, unknown> | undefined) }
  delete admin.condition
  delete admin.description
  if (admin.custom && typeof admin.custom === 'object') {
    const { builderCondition: _condition, ...custom } = admin.custom as Record<string, unknown>
    admin.custom = custom
  }
  if (property.type === 'text') admin.placeholder = toPlainText(property.default) ?? ''
  return { ...rest, name: property.name, label: property.label, admin } as unknown as Field
}

/** What the property inputs show: the copy's values, and for "visible" the master's state. */
function inputData(properties: readonly ComponentProperty[], values: ComponentValues): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const property of properties) {
    const value = property.type === 'visible' ? (values[property.name] ?? property.default) : fieldValue(property, values[property.name])
    if (value !== undefined) data[property.name] = value
  }
  return data
}

/** The values a copy stores after an edit. A "visible" value equal to the master's is left out. */
function nextValues(properties: readonly ComponentProperty[], data: Record<string, unknown> | undefined): ComponentValues {
  const values: ComponentValues = {}
  for (const property of properties) {
    const value = storedValue(property, data?.[property.name])
    if (value === undefined || (property.type === 'visible' && value === property.default)) continue
    values[property.name] = value
  }
  return values
}

/** Opens a saved section in the full-screen builder. Back returns to this page. */
function useEditComponent(savedId: string | number | null) {
  const runtime = useRuntime()
  const router = useRouter()
  const { startRouteTransition } = useRouteTransition()
  const {
    config: { routes },
  } = useConfig()
  const collection = runtime.config.savedSections?.collection
  if (!collection || savedId === null) return null
  return () => {
    const href = editSectionPath(routes.admin, collection, savedId, `${window.location.pathname}${window.location.search}`)
    startRouteTransition(() => router.push(href))
  }
}

/** A copy of a component: its properties as fields, "Edit component" and the places that use it. */
export function ComponentValuesPanel({ block }: { block: Block }) {
  const runtime = useRuntime()
  const saved = useValue(runtime.sections.saved)
  useEffect(() => void runtime.sections.load(), [runtime.sections])
  const savedId = sectionRefId(block.props?.section)
  const section = savedId === null ? undefined : saved?.find((s) => s.savedId !== undefined && String(s.savedId) === String(savedId))
  const properties = useMemo(() => (section ? componentProperties(section.blocks, runtime.config.blocks) : []), [section, runtime.config.blocks])
  const usedIn = useUsedIn(runtime, section ? savedId : null)
  // Content mode: a client fills in this copy's values; the component itself is design.
  const contentMode = useContentMode(runtime)
  const edit = useEditComponent(section && !contentMode ? savedId : null)
  if (savedId === null) return null
  if (saved === null) return <p className="builder-editor__hint">Loading the component…</p>
  if (!section) {
    return (
      <p className="builder-comp__missing">
        <Icon name="warning" size={14} /> This component was deleted. Pick another one, or delete this block.
      </p>
    )
  }

  const values = componentValuesOf(block.props)
  const onChange = (data: Record<string, unknown> | undefined) => {
    const next = nextValues(properties, data)
    const changed = properties.filter((p) => JSON.stringify(next[p.name]) !== JSON.stringify(values[p.name]))
    if (changed.length === 0) return
    runtime.store.apply(
      Object.keys(next).length > 0
        ? { type: 'update', id: block.id, props: { [SECTION_REF_VALUES]: next } }
        : { type: 'update', id: block.id, unsetProps: [SECTION_REF_VALUES] },
      // Typing in one field merges into one undo step.
      changed.length === 1 ? { mergeKey: `component:${block.id}:${changed[0]!.name}` } : {},
    )
  }

  const usedText = usedInText(usedIn)
  return (
    <section className="builder-comp" aria-label={`${section.label} properties`}>
      <div className="builder-comp__head">
        <Icon name="component" size={14} />
        <div className="builder-comp__title">
          <span className="builder-comp__name">{section.label}</span>
          {usedText && <span className="builder-comp__meta">{usedText}</span>}
        </div>
        {edit && (
          <button type="button" className="builder-comp__edit" onClick={edit}>
            Edit component
          </button>
        )}
      </div>
      {properties.length === 0 ? (
        <p className="builder-editor__hint">No properties yet. In the component, use the ◆ button next to a field to add one.</p>
      ) : (
        <>
          <RenderBlockFields
            fields={properties.map(propertyField)}
            data={inputData(properties, values)}
            path={`builder.${block.id}.${SECTION_REF_VALUES}`}
            onChange={onChange}
          />
          <p className="builder-editor__hint">Empty fields show the content of the component.</p>
        </>
      )}
    </section>
  )
}

/** In a saved section with properties: it is a component, and how many places use it. */
export function ComponentBanner() {
  const runtime = useRuntime()
  const own = editsSection(runtime)
  const properties = useOwnProperties(runtime)
  const meta = useValue(runtime.doc.meta)
  const usedIn = useUsedIn(runtime, own && properties.length > 0 ? meta.id : null)
  if (!own || properties.length === 0) return null
  const usedText = usedInText(usedIn)
  return (
    <div className="builder-comp__banner" role="note">
      <Icon name="component" size={14} />
      <p>
        <strong>Component</strong> with {properties.length} {properties.length === 1 ? 'property' : 'properties'}
        {usedText ? `. ${usedText}` : ''}. Changes show on every copy.
      </p>
    </div>
  )
}

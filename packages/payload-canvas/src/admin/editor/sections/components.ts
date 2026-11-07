'use client'

// Components in the editor: the actions that turn a prop of a saved section into a property, and
// the count of the places that use a saved section. Pure helpers live in core/components.ts.

import { useEffect, useState } from 'react'

import { SECTION_REF_BLOCK, sectionRefId } from '../../../blocks/builtins/sectionRef'
import { componentProperties, type ComponentProperty, propertyBinding, propertyName, propertyType, VISIBLE_BINDING } from '../../../core/components'
import { findBlock, getBlockDefinition, propField, walkBlocks } from '../../../core'
import type { Block } from '../../../core/types'
import type { Runtime } from '../runtime'
import { useEditor } from '../store'

/** True when the open document is a saved section: its props can become properties. */
export function editsSection(runtime: Runtime): boolean {
  const saved = runtime.config.savedSections?.collection
  return Boolean(saved && runtime.config.collection === saved)
}

/** The property type a prop would get, or null when it cannot be a property. */
export function propertyTypeOf(runtime: Runtime, block: Block, propPath: string) {
  if (block.type === SECTION_REF_BLOCK) return null
  const def = getBlockDefinition(runtime.config.blocks, block.type)
  return def ? propertyType(propField(def.fields as unknown[], propPath)) : null
}

/**
 * Makes `propPath` of a block a property named after `label`: one undo step. A name another prop
 * already uses joins that property when the types match (one value fills both). Returns the
 * problem as text, or null when it worked.
 */
export function addProperty(runtime: Runtime, blockId: string, propPath: string, label: string): string | null {
  const name = propertyName(label)
  if (!name) return 'Use letters or numbers.'
  const layout = runtime.store.getState().layout
  const block = findBlock(layout, blockId)
  if (!block) return 'The block is gone.'
  const type = propPath === VISIBLE_BINDING ? 'visible' : propertyTypeOf(runtime, block, propPath)
  if (!type) return 'This field cannot be a property.'
  const existing = componentProperties(layout.blocks, runtime.config.blocks).find((p) => p.name === name)
  if (existing && existing.type !== type) return `“${existing.label}” is already a ${existing.type === 'richText' ? 'rich text' : existing.type} property.`
  const done = runtime.store.apply({ type: 'update', id: blockId, bindings: { [propPath]: propertyBinding(name) } })
  if (!done) return 'The property could not be added.'
  runtime.notify(existing ? `Linked to the property “${existing.label}”` : 'Property added. Each copy can now set its own value.')
  return null
}

/** Turns a property back into a normal prop. Copies keep their values but no longer show them. */
export function removeProperty(runtime: Runtime, blockId: string, propPath: string): void {
  if (runtime.store.apply({ type: 'update', id: blockId, bindings: { [propPath]: null } })) runtime.notify('Property removed')
}

export type UsedIn = { total: number } | null

/** How many builder documents use the saved section (`null` until known, or when it cannot be read). */
export function useUsedIn(runtime: Runtime, savedId: string | number | null): UsedIn {
  const collection = runtime.config.savedSections?.collection ?? null
  const [usedIn, setUsedIn] = useState<UsedIn>(null)
  useEffect(() => {
    if (!collection || savedId === null) return
    const controller = new AbortController()
    fetch(`${runtime.api}/${encodeURIComponent(collection)}/${encodeURIComponent(String(savedId))}/used-in`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ total?: unknown }>) : null))
      .then((body) => setUsedIn(typeof body?.total === 'number' ? { total: body.total } : null))
      .catch(() => {
        // Offline or aborted: the count stays hidden.
      })
    return () => controller.abort()
  }, [runtime.api, collection, savedId])
  return usedIn
}

/** "Used in 3 places", "Not used yet". */
export function usedInText(usedIn: UsedIn): string | null {
  if (!usedIn) return null
  if (usedIn.total === 0) return 'Not used yet'
  return `Used in ${usedIn.total} ${usedIn.total === 1 ? 'place' : 'places'}`
}

const sameProperties = (a: ComponentProperty[], b: ComponentProperty[]) =>
  a.length === b.length && a.every((p, i) => p.name === b[i]!.name && p.type === b[i]!.type)

/** The properties of the open saved section, live (names and types). */
export function useOwnProperties(runtime: Runtime): ComponentProperty[] {
  return useEditor(runtime.store, (s) => componentProperties(s.layout.blocks, runtime.config.blocks), sameProperties)
}

/**
 * Coming back to this tab (after editing a component in another one): the canvas loads the saved
 * sections of the page's copies again, so they show the component's latest content.
 */
export function useComponentRefresh(runtime: Runtime): void {
  useEffect(() => {
    const collection = runtime.config.savedSections?.collection
    if (!collection) return
    const refresh = () => {
      const ids = new Set<string | number>()
      walkBlocks(runtime.store.getState().layout, (block) => {
        if (block.type !== SECTION_REF_BLOCK) return
        const id = sectionRefId(block.props?.section)
        if (id !== null) ids.add(id)
      })
      if (ids.size === 0) return
      void runtime.sections.load(true)
      for (const id of ids) runtime.postToCanvas({ type: 'docChanged', collection, id })
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [runtime])
}

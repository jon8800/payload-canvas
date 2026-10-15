'use client'

// Field labels in the builder's settings drawer. Payload's FieldLabel points a drawer field's label
// at `field-<path>-<depth>` (edit depth 2 and up), but several of Payload's inputs (text, email,
// number, select, …) keep the id `field-<path>`. In a drawer such a label points at nothing:
// screen readers announce an unnamed input, and a click on the label does not focus it. This
// points each such label at the input of its own field. Labels that already point at an element
// are left alone. Selects and relationships (react-select) get their field's label as their name
// (ui/payloadA11y.ts, as in the inspector). Nothing else in the form changes.

import { useEffect } from 'react'

import { nameComboboxes, type ComboboxScope } from '../ui/payloadA11y'

/**
 * The id a label should point at instead of `forId`: `forId` without its edit-depth suffix, when
 * `forId` points at nothing in the drawer and the field holds an element with the shorter id.
 * Null: keep the label as it is.
 */
export function labelTarget(forId: string, inDrawer: (id: string) => boolean, inField: (id: string) => boolean): string | null {
  if (!forId || inDrawer(forId)) return null
  const match = /^(field-.+)-\d+$/.exec(forId)
  if (!match) return null
  return inField(match[1]) ? match[1] : null
}

/** The part of the DOM `relinkDrawerLabels` reads (tests pass small fakes). */
export type LabelScope = {
  querySelector(selector: string): unknown
  querySelectorAll(selector: string): Iterable<DrawerLabel>
}
export type DrawerLabel = { htmlFor: string; closest(selector: string): LabelScope | null }

const byId = (id: string) => `[id="${id.replace(/["\\]/g, '\\$&')}"]`

/** Points the labels of `drawer` at their fields' inputs (see the top of this file). Returns how many changed. */
export function relinkDrawerLabels(drawer: LabelScope): number {
  let changed = 0
  for (const label of drawer.querySelectorAll('label[for^="field-"]')) {
    const field = label.closest('.field-type') ?? drawer
    const target = labelTarget(
      label.htmlFor,
      (id) => drawer.querySelector(byId(id)) !== null,
      (id) => field.querySelector(byId(id)) !== null,
    )
    if (target === null) continue
    label.htmlFor = target
    changed += 1
  }
  return changed
}

/**
 * Keeps the labels of the document drawer `slug` pointed at their inputs while it is open: once
 * after each change of the drawer's markup (Payload renders its fields, tabs and rows later).
 */
export function useDrawerLabels(slug: string, open: boolean) {
  useEffect(() => {
    if (!open || typeof MutationObserver === 'undefined') return
    let frame = 0
    const run = () => {
      frame = 0
      const drawer = document.getElementById(`close-drawer__${slug}`)?.closest<HTMLElement>('.drawer')
      if (!drawer) return
      relinkDrawerLabels(drawer as unknown as LabelScope)
      // Selects and relationships (react-select) have no element with the field's id at all.
      nameComboboxes(drawer as unknown as ComboboxScope)
    }
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(run)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['for', 'id'] })
    schedule()
    return () => {
      observer.disconnect()
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [slug, open])
}

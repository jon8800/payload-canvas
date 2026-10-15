import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { nameComboboxes, type ComboboxInput } from '../ui/payloadA11y'
import { labelTarget, relinkDrawerLabels, type DrawerLabel, type LabelScope } from './drawerLabels'
import { isFieldElementId } from './settingsFocus'

/** A tiny DOM: fields with a label `for` and the ids of the elements inside them, as Payload renders a drawer. */
function fakeDrawer(fields: { labelFor: string; ids: string[] }[]) {
  const scopes = fields.map((f) => {
    const scope: LabelScope = {
      querySelector: (selector) => (f.ids.some((id) => selector === `[id="${id}"]`) ? {} : null),
      querySelectorAll: () => [],
    }
    const label: DrawerLabel = { htmlFor: f.labelFor, closest: (selector) => (selector === '.field-type' ? scope : null) }
    return { scope, label }
  })
  const drawer: LabelScope = {
    querySelector: (selector) => (fields.some((f) => f.ids.some((id) => selector === `[id="${id}"]`)) ? {} : null),
    querySelectorAll: (selector) => (selector === 'label[for^="field-"]' ? scopes.map((s) => s.label) : []),
  }
  return { drawer, labels: scopes.map((s) => s.label) }
}

/** A drawer that holds `field-title` (in some field). */
const inDrawer = (id: string) => id === 'field-title'

describe('labels in the settings drawer', () => {
  it("points labels with the drawer's depth suffix at their own field's input", () => {
    // Payload at edit depth 2: text inputs keep `field-<path>`, labels say `field-<path>-2`.
    const { drawer, labels } = fakeDrawer([
      { labelFor: 'field-title-2', ids: ['field-title'] },
      { labelFor: 'field-hero__subtitle-2', ids: ['field-hero__subtitle'] },
      // Payload passes the input's id to this label already.
      { labelFor: 'field-intro', ids: ['field-intro'] },
      // An input that does have the depth in its id.
      { labelFor: 'field-status-2', ids: ['field-status-2'] },
      // No input with the shorter id in this field: left alone.
      { labelFor: 'field-missing-2', ids: [] },
    ])
    assert.equal(relinkDrawerLabels(drawer), 2)
    assert.deepEqual(
      labels.map((l) => l.htmlFor),
      ['field-title', 'field-hero__subtitle', 'field-intro', 'field-status-2', 'field-missing-2'],
    )
    // Stable: a second pass changes nothing.
    assert.equal(relinkDrawerLabels(drawer), 0)
    // The region field focus finds the same input.
    assert.equal(isFieldElementId(labels[1].htmlFor, 'hero.subtitle'), true)
  })

  it("never points a label at another field's element", () => {
    assert.equal(labelTarget('field-title-2', inDrawer, () => false), null)
    assert.equal(labelTarget('field-title-2', inDrawer, (id) => id === 'field-title'), 'field-title')
    assert.equal(labelTarget('title-2', () => false, () => true), null, 'only field ids')
    assert.equal(labelTarget('', () => false, () => true), null)
  })
})

/** A react-select input inside a field whose label reads `label` (null: no label). */
const input = (label: string | null) => {
  const attributes: Record<string, string> = {}
  const field = { querySelector: () => (label === null ? null : { textContent: label }) }
  const el: ComboboxInput = {
    closest: (selector) => (selector === '.field-type' ? field : null),
    setAttribute: (name, value) => {
      attributes[name] = value
    },
  }
  return { el, attributes }
}

describe('selects and relationships in the settings drawer', () => {
  it("names each react-select input by its own field's label", () => {
    const select = input('Size*')
    const relationship = input('Parent')
    const bare = input(null)
    const asked: string[] = []
    nameComboboxes({
      querySelectorAll: (selector) => {
        asked.push(selector)
        return [select.el, relationship.el, bare.el]
      },
    })
    assert.deepEqual(select.attributes, { 'aria-label': 'Size' }, 'the required mark is not part of the name')
    assert.deepEqual(relationship.attributes, { 'aria-label': 'Parent' })
    assert.deepEqual(bare.attributes, {}, 'no label: no name')
    // Only unnamed react-select inputs.
    assert.equal(asked[0], 'input.rs__input:not([aria-label]):not([aria-labelledby])')
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { withFieldDefaults } from '../../core/convertPayload'
import { dataFields } from '../../core/fields'
import { CAROUSEL_LABELS, carouselBlock } from './carousel'
import { LIGHTBOX_LABELS, lightboxBlock } from './lightbox'
import { labelOf } from './shared'

describe('control labels', () => {
  it('fills placeholders and falls back to the English default when empty', () => {
    assert.equal(labelOf({}, CAROUSEL_LABELS, 'dotLabel', { n: 2 }), 'Slide 2')
    assert.equal(labelOf({ dotLabel: 'Folie {n} von {count}' }, CAROUSEL_LABELS, 'dotLabel', { n: 2, count: 5 }), 'Folie 2 von 5')
    assert.equal(labelOf({ closeLabel: null }, LIGHTBOX_LABELS, 'closeLabel'), 'Close')
    assert.equal(labelOf({ closeLabel: '  ' }, LIGHTBOX_LABELS, 'closeLabel'), 'Close')
    assert.equal(labelOf({ slideLabel: '{n} / {total}' }, CAROUSEL_LABELS, 'slideLabel', { n: 1 }), '1 / {total}')
  })

  it('are flat, localized props with the English defaults', () => {
    for (const [def, labels] of [
      [carouselBlock(), CAROUSEL_LABELS],
      [lightboxBlock(), LIGHTBOX_LABELS],
    ] as const) {
      const fields = dataFields(def.fields as unknown[])
      for (const [name, text] of Object.entries(labels)) {
        const field = fields.find((f) => f.name === name)
        assert.ok(field, `${def.type}.${name}`)
        assert.equal((field as { localized?: boolean }).localized, true)
        assert.equal(field.defaultValue, text)
      }
      // Stored blocks without the props get the defaults, so they render as before.
      assert.deepEqual(Object.keys(withFieldDefaults({}, def.fields as unknown[])).filter((k) => k in labels), Object.keys(labels))
      assert.match(def.ai?.description ?? '', /Control labels/)
    }
  })
})

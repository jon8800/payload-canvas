import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BuilderClass } from '../../../classes/shared'
import { filterClasses, usageOf } from './managerModel'

const card: BuilderClass = { id: 1, name: 'card', label: 'Feature card', group: 'Surfaces', previousNames: ['panel'], status: 'published' }
const button: BuilderClass = { id: 2, name: 'button', label: null, group: 'Buttons', status: 'draft' }

describe('class manager model', () => {
  it('adds the usage of former names, one entry per document', () => {
    const usage = {
      card: { blocks: 2, documents: [{ collection: 'pages', id: 1, title: 'Home', blocks: 2 }] },
      panel: { blocks: 3, documents: [{ collection: 'pages', id: 1, title: 'Home', blocks: 1 }, { collection: 'posts', id: 9, title: 'Hello', blocks: 2 }] },
    }
    assert.deepEqual(usageOf(card, usage), {
      blocks: 5,
      documents: [
        { collection: 'pages', id: 1, title: 'Home', blocks: 3 },
        { collection: 'posts', id: 9, title: 'Hello', blocks: 2 },
      ],
    })
    assert.deepEqual(usageOf(button, usage), { blocks: 0, documents: [] })
    assert.equal(usageOf(card, null), null, 'not counted yet')
  })

  it('searches name, label and group, with or without the dot', () => {
    assert.deepEqual(filterClasses([card, button], '.car').map((c) => c.name), ['card'])
    assert.deepEqual(filterClasses([card, button], 'feature').map((c) => c.name), ['card'])
    assert.deepEqual(filterClasses([card, button], 'BUTTONS').map((c) => c.name), ['button'])
    assert.equal(filterClasses([card, button], '  ').length, 2)
  })
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  classNameProblem,
  cssProblem,
  importSiteClass,
  mergeSiteClasses,
  replaceClass,
  splitClassToken,
  usageText,
  usesClass,
  withoutClassNames,
  withPreviousName,
  type BuilderClass,
} from './shared'

describe('class names', () => {
  test('accepts CSS identifiers and refuses dots, digits first, spaces and reserved names', () => {
    for (const ok of ['card', 'btn-primary', '_x', 'Card2']) assert.equal(classNameProblem(ok), null, ok)
    for (const bad of ['', '.card', '1card', 'a b', 'md:card', 'builder-css', 'builder-x', 'pc-db-class-1', 'x'.repeat(65)]) {
      assert.ok(classNameProblem(bad), bad)
    }
  })

  test('splits variant prefixes and the important mark', () => {
    assert.deepEqual(splitClassToken('md:hover:card!'), { prefix: 'md:hover:', bare: 'card', important: true })
    assert.deepEqual(splitClassToken('!card'), { prefix: '!', bare: 'card', important: false })
    assert.equal(usesClass('p-4 md:card', 'card'), true)
    assert.equal(usesClass('p-4 cards', 'card'), false)
  })

  test('renames or removes a class with every variant, without duplicates', () => {
    assert.equal(replaceClass('card md:card p-2 hover:card!', 'card', 'panel'), 'panel md:panel p-2 hover:panel!')
    assert.equal(replaceClass('card panel p-2', 'card', 'panel'), 'panel p-2')
    assert.equal(replaceClass('card md:card p-2', 'card', null), 'p-2')
    assert.deepEqual(withoutClassNames(['p-4', 'card', 'md:card', 'cards'], new Set(['card'])), ['p-4', 'cards'])
  })

  test('keeps former names newest first, without the current name, at most 10', () => {
    assert.deepEqual(withPreviousName(['a', 'b'], 'card', 'b'), ['card', 'a'])
    assert.equal(withPreviousName(Array.from({ length: 20 }, (_, i) => `n${i}`), 'old', 'new').length, 10)
  })
})

describe('custom CSS', () => {
  test('accepts declarations, nested rules, keyframes, strings and comments', () => {
    assert.equal(cssProblem('color: red; &::before { content: "}"; } /* { */ @keyframes x { to { opacity: 1 } }'), null)
    assert.equal(cssProblem(''), null)
  })

  test('refuses what would break the compile or change the design system', () => {
    assert.match(cssProblem('&:hover { color: red') ?? '', /not closed/)
    assert.match(cssProblem('color: red; }') ?? '', /no matching/)
    assert.match(cssProblem('content: "x') ?? '', /string/)
    assert.match(cssProblem('@import "x.css";') ?? '', /@import/)
    assert.match(cssProblem('@theme { --color-x: red }') ?? '', /@theme/)
    assert.match(cssProblem('color: red; } </style><script>') ?? '', /<\/style/)
  })
})

describe('import from the site CSS', () => {
  test('@apply lists become styles; the rest stays custom CSS in order', () => {
    const imported = importSiteClass({
      name: 'btn',
      label: 'Button',
      group: 'Buttons',
      body: '\n  /* note */\n  @apply inline-flex px-4;\n  min-height: 2.75rem;\n  &:hover {\n    background: black;\n  }\n  @apply md:px-6;\n',
    })
    assert.deepEqual(imported, {
      name: 'btn',
      label: 'Button',
      group: 'Buttons',
      styles: 'inline-flex px-4 md:px-6',
      css: 'min-height: 2.75rem;\n&:hover {\n  background: black;\n}',
    })
  })

  test('an @apply with !important stays custom CSS; a rule without @apply has no styles', () => {
    assert.deepEqual(importSiteClass({ name: 'x', body: '@apply p-4 !important; color: red' }), {
      name: 'x',
      label: null,
      group: null,
      styles: null,
      css: '@apply p-4 !important;\ncolor: red;',
    })
  })
})

describe('suggestions and texts', () => {
  const card: BuilderClass = { id: 1, name: 'card', label: 'Card', group: 'Surfaces', styles: 'p-4', css: null, status: 'published' }

  test('editable classes come first and replace code classes with the same name', () => {
    const merged = mergeSiteClasses([card], [
      { name: 'card', css: 'padding: 1rem' },
      { name: 'glass', label: 'Glass', css: 'backdrop-filter: blur(8px)' },
    ])
    assert.deepEqual(merged.map((c) => [c.name, c.label, c.css]), [
      ['card', 'Card', 'p-4'],
      ['glass', 'Glass', 'backdrop-filter: blur(8px)'],
    ])
  })

  test('says how many blocks and pages a change reaches', () => {
    assert.equal(usageText({ blocks: 12, documents: [{ collection: 'p', id: 1, title: 'a', blocks: 6 }, { collection: 'p', id: 2, title: 'b', blocks: 6 }] }), 'changes 12 blocks on 2 pages')
    assert.equal(usageText({ blocks: 1, documents: [{ collection: 'p', id: 1, title: 'a', blocks: 1 }] }), 'changes 1 block on 1 page')
    assert.equal(usageText(null), 'is not used on any page yet')
  })
})

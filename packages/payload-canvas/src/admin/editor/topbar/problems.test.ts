import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Layout } from '../../../core/types'
import { blockAtPath, dedupeSentences, problemSummary, publishProblems, withoutSavedFields } from './problems'

const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'hero', type: 'stack' },
    { id: 'title', type: 'heading', props: { text: 'Hi' } },
    {
      id: 'section',
      type: 'stack',
      slots: { children: [{ id: 'row', type: 'stack', slots: { children: [{ id: 'img', type: 'image' }] } }] },
    },
  ],
}

test('blockAtPath follows slots down to the block', () => {
  assert.equal(blockAtPath(layout, 'blocks[2].slots.children[0].slots.children[0].props.image')?.id, 'img')
  assert.equal(blockAtPath(layout, 'layout.blocks[1]')?.id, 'title')
  assert.equal(blockAtPath(layout, 'blocks[9]'), null)
  assert.equal(blockAtPath(layout, 'title'), null)
})

test('raw validation paths in the error text become block problems with readable messages', () => {
  const problems = publishProblems(layout, {
    error: 'blocks[2].slots.children[0].slots.children[0].props.image: "image" is required, blocks[1].props.text: "text" is required',
  })
  assert.deepEqual(problems, [
    { blockId: 'img', field: null, message: 'Image is required.' },
    { blockId: 'title', field: null, message: 'Text is required.' },
  ])
})

test('a document field problem keeps its whole path, so a page region can show it', () => {
  const problems = publishProblems(layout, { errors: [{ path: 'header.title', message: 'This field is required.' }] })
  assert.deepEqual(problems, [{ blockId: null, field: 'header', path: 'header.title', message: 'Header is required.' }])
})

test('server errors with block ids win and are deduplicated', () => {
  const problems = publishProblems(layout, {
    error: '2 blocks need attention',
    errors: [
      { blockId: 'img', path: 'blocks[2].slots.children[0].slots.children[0].props.image', message: 'Image: choose an image' },
      { blockId: 'img', path: 'blocks[2].slots.children[0].slots.children[0].props.image', message: 'Image: choose an image' },
      { path: 'title', message: 'This field is required.' },
    ],
  })
  assert.deepEqual(problems, [
    { blockId: 'img', field: null, message: 'Image: choose an image.' },
    { blockId: null, field: 'title', path: 'title', message: 'Title is required.' },
  ])
  assert.equal(problemSummary(problems), '1 block needs attention, 1 setting needs attention')
})

test('a message without paths is one problem, with repeated sentences removed', () => {
  assert.equal(dedupeSentences('This field is required. This field is required.'), 'This field is required.')
  assert.deepEqual(publishProblems(layout, { error: 'This field is required. This field is required.' }), [
    { blockId: null, field: null, message: 'This field is required.' },
  ])
  assert.deepEqual(publishProblems(layout, { error: '' }), [])
})

test('a saved document field drops its own old publish problems, and only those', () => {
  const problems = publishProblems(layout, {
    errors: [
      { path: 'hero.title', message: 'This field is required.' },
      { path: 'slug', message: 'This field is required.' },
      { path: 'blocks[1].props.text', message: '"text" is required' },
    ],
  })
  assert.deepEqual(
    problems.map((p) => p.blockId ?? p.path),
    ['hero.title', 'slug', 'title'],
  )
  // The settings drawer saved the region's field `hero`.
  const left = withoutSavedFields(problems, ['hero'])
  assert.deepEqual(
    left.map((p) => p.blockId ?? p.path),
    ['slug', 'title'],
    'the other field and the block keep their problems',
  )
  assert.equal(problemSummary(left) === problemSummary(problems), false, 'the header count follows')
  assert.equal(withoutSavedFields(left, ['seo']), left, 'nothing to drop: the same list')
  assert.equal(withoutSavedFields(left, []), left)
})

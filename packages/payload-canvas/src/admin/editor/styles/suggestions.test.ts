import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StyleTokens } from '../../../core/types'
import { classSuggestions, groupSiteClasses, siteClassOf } from './suggestions'

const site = [
  { name: 'type-h1', label: 'Heading 1', group: 'Type', css: '' },
  { name: 'btn-primary', label: 'Primary button', group: 'Buttons', css: '' },
  { name: 'card', css: '' },
  { name: 'btn-ghost', label: 'Ghost button', group: 'Buttons', css: '' },
]

const tokens = {
  classList: ['bg-red-500', 'block', 'btn-primary', 'btn-ghost', 'card', 'p-4', 'text-lg', 'type-h1'],
  siteClasses: site,
} as unknown as StyleTokens

test('site classes group by their @canvas group, in CSS order', () => {
  const groups = groupSiteClasses(site)
  assert.deepEqual(groups.map((g) => [g.group, g.classes.map((c) => c.name)]), [
    ['Type', ['type-h1']],
    ['Buttons', ['btn-primary', 'btn-ghost']],
    ['Other', ['card']],
  ])
  assert.deepEqual(groupSiteClasses([{ name: 'card', css: '' }]).map((g) => g.group), [null])
})

test('site classes come before Tailwind utilities, with their labels and groups', () => {
  const list = classSuggestions(tokens, 'b')
  assert.deepEqual(list.map((s) => s.value), ['btn-primary', 'btn-ghost', 'bg-red-500', 'block'])
  assert.deepEqual(list[0], { value: 'btn-primary', label: 'Primary button', group: 'Buttons' })
  // A site class is listed once, not again as a Tailwind utility.
  assert.equal(list.filter((s) => s.value === 'btn-primary').length, 1)
  assert.equal(list.at(-1)?.group, undefined)
})

test('a site class matches on its label too', () => {
  assert.deepEqual(classSuggestions(tokens, 'head').map((s) => s.value), ['type-h1'])
  assert.deepEqual(classSuggestions(tokens, 'ghost').map((s) => s.value), ['btn-ghost'])
})

test('an empty query lists only the site classes the block does not have', () => {
  const list = classSuggestions(tokens, '', 60, new Set(['card', 'p-4']))
  assert.deepEqual(list.map((s) => [s.group, s.value]), [
    ['Type', 'type-h1'],
    ['Buttons', 'btn-primary'],
    ['Buttons', 'btn-ghost'],
  ])
  assert.deepEqual(classSuggestions({ ...tokens, siteClasses: undefined }, ''), [])
})

test('a class on the block is a site class with its variant prefix', () => {
  assert.deepEqual(siteClassOf('md:hover:btn-primary', site), { prefix: 'md:hover:', site: site[1] })
  assert.deepEqual(siteClassOf('card', site), { prefix: '', site: site[2] })
  assert.equal(siteClassOf('p-4', site), null)
  assert.equal(siteClassOf('card', undefined), null)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { groupSiteClasses, toggleClass } from './SiteClasses'

test('a site class toggles on and off and keeps the other classes', () => {
  assert.equal(toggleClass('p-4  md:p-8', 'glass'), 'p-4 md:p-8 glass')
  assert.equal(toggleClass('p-4 glass md:glass', 'glass'), 'p-4 md:glass')
  assert.equal(toggleClass('', 'glass'), 'glass')
})

test('site classes group by their @canvas group, in CSS order', () => {
  const groups = groupSiteClasses([
    { name: 'btn-primary', label: 'Primary', group: 'Buttons', css: '' },
    { name: 'card', css: '' },
    { name: 'btn-ghost', label: 'Ghost', group: 'Buttons', css: '' },
  ])
  assert.deepEqual(groups.map((g) => [g.group, g.classes.map((c) => c.name)]), [['Buttons', ['btn-primary', 'btn-ghost']], ['Other', ['card']]])
  assert.deepEqual(groupSiteClasses([{ name: 'card', css: '' }]).map((g) => g.group), [null])
})

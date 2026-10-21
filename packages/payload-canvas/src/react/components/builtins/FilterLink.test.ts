import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { FilterLink } from '.'

describe('FilterLink', () => {
  test('renders a relative, crawlable link with no active state on the server', () => {
    const html = renderToStaticMarkup(
      createElement(FilterLink, {
        block: { id: 'f', type: 'filterLink' },
        props: { param: 'available', value: 'today' },
        className: 'chip builder-css',
        slots: { children: 'Today' },
        attributes: {},
        slotAttributes: { children: { 'data-slot': 'children' } },
        mode: 'site',
      } satisfies BlockComponentProps),
    )
    assert.equal(html, '<a data-slot="children" href="?available=today" class="chip builder-css">Today</a>')
  })
})

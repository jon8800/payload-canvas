import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Payload } from 'payload'
import { isValidElement, Suspense, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { THEME_CONFIG_KEY } from '../../theme/config'
import { ThemeStyle, ThemeTags } from './ThemeStyle'

function fakePayload(theme: boolean): { payload: Payload; reads: () => number } {
  let count = 0
  const payload = {
    config: { custom: theme ? { [THEME_CONFIG_KEY]: { slug: 'theme-settings', cacheTag: 'theme-settings', endpoint: '/api/builder/theme' } } : {} },
    findGlobal: async () => {
      count += 1
      return { borderRadius: '0.75' }
    },
  } as unknown as Payload
  return { payload, reads: () => count }
}

describe('ThemeStyle', () => {
  it('reads the theme inside its own Suspense boundary (Cache Components)', () => {
    const { payload, reads } = fakePayload(true)
    const element = ThemeStyle({ payload }) as ReactElement<{ fallback: unknown; children: ReactElement }>
    assert.equal(element.type, Suspense)
    assert.equal(element.props.fallback, null)
    assert.ok(isValidElement(element.props.children))
    assert.equal(element.props.children.type, ThemeTags)
    // Nothing is read until React renders the boundary's content.
    assert.equal(reads(), 0)
  })
  it('renders the theme variables after the read', async () => {
    const { payload } = fakePayload(true)
    const tags = await ThemeTags({ payload })
    assert.ok(tags)
    assert.match(renderToStaticMarkup(tags), /:root:root \{ --radius: 0\.75rem; \}/)
  })
  it('takes the promise from getPayload, so the connection is made inside the boundary', async () => {
    const { payload } = fakePayload(true)
    const tags = await ThemeTags({ payload: Promise.resolve(payload) })
    assert.ok(tags)
    assert.match(renderToStaticMarkup(tags), /--radius: 0\.75rem/)
  })
  it('renders nothing with the theme turned off', async () => {
    const { payload, reads } = fakePayload(false)
    assert.equal(await ThemeTags({ payload }), null)
    assert.equal(reads(), 0)
  })
})

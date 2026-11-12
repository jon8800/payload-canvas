import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import { widgetPreviewURL, widgets } from './index'

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../../public')

describe('widget previews', () => {
  it('every widget has a light and a dark image', () => {
    for (const { slug } of widgets) {
      for (const theme of ['light', 'dark'] as const) {
        const file = path.join(PUBLIC_DIR, widgetPreviewURL(slug, theme))
        assert.ok(existsSync(file), `${file} is missing: run pnpm previews:widgets`)
      }
    }
  })

  it('widget-previews.css has a dark preview rule for every widget slug', () => {
    const css = readFileSync(path.join(import.meta.dirname, 'widget-previews.css'), 'utf8')
    const slugs = [...new Set([...css.matchAll(/\/([a-z-]+)-dark\.webp/g)].map((match) => match[1]))]
    assert.deepEqual(slugs.toSorted(), widgets.map((widget) => widget.slug).toSorted())
  })

  it('the drawer gets the light image', () => {
    const [first] = widgets as Array<(typeof widgets)[number] & { imageURL?: string }>
    assert.equal(first?.imageURL, '/admin/widget-previews/quick-actions-light.webp')
  })
})

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

  it('widget-previews.scss lists every widget slug', () => {
    const scss = readFileSync(path.join(import.meta.dirname, 'widget-previews.scss'), 'utf8')
    const list = /\$widget-preview-slugs:([^;]+);/.exec(scss)?.[1] ?? ''
    const slugs = list.split(',').map((slug) => slug.trim())
    assert.deepEqual(slugs.toSorted(), widgets.map((widget) => widget.slug).toSorted())
  })

  it('the drawer gets the light image', () => {
    const [first] = widgets as Array<(typeof widgets)[number] & { imageURL?: string }>
    assert.equal(first?.imageURL, '/admin/widget-previews/quick-actions-light.webp')
  })
})

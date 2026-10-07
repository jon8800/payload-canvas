import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Block, BlockDefinition } from '../../../core'

import { blockCandidates, compactText, cssUrls, lexicalText, mediaUrls, normalizeText, srcsetUrls, urlKey } from './candidates'

const BASE = 'http://localhost:3040/admin/builder-canvas'

const hero: BlockDefinition = {
  type: 'siteHero',
  label: 'Hero',
  fields: [
    { name: 'eyebrow', type: 'text', defaultValue: 'by Sea La Vie' },
    { name: 'headingLines', type: 'array', fields: [{ name: 'text', type: 'text' }, { name: 'style', type: 'select', options: ['large'] }] },
    { name: 'subtitle', type: 'textarea' },
    { name: 'bio', type: 'richText' },
    { name: 'tags', type: 'text', hasMany: true },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    { type: 'collapsible', label: 'More', fields: [{ name: 'note', type: 'text' }] },
    { name: 'meta', type: 'group', fields: [{ name: 'caption', type: 'text' }] },
    { name: 'gallery', type: 'upload', relationTo: 'media', hasMany: true },
  ],
}

const rich = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({ type: 'paragraph', children: [{ type: 'text', text }] })),
  },
})

const media = (name: string) => ({
  id: name,
  url: `/api/media/file/${name}.jpg`,
  thumbnailURL: `/api/media/file/${name}-300x300.jpg`,
  sizes: { card: { url: `http://localhost:3040/api/media/file/${name}-768x1024.jpg` }, empty: { url: null } },
})

const block = (props: Record<string, unknown>, extra: Partial<Block> = {}): Block => ({ id: 'b1', type: 'siteHero', props, ...extra })

describe('text keys', () => {
  test('normalizeText collapses whitespace runs, non-breaking spaces and line breaks', () => {
    assert.equal(normalizeText('  Hello  \n world  '), 'Hello world')
    assert.equal(compactText('Hello \n world'), 'Helloworld')
  })

  test('lexicalText reads paragraphs, line breaks and lists; non-Lexical values give null', () => {
    assert.equal(lexicalText(rich('One', 'Two')), 'One\nTwo')
    const withBreak = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ text: 'a' }, { type: 'linebreak' }, { text: 'b' }] }] } }
    assert.equal(lexicalText(withBreak), 'a\nb')
    assert.equal(lexicalText('plain'), null)
    assert.equal(lexicalText({ root: {} }), null)
  })
})

describe('image URL keys', () => {
  test('relative, absolute and next/image URLs of one file have one key', () => {
    const key = '/api/media/file/sun set.jpg'
    assert.equal(urlKey('/api/media/file/sun%20set.jpg', BASE), key)
    assert.equal(urlKey('http://localhost:3040/api/media/file/sun%20set.jpg?2024', BASE), key)
    assert.equal(urlKey('/_next/image?url=%2Fapi%2Fmedia%2Ffile%2Fsun%2520set.jpg&w=640&q=75', BASE), key)
    assert.equal(urlKey('data:image/png;base64,AAA', BASE), null)
    assert.equal(urlKey('', BASE), null)
  })

  test('srcset and CSS url() lists', () => {
    assert.deepEqual(srcsetUrls('/a.jpg 480w, /b.jpg 960w'), ['/a.jpg', '/b.jpg'])
    assert.deepEqual(cssUrls('linear-gradient(red, blue), url("/a.jpg"), url(/b.jpg)'), ['/a.jpg', '/b.jpg'])
  })

  test('mediaUrls lists the file, the thumbnail and every size', () => {
    assert.deepEqual(mediaUrls(media('x')), ['/api/media/file/x.jpg', '/api/media/file/x-300x300.jpg', 'http://localhost:3040/api/media/file/x-768x1024.jpg'])
    assert.deepEqual(mediaUrls(42), [])
  })
})

describe('blockCandidates', () => {
  test('finds text in rows, groups, collapsibles, hasMany lists and rich text, with defaults', () => {
    const { texts } = blockCandidates(
      block({
        headingLines: [{ text: 'Your  private', style: 'large' }, { text: 'escape' }],
        subtitle: 'Line one\nLine two',
        bio: rich('Hi there', 'Second'),
        tags: ['sun', 'sea'],
        note: 'A note',
        meta: { caption: 'Cap' },
      }),
      hero,
      BASE,
    )
    assert.deepEqual(
      texts.map((t) => [t.path, t.kind, t.key]),
      [
        ['eyebrow', 'line', 'by Sea La Vie'],
        ['headingLines.0.text', 'line', 'Your private'],
        ['headingLines.1.text', 'line', 'escape'],
        ['subtitle', 'lines', 'Line one Line two'],
        ['bio', 'rich', 'HithereSecond'],
        ['tags.0', 'line', 'sun'],
        ['tags.1', 'line', 'sea'],
        ['note', 'line', 'A note'],
        ['meta.caption', 'line', 'Cap'],
      ],
    )
  })

  test('two props with the same text are left out; a cleared default stays empty', () => {
    const { texts } = blockCandidates(block({ eyebrow: '', headingLines: [{ text: 'Same' }, { text: 'Same' }], note: 'Other' }), hero, BASE)
    assert.deepEqual(texts.map((t) => t.path), ['note'])
  })

  test('bound props are left out', () => {
    const { texts, images } = blockCandidates(
      block({ subtitle: 'From the doc', note: 'Mine', photo: media('p') }, { bindings: { subtitle: 'title', photo: 'image' } }),
      hero,
      BASE,
    )
    assert.deepEqual(texts.map((t) => t.path), ['eyebrow', 'note'])
    assert.deepEqual(images, [])
  })

  test('uploads with loaded documents give their URL keys; IDs and hasMany items too', () => {
    const { images } = blockCandidates(block({ photo: media('p'), gallery: [media('g0'), 7, { relationTo: 'media', value: media('g2') }] }), hero, BASE)
    assert.deepEqual(
      images.map((i) => [i.path, i.urls.length, i.urls[0]]),
      [
        ['photo', 3, '/api/media/file/p.jpg'],
        ['gallery.0', 3, '/api/media/file/g0.jpg'],
        ['gallery.2', 3, '/api/media/file/g2.jpg'],
      ],
    )
  })

  test('without a definition, string props are one line each', () => {
    const { texts } = blockCandidates(block({ title: 'Hello', count: 3 }), undefined, BASE)
    assert.deepEqual(texts.map((t) => [t.path, t.kind]), [['title', 'line']])
  })
})

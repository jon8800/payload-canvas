import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderRichText } from './RichText'
import { RICHTEXT_IMAGE_CSS, richTextImageCandidates } from './richTextUpload'
import { defaultResolveLink } from '../render/link'

const html = (content: unknown) => renderToStaticMarkup(createElement('div', null, renderRichText(content, defaultResolveLink)))

const withUpload = (value: unknown, fields: Record<string, unknown> | null = null) => ({
  root: {
    type: 'root',
    version: 1,
    children: [{ type: 'upload', version: 3, relationTo: 'media', value, fields }],
  },
})

/** A portrait photo: 3000x4000, three copies with its shape and two crops. */
const portrait = {
  id: 7,
  updatedAt: '2026-11-18T01:02:03.000Z',
  url: '/api/media/file/photo.jpg',
  alt: 'Media alt',
  mimeType: 'image/jpeg',
  filesize: 4_200_000,
  width: 3000,
  height: 4000,
  sizes: {
    thumbnail: { url: '/api/media/file/photo-400x400.webp', width: 400, height: 400 },
    card: { url: '/api/media/file/photo-640x853.webp', width: 640, height: 853 },
    gallery: { url: '/api/media/file/photo-1200x1600.webp', width: 1200, height: 1600 },
    hero: { url: '/api/media/file/photo-1920x1080.webp', width: 1920, height: 1080 },
    empty: { url: null, width: null, height: null },
  },
}

const v = '?v=7-2026-11-18T01%3A02%3A03.000Z'

test('a photo renders one img with same-shape copies, versioned, and no heavy original', () => {
  const out = html(withUpload(portrait))
  assert.equal(out.match(/<img /g)?.length, 1)
  assert.doesNotMatch(out, /<picture/)
  const img = out.slice(out.indexOf('<img '))
  assert.match(img, /class="builder-richtext-image"/)
  assert.match(img, new RegExp(`src="/api/media/file/photo-1200x1600.webp\\${v}"`))
  assert.match(
    img,
    new RegExp(
      `srcSet="/api/media/file/photo-640x853.webp\\${v} 640w, /api/media/file/photo-1200x1600.webp\\${v} 1200w"`,
    ),
  )
  assert.match(img, /sizes="auto, \(min-width: 1024px\) 768px, 100vw"/)
  assert.match(img, /width="3000"/)
  assert.match(img, /height="4000"/)
  assert.match(img, /loading="lazy"/)
  assert.match(img, /decoding="async"/)
  assert.match(img, /alt="Media alt"/)
  // Crops (thumbnail, hero) and the 4 MB original stay out.
  assert.doesNotMatch(img, /400x400|1920x1080|photo\.jpg/)
})

test('the alt text of the node wins over the media alt', () => {
  assert.match(html(withUpload(portrait, { alt: 'Node alt' })), /alt="Node alt"/)
  assert.match(html(withUpload(portrait, { alt: '' })), /alt="Media alt"/)
  assert.match(html(withUpload({ ...portrait, alt: null })), /alt=""/)
})

test('the photo styles go in the head once, with no rounding unless the site sets it', () => {
  const content = { root: { ...withUpload(portrait).root, children: [...withUpload(portrait).root.children, ...withUpload(portrait).root.children] } }
  const out = html(content)
  assert.equal(out.match(/data-href="builder-richtext-image"/g)?.length, 1)
  assert.ok(out.includes(RICHTEXT_IMAGE_CSS))
  assert.match(RICHTEXT_IMAGE_CSS, /^:where\(\.builder-richtext-image\)\{/)
  assert.match(RICHTEXT_IMAGE_CSS, /max-width:100%;height:auto;border-radius:var\(--builder-richtext-image-radius,0\)/)
})

test('a light original joins the srcset when no copy is large', () => {
  const light = { ...portrait, filesize: 300_000 }
  const list = richTextImageCandidates(light).map((c) => c.width)
  assert.deepEqual(list, [640, 1200, 3000])
  const out = html(withUpload(light))
  assert.match(out, new RegExp(`src="/api/media/file/photo.jpg\\${v}"`))
})

test('a PNG original stays out, also when it is small', () => {
  assert.deepEqual(richTextImageCandidates({ ...portrait, mimeType: 'image/png', filesize: 100_000 }).map((c) => c.width), [640, 1200])
})

test('a photo with no copies uses its original, without a srcset', () => {
  const out = html(withUpload({ ...portrait, sizes: {} }))
  assert.match(out, new RegExp(`src="/api/media/file/photo.jpg\\${v}"`))
  assert.doesNotMatch(out, /srcSet|sizes=/)
})

test('a copy as wide as the original is skipped, and URLs are escaped for srcset', () => {
  const doc = {
    id: 'a',
    url: '/media/my photo.jpg',
    mimeType: 'image/jpeg',
    filesize: 100_000,
    width: 800,
    height: 600,
    sizes: {
      card: { url: '/media/my photo,640.webp', width: 640, height: 480 },
      full: { url: '/media/my photo-800.webp', width: 800, height: 600 },
    },
  }
  const out = html(withUpload(doc))
  // No updatedAt: no version.
  assert.match(out, /srcSet="\/media\/my%20photo%2C640\.webp 640w, \/media\/my%20photo\.jpg 800w"/)
  assert.doesNotMatch(out, /photo-800/)
})

test('an upload that is only an id renders nothing', () => {
  assert.equal(html(withUpload(12)), '<div></div>')
  assert.equal(html(withUpload('abc')), '<div></div>')
  assert.equal(html(withUpload({ id: 3 })), '<div></div>')
})

test('a file that is not an image keeps Payload\'s default link', () => {
  const pdf = { id: 1, url: '/api/media/file/menu.pdf', filename: 'menu.pdf', mimeType: 'application/pdf' }
  assert.equal(html(withUpload(pdf)), '<div><a href="/api/media/file/menu.pdf" rel="noopener noreferrer">menu.pdf</a></div>')
})

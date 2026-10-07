import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Block } from '../../core'
import { defaultBlocks } from '../../blocks'
import { defaultResolveLink, parseVideoUrl, RenderLayout, type RenderLayoutProps } from '../index'

const blocks = defaultBlocks({ linkCollections: ['pages'] })

function html(block: Omit<Block, 'id'>, options: Partial<RenderLayoutProps> = {}): string {
  return renderToStaticMarkup(
    createElement(RenderLayout, { layout: { version: 1, blocks: [{ id: 'b', ...block }] }, blocks, ...options }),
  )
}
const site = (block: Omit<Block, 'id'>, options?: Partial<RenderLayoutProps>) => html(block, options)
const canvas = (block: Omit<Block, 'id'>, options?: Partial<RenderLayoutProps>) => html(block, { ...options, mode: 'canvas' })

const page = { id: 7, slug: 'about', title: 'About' }
const toCustom = () => '/custom'
const toNothing = () => null
const byCollection = (link: { reference?: { relationTo: string; value: unknown } | null }) =>
  link.reference ? `/${link.reference.relationTo}/${(link.reference.value as { id: number }).id}` : null

const text = (value: string, format = 0) => ({ type: 'text', version: 1, text: value, format, detail: 0, mode: 'normal', style: '' })
const paragraph = (...children: unknown[]) => ({ type: 'paragraph', version: 1, format: '', indent: 0, direction: 'ltr', children })
const lexical = (...children: unknown[]) => ({ root: { type: 'root', version: 1, format: '', indent: 0, direction: 'ltr', children } })

describe('every default block has a component', () => {
  test('no block renders as unknown in the canvas', () => {
    for (const def of blocks) {
      const out = canvas({ type: def.type, ...def.ai?.example, slots: undefined })
      assert.ok(!out.includes('data-builder-unknown'), def.type)
      assert.match(out, new RegExp(`data-block-type="${def.type}"`), def.type)
    }
  })
})

describe('stack and grid', () => {
  test('stack renders the "as" tag and falls back to div', () => {
    assert.equal(site({ type: 'stack', props: { as: 'section' }, className: 'flex' }), '<section class="flex builder-css"></section>')
    assert.equal(site({ type: 'stack', props: { as: 'script' } }), '<div></div>')
    assert.equal(site({ type: 'grid', className: 'grid' }), '<div class="grid builder-css"></div>')
    assert.match(canvas({ type: 'stack', props: { as: 'header' } }), /^<header data-block-id="b" data-block-type="stack" data-slot-owner="b" data-slot="children">/)
  })
})

describe('text-like blocks', () => {
  test('heading, text, quote with content', () => {
    assert.equal(site({ type: 'heading', props: { text: 'Hi', level: '1' } }), '<h1>Hi</h1>')
    assert.equal(site({ type: 'text', props: { text: 'a\nb' }, className: 'x' }), '<p class="x builder-css">a<br/>b</p>')
    assert.equal(
      site({ type: 'quote', props: { quote: 'Great', cite: 'Jane' }, className: 'italic' }),
      '<blockquote class="italic builder-css"><p>Great</p><footer><cite>Jane</cite></footer></blockquote>',
    )
    assert.equal(site({ type: 'quote', props: { quote: 'Great' } }), '<blockquote><p>Great</p></blockquote>')
  })

  test('empty blocks: nothing on the site, a muted placeholder in the canvas', () => {
    const cases: Array<[Omit<Block, 'id'>, RegExp]> = [
      [{ type: 'heading', props: { level: '3' }, className: 'text-3xl' }, /^<h3 data-block-id="b" data-block-type="heading" data-builder-text="text" class="text-3xl builder-css"><span data-builder-placeholder="" style="opacity:0.4">Heading<\/span><\/h3>$/],
      [{ type: 'text', props: { text: '' } }, /^<p [^>]+><span data-builder-placeholder="[^"]*" style="opacity:0.4">Text<\/span><\/p>$/],
      [{ type: 'quote' }, /^<blockquote [^>]+><p data-builder-text="quote"><span data-builder-placeholder[^>]*>Quote<\/span><\/p><\/blockquote>$/],
      [{ type: 'button', props: { link: { type: 'url', url: '/x' } } }, /^<a [^>]*href="\/x"[^>]*><span data-builder-placeholder[^>]*>Button<\/span><\/a>$/],
      [{ type: 'listItem' }, /^<li data-block-id="b" data-block-type="listItem" data-builder-text="text"><span data-builder-placeholder[^>]*>List item<\/span><\/li>$/],
      [{ type: 'richText', props: { content: lexical(paragraph()) } }, /^<div [^>]+><p><span data-builder-placeholder[^>]*>Rich text<\/span><\/p><\/div>$/],
      [{ type: 'image', props: { image: 5 } }, /^<div data-block-id="b" data-block-type="image" data-builder-image="image" data-builder-placeholder="" style="[^"]*min-height:96px[^"]*">Image<\/div>$/],
      [{ type: 'video', props: { source: 'upload' } }, /^<div [^>]*data-builder-placeholder="" style="[^"]*aspect-ratio:16 \/ 9[^"]*">Video<\/div>$/],
      [{ type: 'video', props: { source: 'url', url: 'javascript:alert(1)' } }, /data-builder-placeholder[^>]*>Video</],
    ]
    for (const [block, pattern] of cases) {
      assert.equal(site(block), '', block.type)
      assert.match(canvas(block), pattern, block.type)
    }
  })
})

describe('links', () => {
  test('default resolver: url, loaded reference with slug, otherwise null', () => {
    assert.equal(defaultResolveLink({ type: 'url', url: ' /contact ' }), '/contact')
    assert.equal(defaultResolveLink({ type: 'url', url: '' }), null)
    assert.equal(defaultResolveLink({ url: 'https://x.dev' }), 'https://x.dev')
    assert.equal(defaultResolveLink({ type: 'reference', reference: { relationTo: 'pages', value: page } }), '/about')
    assert.equal(defaultResolveLink({ type: 'reference', reference: { relationTo: 'pages', value: 7 } }), null)
    assert.equal(defaultResolveLink({ type: 'reference', reference: null }), null)
    // A reference link ignores a leftover URL.
    assert.equal(defaultResolveLink({ type: 'reference', url: '/old', reference: null }), null)
  })

  test('button: <a> with href, new tab attributes, <span> without href', () => {
    assert.equal(
      site({ type: 'button', props: { label: 'Go', link: { type: 'url', url: '/go' } }, className: 'btn' }),
      '<a href="/go" class="btn builder-css">Go</a>',
    )
    assert.equal(
      site({ type: 'button', props: { label: 'Go', link: { type: 'url', url: 'https://x.dev', newTab: true } } }),
      '<a href="https://x.dev" target="_blank" rel="noopener noreferrer">Go</a>',
    )
    assert.equal(
      site({ type: 'button', props: { label: 'Go', link: { type: 'reference', reference: { relationTo: 'pages', value: page } } } }),
      '<a href="/about">Go</a>',
    )
    assert.equal(site({ type: 'button', props: { label: 'Go' } }), '<span>Go</span>')
    assert.equal(site({ type: 'button', props: { label: 'Go', link: 'bad' } }), '<span>Go</span>')
  })

  test('custom resolveLink is used by buttons and links', () => {
    const props = { label: 'Go', link: { type: 'reference', reference: { relationTo: 'posts', value: { id: 3 } } } }
    assert.equal(site({ type: 'button', props }, { resolveLink: byCollection }), '<a href="/posts/3">Go</a>')
  })

  test('link block wraps its children and carries slot attributes', () => {
    const block: Omit<Block, 'id'> = {
      type: 'link',
      props: { link: { type: 'url', url: '/pricing' } },
      className: 'block',
      slots: { children: [{ id: 'h', type: 'heading', props: { text: 'Pricing' } }] },
    }
    assert.equal(site(block), '<a href="/pricing" class="block builder-css"><h2>Pricing</h2></a>')
    assert.match(canvas(block), /^<a data-block-id="b" data-block-type="link" data-slot-owner="b" data-slot="children" href="\/pricing" class="block builder-css">/)
    assert.equal(site({ ...block, props: {} }), '<div class="block builder-css"><h2>Pricing</h2></div>')
    assert.match(canvas({ type: 'link' }), /<div data-block-id="b"[^>]*><div data-slot-empty=""/)
  })
})

const listItem = (id: string, value: string, className?: string): Block => ({ id, type: 'listItem', props: { text: value }, ...(className ? { className } : {}) })

describe('list', () => {
  const slots = { items: [listItem('i1', 'One', 'font-bold'), listItem('i2', ''), listItem('i3', 'Two')] }
  const legacy = [{ id: 'r1', text: 'One' }, { text: '' }, { text: 'Two' }, 'bad']

  test('ul or ol of listItem blocks; empty items render nothing on the site', () => {
    assert.equal(site({ type: 'list', slots, className: 'list-disc' }), '<ul class="list-disc builder-css"><li class="font-bold builder-css">One</li><li>Two</li></ul>')
    assert.match(site({ type: 'list', props: { ordered: true }, slots }), /^<ol[^>]*><li class="font-bold builder-css">One<\/li><li>Two<\/li><\/ol>$/)
    assert.equal(site({ type: 'list' }), '')
  })

  test('in the canvas, each item is a block with its own editable text, and the ul holds the slot', () => {
    const out = canvas({ type: 'list', slots })
    assert.match(out, /^<ul data-block-id="b" data-block-type="list" data-slot-owner="b" data-slot="items"/)
    assert.match(out, /<li data-block-id="i1" data-block-type="listItem" class="font-bold builder-css" data-builder-text="text">One<\/li>/)
    assert.match(out, /<li data-block-id="i2"[^>]*><span data-builder-placeholder[^>]*>List item<\/span><\/li>/)
    assert.match(canvas({ type: 'list' }), /^<ul [^>]*><div data-slot-empty="" data-slot-owner="b" data-slot="items"/)
  })

  test('the old shape (props.items rows) still renders, skipping empty rows', () => {
    assert.equal(site({ type: 'list', props: { items: legacy }, className: 'list-disc' }), '<ul class="list-disc builder-css"><li>One</li><li>Two</li></ul>')
    assert.match(canvas({ type: 'list', props: { items: legacy } }), /<li data-builder-text="items.0.text">One<\/li><li data-builder-text="items.2.text">Two<\/li>/)
  })

  test('ordered lists show numbers, unordered bullets, when no list-style class is set', () => {
    const className = 'pl-6 space-y-1'
    assert.equal(
      site({ type: 'list', props: { ordered: true }, slots, className }),
      '<ol class="pl-6 space-y-1 builder-css" style="list-style-type:decimal"><li class="font-bold builder-css">One</li><li>Two</li></ol>',
    )
    assert.equal(
      site({ type: 'list', props: { items: legacy }, className }),
      '<ul class="pl-6 space-y-1 builder-css" style="list-style-type:disc"><li>One</li><li>Two</li></ul>',
    )
  })

  test('a list-style-type class wins; position and image classes do not count', () => {
    for (const className of ['list-none', 'md:list-decimal', 'list-[square]', 'list-disc!']) {
      assert.ok(!site({ type: 'list', props: { ordered: true }, slots, className }).includes('style='), className)
    }
    for (const className of ['list-inside', 'list-outside pl-4', 'list-image-none']) {
      assert.match(site({ type: 'list', props: { ordered: true }, slots, className }), /style="list-style-type:decimal"/, className)
    }
  })
})

describe('divider and spacer', () => {
  test('divider is an hr, spacer an empty div', () => {
    assert.equal(site({ type: 'divider', className: 'my-8 border-t' }), '<hr class="my-8 border-t builder-css"/>')
    assert.equal(site({ type: 'spacer', className: 'h-8' }), '<div aria-hidden="true" class="h-8 builder-css"></div>')
    assert.equal(site({ type: 'spacer' }), '<div aria-hidden="true"></div>')
    assert.match(canvas({ type: 'spacer' }), /style="min-height:16px"/)
    assert.ok(!canvas({ type: 'spacer', className: 'h-8' }).includes('style='))
  })
})

describe('rich text', () => {
  const content = lexical(
    paragraph(text('Hello '), text('bold', 1)),
    {
      type: 'list',
      listType: 'bullet',
      tag: 'ul',
      start: 1,
      version: 1,
      children: [{ type: 'listitem', value: 1, version: 1, children: [text('item')] }],
    },
    paragraph({
      type: 'link',
      version: 3,
      fields: { linkType: 'internal', doc: { relationTo: 'pages', value: page }, newTab: false },
      children: [text('about')],
    }),
  )

  test('renders Lexical JSON inside a div with the block className', () => {
    const out = site({ type: 'richText', props: { content }, className: 'prose' })
    assert.match(out, /^<div class="prose builder-css"><p>Hello <strong>bold<\/strong><\/p><ul class="list-bullet"><li[^>]*>item<\/li><\/ul><p><a href="\/about">about<\/a><\/p><\/div>$/)
  })

  test('internal links use resolveLink, unresolved ones fall back to #', () => {
    assert.match(site({ type: 'richText', props: { content } }, { resolveLink: toCustom }), /<a href="\/custom">about<\/a>/)
    assert.match(site({ type: 'richText', props: { content } }, { resolveLink: toNothing }), /<a href="#">about<\/a>/)
  })

  test('canvas output has the block attributes', () => {
    assert.match(canvas({ type: 'richText', props: { content } }), /^<div data-block-id="b" data-block-type="richText" data-builder-text="content"><p>Hello/)
  })
})

describe('image', () => {
  test('prop alt overrides the document alt', () => {
    const image = { id: 1, url: '/a.jpg', alt: 'Doc alt' }
    assert.match(site({ type: 'image', props: { image, alt: 'Prop alt' } }), /alt="Prop alt"/)
    assert.match(site({ type: 'image', props: { image } }), /alt="Doc alt"/)
  })
})

describe('video', () => {
  test('parseVideoUrl: YouTube forms', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ',
      'https://m.youtube.com/watch?v=aqz-KE-bpKQ&feature=share',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
    ]) {
      const embed = parseVideoUrl(url)
      assert.equal(embed?.kind, 'youtube', url)
      assert.equal(embed && 'id' in embed ? embed.id : null, 'aqz-KE-bpKQ', url)
    }
    assert.equal(
      parseVideoUrl('https://youtu.be/aqz-KE-bpKQ?t=1m30s', { autoplay: true, muted: true, loop: true, controls: false })?.kind === 'youtube'
        ? (parseVideoUrl('https://youtu.be/aqz-KE-bpKQ?t=1m30s', { autoplay: true, muted: true, loop: true, controls: false }) as { embedUrl: string }).embedUrl
        : null,
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=90&autoplay=1&mute=1&loop=1&playlist=aqz-KE-bpKQ&controls=0&playsinline=1',
    )
    assert.equal(parseVideoUrl('https://www.youtube.com/watch?v=short')?.kind, 'file')
  })

  test('parseVideoUrl: Vimeo forms, files and unsafe URLs', () => {
    assert.deepEqual(parseVideoUrl('https://vimeo.com/76979871'), { kind: 'vimeo', id: '76979871', embedUrl: 'https://player.vimeo.com/video/76979871' })
    assert.equal((parseVideoUrl('https://vimeo.com/76979871/abc123ef', { muted: true }) as { embedUrl: string }).embedUrl, 'https://player.vimeo.com/video/76979871?h=abc123ef&muted=1')
    assert.equal(parseVideoUrl('https://player.vimeo.com/video/76979871')?.kind, 'vimeo')
    assert.equal(parseVideoUrl('https://vimeo.com/channels/staffpicks/76979871')?.kind, 'vimeo')
    assert.deepEqual(parseVideoUrl('https://cdn.example.com/clip.mp4'), { kind: 'file', src: 'https://cdn.example.com/clip.mp4' })
    assert.deepEqual(parseVideoUrl('/media/clip.mp4'), { kind: 'file', src: '/media/clip.mp4' })
    assert.equal(parseVideoUrl('javascript:alert(1)'), null)
    assert.equal(parseVideoUrl('  '), null)
  })

  test('YouTube URL: iframe with 16:9 ratio, pointer-events none only in the canvas', () => {
    const block = { type: 'video', props: { source: 'url', url: 'https://youtu.be/aqz-KE-bpKQ', controls: true }, className: 'w-full' }
    const out = site(block)
    assert.match(out, /^<iframe class="w-full builder-css" src="https:\/\/www.youtube-nocookie.com\/embed\/aqz-KE-bpKQ\?playsinline=1" title="YouTube video"/)
    assert.match(out, /style="border:0;aspect-ratio:16 \/ 9;height:auto"/)
    assert.ok(!out.includes('pointer-events'))
    assert.match(canvas(block), /pointer-events:none/)
    // A size class replaces the default ratio.
    assert.match(site({ ...block, className: 'w-full md:aspect-square' }), /style="border:0"/)
  })

  test('upload and file URL: <video> with poster and flags', () => {
    const out = site({
      type: 'video',
      props: { source: 'upload', video: { id: 1, url: '/media/a.mp4' }, poster: { id: 2, url: '/media/p.jpg' }, autoplay: true, muted: true, loop: true, controls: true },
      className: 'w-full',
    })
    assert.match(out, /^<video class="w-full builder-css" src="\/media\/a.mp4" poster="\/media\/p.jpg" autoPlay="" loop="" muted="" controls="" playsInline="" preload="metadata"><\/video>$/)
    const file = site({ type: 'video', props: { source: 'url', url: 'https://cdn.example.com/a.webm', controls: false } })
    assert.equal(file, '<video src="https://cdn.example.com/a.webm" playsInline="" preload="metadata"></video>')
    // A URL with no source set still plays.
    assert.match(site({ type: 'video', props: { url: 'https://vimeo.com/76979871' } }), /^<iframe/)
  })
})

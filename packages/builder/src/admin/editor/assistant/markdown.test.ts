import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { parseInline, parseMarkdown, safeHref } from './markdown'
import { Markdown } from './MarkdownView'

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }))

test('escapes HTML in model output', () => {
  const out = html('<script>alert(1)</script> and <img src=x onerror=alert(1)> **<b>bold</b>**')
  assert.ok(!out.includes('<script>'))
  assert.ok(!out.includes('<img'))
  assert.ok(!out.includes('<b>'))
  assert.ok(out.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(out.includes('<strong>&lt;b&gt;bold&lt;/b&gt;</strong>'))
})

test('links: only safe protocols become anchors', () => {
  assert.equal(safeHref('https://example.com'), 'https://example.com')
  assert.equal(safeHref('mailto:a@b.c'), 'mailto:a@b.c')
  assert.equal(safeHref('/admin'), '/admin')
  assert.equal(safeHref('javascript:alert(1)'), null)
  assert.equal(safeHref('JavaScript:alert(1)'), null)
  assert.equal(safeHref('data:text/html,x'), null)
  assert.equal(safeHref('//evil.com'), null)
  const out = html('[docs](https://example.com) and [bad](javascript:alert(1))')
  assert.ok(out.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>'))
  assert.ok(!out.includes('javascript:'))
  assert.ok(out.includes('bad'))
})

test('inline: bold, italic, code; code keeps its markers literal', () => {
  assert.deepEqual(parseInline('a **b** *c* _d_ `**e**`'), [
    { type: 'text', text: 'a ' },
    { type: 'strong', children: [{ type: 'text', text: 'b' }] },
    { type: 'text', text: ' ' },
    { type: 'em', children: [{ type: 'text', text: 'c' }] },
    { type: 'text', text: ' ' },
    { type: 'em', children: [{ type: 'text', text: 'd' }] },
    { type: 'text', text: ' ' },
    { type: 'code', text: '**e**' },
  ])
  // Snake case and unclosed markers (mid-stream) stay text.
  assert.deepEqual(parseInline('snake_case_name **open'), [{ type: 'text', text: 'snake_case_name **open' }])
})

test('blocks: paragraphs, line breaks, lists, headings and fenced code', () => {
  const blocks = parseMarkdown(
    '# Done\n\nI added:\n- a **hero**\n- a grid\n  with cards\n\n2. two\n3. three\n\n```\n<div>\n```\nLine one\nline two',
  )
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['heading', 'paragraph', 'list', 'list', 'code', 'paragraph'],
  )
  const bullets = blocks[2]
  assert.ok(bullets.type === 'list' && !bullets.ordered && bullets.items.length === 2)
  assert.deepEqual(bullets.items[1], [{ type: 'text', text: 'a grid with cards' }])
  const ordered = blocks[3]
  assert.ok(ordered.type === 'list' && ordered.ordered && ordered.start === 2)
  assert.deepEqual(blocks[4], { type: 'code', text: '<div>' })
  assert.equal(
    html('Line one\nline two\n\n2. two'),
    '<div class="builder-assistant__md"><p>Line one<br/>line two</p><ol start="2"><li>two</li></ol></div>',
  )
})

test('an unclosed fence (still streaming) runs to the end', () => {
  assert.deepEqual(parseMarkdown('Here:\n```\nconst a = 1'), [
    { type: 'paragraph', children: [{ type: 'text', text: 'Here:' }] },
    { type: 'code', text: 'const a = 1' },
  ])
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  codePoints,
  cssUrls,
  declaration,
  escapeXml,
  familyNames,
  fontFaceBlocks,
  parseUnicodeRange,
  rangesCover,
  replaceUrls,
  rewriteRootSelectors,
} from './css'

describe('thumbnail css helpers', () => {
  it('points html and body selectors at the stand-in elements', () => {
    assert.equal(rewriteRootSelectors('html, :host'), '[data-thumb-html], :host')
    assert.equal(rewriteRootSelectors('body'), '[data-thumb-body]')
    assert.equal(rewriteRootSelectors('html.dark body > p'), '[data-thumb-html].dark [data-thumb-body] > p')
    assert.equal(rewriteRootSelectors('.htmlish, .body-text, [data-html]'), '.htmlish, .body-text, [data-html]')
    assert.equal(rewriteRootSelectors(':where(html) a'), ':where([data-thumb-html]) a')
  })

  it('reads font family names', () => {
    assert.deepEqual(familyNames(`"Geist", 'Geist Fallback', ui-sans-serif`), ['geist', 'geist fallback', 'ui-sans-serif'])
  })

  it('parses unicode ranges and checks text against them', () => {
    const latin = parseUnicodeRange('U+0000-00FF, U+0131, U+02??')
    assert.deepEqual(latin, [[0, 0xff], [0x131, 0x131], [0x200, 0x2ff]])
    assert.equal(rangesCover(latin, codePoints('Hello')), true)
    assert.equal(rangesCover(parseUnicodeRange('U+0400-045F'), codePoints('Hello')), false)
    assert.equal(rangesCover(parseUnicodeRange(''), codePoints('Привет')), true)
  })

  it('finds font faces, declarations and urls', () => {
    const css = `@font-face { font-family: 'Inter'; src: url(https://x.test/a.woff2) format('woff2'); unicode-range: U+0000-00FF; }
.a { background: url("/b.png") }`
    const [face] = fontFaceBlocks(css)
    assert.equal(declaration(face, 'font-family'), "'Inter'")
    assert.equal(declaration(face, 'unicode-range'), 'U+0000-00FF')
    assert.deepEqual(cssUrls(css), ['https://x.test/a.woff2', '/b.png'])
    assert.equal(
      replaceUrls(css, new Map([['/b.png', 'data:image/png;base64,AA']])).includes('url("data:image/png;base64,AA")'),
      true,
    )
  })

  it('escapes XML text', () => {
    assert.equal(escapeXml('a < b && "c" > d'), 'a &lt; b &amp;&amp; &quot;c&quot; &gt; d')
  })
})

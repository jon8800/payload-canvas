import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Layout } from '@payload-toolkit/builder/core'

import { fromPayloadComponent, RenderLayout, MOTION_CSS } from '../index'
import { enterCss } from './style'

const render = (props: Parameters<typeof RenderLayout>[0]) => renderToStaticMarkup(createElement(RenderLayout, props))

const animated: Layout = {
  version: 1,
  blocks: [
    { id: 'h', type: 'heading', props: { text: 'Hello' }, motion: { enter: { preset: 'fade-up', trigger: 'load' } } },
    {
      id: 'g',
      type: 'grid',
      motion: { enter: { preset: 'fade-up', stagger: 80 } },
      slots: {
        children: [
          { id: 'a', type: 'text', props: { text: 'A' }, motion: { hover: { preset: 'lift' } } },
          { id: 'b', type: 'text', props: { text: 'B' } },
        ],
      },
    },
  ],
}

test('site mode: animated blocks carry their settings, staggered children are items', () => {
  const html = render({ layout: animated })
  assert.match(html, /<h2 data-motion="\{&quot;enter&quot;:\{&quot;preset&quot;:&quot;fade-up&quot;,&quot;trigger&quot;:&quot;load&quot;\}\}" data-motion-reveal=""/)
  // The staggering grid itself stays visible; its children reveal.
  assert.match(html, /<div data-motion="[^"]*stagger[^"]*">/)
  assert.match(html, /<p data-motion="\{&quot;hover&quot;:\{&quot;preset&quot;:&quot;lift&quot;\}\}" data-motion-item="" data-motion-reveal=""/)
  assert.match(html, /<p data-motion-item="" data-motion-reveal="">B<\/p>/)
})

test('site mode: the motion CSS hides reveals only while JavaScript runs, without reduced motion, for a limited time', () => {
  assert.match(
    MOTION_CSS,
    /^@media \(scripting: enabled\) and \(prefers-reduced-motion: no-preference\)\{\[data-motion-reveal\]:not\(\[data-motion-ready\]\)\{animation:builder-motion-hide 1200ms\}\}/,
  )
  assert.match(MOTION_CSS, /@keyframes builder-motion-hide\{0%,100%\{opacity:0\}\}/)
})

test('site mode: entrances on load play in CSS from first paint', () => {
  const html = render({ layout: animated })
  // The CSS entrance rule matches the heading's exact data-motion value.
  assert.match(html, /<style data-precedence="default" data-href="payload-builder-motion payload-builder-motion-[a-z0-9]+">.*@media \(prefers-reduced-motion: no-preference\)\{\[data-motion-reveal\]\[data-motion-reveal\]\[data-motion='\{"enter":\{"preset":"fade-up","trigger":"load"\}\}'\]\{animation:builder-motion-enter-[a-z0-9]+ 600ms cubic-bezier\(0\.23,1,0\.32,1\) 0ms backwards\}\}@keyframes builder-motion-enter-[a-z0-9]+\{from\{opacity:0;transform:translateY\(24px\)\}\}/)
  // The grid enters on scroll: no CSS entrance for it.
  assert.equal(enterCss([animated.blocks[1]!]), '')
})

test('enterCss: staggered children get one rule each, with their delay', () => {
  const css = enterCss([
    {
      id: 'g',
      type: 'grid',
      motion: { enter: { preset: 'wipe-up', trigger: 'load', delay: 100, stagger: 50, duration: 400 } },
      slots: { children: [{ id: 'a', type: 'text' }, { id: 'b', type: 'text', hidden: true }, { id: 'c', type: 'text' }] },
    },
  ])
  assert.match(css, /:nth-child\(1 of \[data-motion-item\]\):not\([^)]*\[data-motion\] \*\)\{animation:builder-motion-enter-\w+ 400ms [^ ]+ 100ms backwards\}/)
  assert.match(css, /:nth-child\(2 of \[data-motion-item\]\):not\([^)]*\[data-motion\] \*\)\{animation:builder-motion-enter-\w+ 400ms [^ ]+ 150ms backwards\}/)
  assert.doesNotMatch(css, /nth-child\(3 of/)
  assert.match(css, /from\{clip-path:inset\(100% 0% 0% 0%\)\}to\{clip-path:inset\(0% 0% 0% 0%\)\}/)
})

test('a layout without motion renders no motion attributes and no motion CSS', () => {
  const html = render({ layout: { version: 1, blocks: [{ id: 'h', type: 'heading', props: { text: 'Hi' } }] } })
  assert.doesNotMatch(html, /data-motion|builder-motion/)
})

test('hidden animated blocks do not turn motion on', () => {
  const html = render({ layout: { version: 1, blocks: [{ id: 'h', type: 'heading', hidden: true, props: { text: 'Hi' }, motion: { hover: { preset: 'lift' } } }] } })
  assert.equal(html, '')
})

test('canvas mode: settings next to the editor attributes, no hiding CSS', () => {
  const html = render({ layout: animated, mode: 'canvas' })
  assert.match(html, /data-block-id="h" data-block-type="heading" data-motion=/)
  assert.match(html, /data-block-id="b" data-block-type="text" data-motion-item="" data-motion-reveal=""/)
  assert.doesNotMatch(html, /builder-motion-(hide|enter)/)
})

function Legacy({ title }: { title?: string }) {
  return createElement('section', null, title)
}

test('Payload-shaped components: the class wrapper carries the settings on the site', () => {
  const components = { legacy: fromPayloadComponent(Legacy) }
  const layout: Layout = {
    version: 1,
    blocks: [{ id: 'l', type: 'legacy', className: 'p-4', props: { title: 'Old' }, motion: { enter: { preset: 'fade' } } }],
  }
  const html = render({ layout, components })
  assert.match(html, /<div class="p-4 builder-css" data-motion="\{&quot;enter&quot;:\{&quot;preset&quot;:&quot;fade&quot;\}\}" data-motion-reveal=""><section>Old<\/section><\/div>/)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Layout } from '@payload-toolkit/builder/core'

import { fromPayloadComponent, RenderLayout, MOTION_CSS } from '../index'

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

test('site mode: the motion CSS hides reveals only while JavaScript runs, with a failsafe', () => {
  assert.match(MOTION_CSS, /^@media \(scripting: enabled\)\{\[data-motion-reveal\]:not\(\[data-motion-ready\]\)\{opacity:0;animation:builder-motion-failsafe 0s 2\.5s forwards\}\}/)
  assert.match(MOTION_CSS, /@keyframes builder-motion-failsafe\{to\{opacity:1\}\}/)
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
  assert.doesNotMatch(html, /builder-motion-failsafe/)
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

// The block component contract: plain-data props, resolved links, and editor attributes only in
// canvas mode.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement, isValidElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { collectClasses, type Block, type BlockDefinition, type Layout } from '../../core'
import { defaultBlocks, defineBlock, linkField } from '../../blocks'
import {
  defaultComponents,
  RenderLayout,
  type BlockComponentProps,
  type BlockComponents,
  type RenderLayoutProps,
  type ResolvedLink,
} from '../index'

const page = { id: 7, slug: 'about', title: 'About' }
const pageRef = { type: 'reference', reference: { relationTo: 'pages', value: page } }

const card = defineBlock({
  type: 'card',
  label: 'Card',
  fields: [
    linkField({ collections: ['pages'] }),
    { name: 'extra', type: 'group', fields: [linkField({ name: 'more', collections: ['pages'] })] },
    { name: 'rows', type: 'array', fields: [linkField({ name: 'cta' })] },
    { type: 'row', fields: [{ name: 'title', type: 'text' }] },
  ],
  classes: ['shadow-sm hover:shadow-md'],
})

const blocks: BlockDefinition[] = [...defaultBlocks({ linkCollections: ['pages'] }), card]

const lexical = (...children: unknown[]) => ({ root: { type: 'root', version: 1, format: '', indent: 0, direction: 'ltr', children } })
const internalLink = {
  type: 'paragraph',
  version: 1,
  children: [
    {
      type: 'link',
      version: 3,
      fields: { linkType: 'internal', doc: { relationTo: 'pages', value: page }, newTab: false },
      children: [{ type: 'text', version: 1, text: 'about', format: 0, detail: 0, mode: 'normal', style: '' }],
    },
  ],
}

/** Every default block's AI example, plus links, rich text, hidden, nested and unknown blocks. */
const everything: Layout = {
  version: 1,
  blocks: [
    ...defaultBlocks({ linkCollections: ['pages'] }).map((def, i): Block => ({ id: `x${i}`, type: def.type, ...def.ai?.example })),
    { id: 'btn', type: 'button', props: { label: 'Go', link: pageRef } },
    { id: 'rt', type: 'richText', props: { content: lexical(internalLink) } },
    {
      id: 'wrap',
      type: 'stack',
      slots: {
        children: [
          { id: 'hid', type: 'heading', props: { text: 'Hidden' }, hidden: true },
          { id: 'unk', type: 'mystery' },
          { id: 'c', type: 'card', props: { link: pageRef, title: 'T' } },
        ],
      },
    },
  ],
}

function findFunction(value: unknown, path: string, seen = new Set<unknown>()): string | null {
  if (typeof value === 'function') return path
  if (typeof value !== 'object' || value === null || seen.has(value)) return null
  // Rendered slot children are React elements. They are not props data.
  if (isValidElement(value)) return null
  seen.add(value)
  for (const [key, child] of Object.entries(value)) {
    const found = findFunction(child, `${path}.${key}`, seen)
    if (found) return found
  }
  return null
}

/** Wraps a component so it throws when any prop, at any depth, is a function. */
function strict(Component: ComponentType<BlockComponentProps>): ComponentType<BlockComponentProps> {
  return function Strict(props: BlockComponentProps) {
    const found = findFunction(props, 'props')
    if (found) throw new Error(`Function prop reached a block component: ${found}`)
    return createElement(Component, props)
  }
}

const Card = ({ props, attributes }: BlockComponentProps) => {
  const link = props.link as ResolvedLink
  return createElement('a', { ...attributes, href: link.href ?? undefined }, String(props.title))
}

const render = (props: Partial<RenderLayoutProps> & { layout: Layout }) =>
  renderToStaticMarkup(createElement(RenderLayout, { blocks, ...props }))

describe('block components receive plain data', () => {
  const strictComponents: BlockComponents = Object.fromEntries(
    Object.entries({ ...defaultComponents, card: Card }).map(([type, component]) => [type, strict(component)]),
  )

  test('the check finds nested functions', () => {
    assert.equal(findFunction({ a: [{ b: () => 1 }] }, 'props'), 'props.a.0.b')
  })

  for (const mode of ['site', 'canvas'] as const) {
    test(`no function reaches a component (${mode})`, () => {
      assert.doesNotThrow(() => render({ layout: everything, components: strictComponents, mode, resolveLink: () => '/x' }))
    })
  }

  test('the built-in rich text gets the resolver without a prop', () => {
    const layout: Layout = { version: 1, blocks: [{ id: 'rt', type: 'richText', props: { content: lexical(internalLink) } }] }
    assert.match(render({ layout, resolveLink: () => '/custom' }), /<a href="\/custom">about<\/a>/)
    // The same resolver gives the same component type, so React keeps the DOM between renders.
    const seen = new Set<unknown>()
    const Spy = (props: BlockComponentProps) => {
      seen.add(props)
      return null
    }
    render({ layout, components: { richText: Spy } })
    assert.equal(seen.size, 1)
    assert.equal(findFunction([...seen][0], 'props'), null)
  })
})

describe('links arrive resolved', () => {
  test('top level, in groups and in array rows', () => {
    let received: Record<string, unknown> = {}
    const Spy = ({ props }: BlockComponentProps) => {
      received = props
      return null
    }
    const layout: Layout = {
      version: 1,
      blocks: [
        {
          id: 'c',
          type: 'card',
          props: {
            link: pageRef,
            extra: { more: { type: 'url', url: 'https://x.dev', newTab: true } },
            rows: [{ id: 'r', cta: { type: 'url', url: '' } }, { id: 's', cta: 'bad' }],
            title: 'T',
          },
        },
      ],
    }
    render({ layout, components: { card: Spy } })
    assert.deepEqual(received.link, { ...pageRef, url: null, newTab: false, href: '/about' })
    assert.deepEqual((received.extra as { more: ResolvedLink }).more, {
      type: 'url',
      url: 'https://x.dev',
      reference: null,
      newTab: true,
      href: 'https://x.dev',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    const rows = received.rows as Array<{ cta: ResolvedLink }>
    assert.equal(rows[0]!.cta.href, null)
    assert.equal(rows[1]!.cta.href, null)
    assert.equal(received.title, 'T')
  })

  test('the stored layout is not changed', () => {
    const layout: Layout = { version: 1, blocks: [{ id: 'b', type: 'button', props: { label: 'Go', link: pageRef } }] }
    const before = structuredClone(layout)
    assert.equal(render({ layout }), '<a href="/about">Go</a>')
    assert.deepEqual(layout, before)
  })

  test('the custom resolver applies to every link group', () => {
    const layout: Layout = { version: 1, blocks: [{ id: 'c', type: 'card', props: { link: pageRef, title: 'T' } }] }
    assert.equal(render({ layout, components: { card: Card }, resolveLink: () => '/pages/7' }), '<a href="/pages/7">T</a>')
  })
})

describe('editor attributes: canvas only', () => {
  test('site mode emits no data- attributes and skips hidden and unknown blocks', () => {
    const html = render({ layout: everything, components: { card: Card } })
    assert.ok(!html.includes('data-'), html)
    assert.ok(!html.includes('Hidden'))
    assert.ok(!html.includes('mystery'))
  })

  test('canvas mode marks every block, hidden and unknown ones included', () => {
    const html = render({ layout: everything, components: { card: Card }, mode: 'canvas' })
    const ids: string[] = []
    const walk = (list: Block[]) => {
      for (const block of list) {
        ids.push(block.id)
        for (const children of Object.values(block.slots ?? {})) walk(children)
      }
    }
    walk(everything.blocks)
    for (const id of ids) {
      // Example children reuse ids, so only check presence.
      assert.match(html, new RegExp(`data-block-id="${id}"`), id)
    }
    assert.match(html, /data-block-id="hid" data-block-type="heading" data-builder-hidden="true"/)
    assert.match(html, /data-block-id="unk" data-block-type="mystery" data-builder-unknown=""/)
  })
})

describe('component classes', () => {
  test('collectClasses adds the classes of block types in the layout', () => {
    const layout: Layout = { version: 1, blocks: [{ id: 'c', type: 'card', className: 'p-4' }] }
    assert.deepEqual(collectClasses(layout, blocks), ['hover:shadow-md', 'p-4', 'shadow-sm'])
    assert.deepEqual(collectClasses(layout), ['p-4'])
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { withoutBoundRequired } from '../core/bindings'
import { layoutJsonSchema } from '../core/schema'
import { validateLayout } from '../core/validate'
import type { BlockDefinition } from '../core/types'
import { defaultBlocks, videoUrlProblem } from './defaults'
import { isLinkField, linkField } from './link'

const TYPES = [
  'stack',
  'grid',
  'heading',
  'text',
  'richText',
  'image',
  'button',
  'link',
  'menu',
  'list',
  'quote',
  'divider',
  'spacer',
  'video',
  'field',
  'collectionList',
]

type LooseField = { name?: string; type: string; relationTo?: unknown; fields?: LooseField[]; options?: unknown[]; admin?: { custom?: Record<string, unknown> } }

const fieldsOf = (blocks: BlockDefinition[], type: string) =>
  (blocks.find((b) => b.type === type)?.fields ?? []) as LooseField[]
const linkFields = (blocks: BlockDefinition[], type: string) =>
  fieldsOf(blocks, type).find((f) => f.name === 'link')?.fields ?? []

const buttonLayout = (link: unknown) => ({ version: 1, blocks: [{ id: 'b', type: 'button', props: { label: 'Go', link } }] })

describe('defaultBlocks', () => {
  it('has the built-in blocks', () => {
    assert.deepEqual(
      defaultBlocks().map((b) => b.type),
      TYPES,
    )
  })

  it('is plain JSON data, so it can reach the admin client', () => {
    for (const blocks of [defaultBlocks(), defaultBlocks({ linkCollections: ['pages', 'posts'] })]) {
      assert.deepStrictEqual(JSON.parse(JSON.stringify(blocks)), blocks)
    }
  })

  it('uses the media collection option for image and video uploads', () => {
    const blocks = defaultBlocks({ mediaCollection: 'assets' })
    assert.equal(fieldsOf(blocks, 'image')[0]?.relationTo, 'assets')
    const uploads = fieldsOf(blocks, 'video').filter((f) => f.type === 'upload')
    assert.deepEqual(
      uploads.map((f) => [f.name, f.relationTo]),
      [
        ['video', 'assets'],
        ['poster', 'assets'],
      ],
    )
  })

  it('link group: reference only with link collections, polymorphic, with JSON conditions', () => {
    const plain = defaultBlocks()
    for (const type of ['button', 'link']) {
      assert.deepEqual(linkFields(plain, type).map((f) => f.name), ['type', 'url', 'newTab'], type)
    }

    const linked = defaultBlocks({ linkCollections: ['pages', 'posts'] })
    const fields = linkFields(linked, 'button')
    assert.deepEqual(fields.map((f) => f.name), ['type', 'url', 'reference', 'newTab'])
    const reference = fields.find((f) => f.name === 'reference')
    assert.deepEqual(reference?.relationTo, ['pages', 'posts'])
    assert.deepEqual(reference?.admin?.custom?.builderCondition, { field: 'type', equals: 'reference' })
    assert.deepEqual(fields.find((f) => f.name === 'url')?.admin?.custom?.builderCondition, { field: 'type', equals: 'url' })
  })

  it('video fields show by source', () => {
    const fields = fieldsOf(defaultBlocks(), 'video')
    const condition = (name: string) => fields.find((f) => f.name === name)?.admin?.custom?.builderCondition
    assert.deepEqual(condition('video'), { field: 'source', equals: 'upload' })
    assert.deepEqual(condition('url'), { field: 'source', equals: 'url' })
    assert.equal(condition('poster'), undefined)
    assert.equal(fields.find((f) => f.name === 'url')?.admin?.custom?.builderFormat, 'videoUrl')
  })

  it('videoUrlProblem explains links that cannot play', () => {
    for (const ok of [
      '',
      '/media/clip.mp4',
      'https://cdn.example.com/clip.mp4',
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ?t=30',
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      'https://vimeo.com/76979871',
      'https://player.vimeo.com/video/76979871',
    ]) {
      assert.equal(videoUrlProblem(ok), null, ok)
    }
    assert.match(videoUrlProblem('not a url') ?? '', /starts with https:\/\//)
    assert.match(videoUrlProblem('javascript:alert(1)') ?? '', /https:\/\//)
    assert.match(videoUrlProblem('https://www.youtube.com/watch?v=short') ?? '', /YouTube link/)
    assert.match(videoUrlProblem('https://www.youtube.com/@channel') ?? '', /YouTube link/)
    assert.match(videoUrlProblem('https://vimeo.com/channels/staffpicks') ?? '', /Vimeo link/)
  })

  it('every AI example is a valid block, with and without link collections', () => {
    for (const blocks of [defaultBlocks(), defaultBlocks({ linkCollections: ['pages'] })]) {
      for (const def of blocks) {
        assert.ok(def.ai?.description, `${def.type} has no AI description`)
        assert.ok(def.ai?.example, `${def.type} has no AI example`)
        const layout = { version: 1, blocks: [{ id: 'b_example', type: def.type, ...def.ai?.example }] }
        // Bound props may stay empty: the document fills them.
        assert.deepEqual(withoutBoundRequired(validateLayout(layout, blocks), layout), [], def.type)
      }
    }
  })

  it('validates reference links as { relationTo, value }', () => {
    const blocks = defaultBlocks({ linkCollections: ['pages'] })
    assert.deepEqual(validateLayout(buttonLayout({ type: 'reference', reference: { relationTo: 'pages', value: 3 } }), blocks), [])
    assert.equal(validateLayout(buttonLayout({ type: 'reference', reference: 3 }), blocks).length, 1)
  })

  it('produces a serializable layout schema', () => {
    const schema = layoutJsonSchema(defaultBlocks())
    assert.deepEqual(Object.keys(schema.$defs as object), TYPES)
  })

  it('has an icon (the type name) and a library category for every block', () => {
    const categories = Object.fromEntries(defaultBlocks().map((b) => [b.type, [b.icon, b.category]]))
    assert.deepEqual(categories, {
      stack: ['stack', 'Layout'],
      grid: ['grid', 'Layout'],
      heading: ['heading', 'Content'],
      text: ['text', 'Content'],
      richText: ['richText', 'Content'],
      image: ['image', 'Media'],
      button: ['button', 'Interactive'],
      link: ['link', 'Interactive'],
      menu: ['menu', 'Interactive'],
      list: ['list', 'Content'],
      quote: ['quote', 'Content'],
      divider: ['divider', 'Layout'],
      spacer: ['spacer', 'Layout'],
      video: ['video', 'Media'],
      field: ['field', 'Dynamic'],
      collectionList: ['collectionList', 'Dynamic'],
    })
  })

  it('a link holds only non-interactive content, at any depth', () => {
    const slot = defaultBlocks().find((b) => b.type === 'link')?.slots?.children
    for (const type of ['link', 'button', 'menu', 'richText', 'video', 'collectionList', 'form']) {
      assert.ok(!slot?.allow?.includes(type), `${type} is allowed`)
      assert.ok(slot?.disallow?.includes(type), `${type} is not disallowed`)
    }
    assert.ok(slot?.allow?.includes('heading'))
  })

  it('the image is optional, so a section with an empty image can publish', () => {
    const blocks = defaultBlocks()
    const layout = { version: 1, blocks: [{ id: 'i', type: 'image', props: { alt: 'Team' } }] }
    assert.deepEqual(validateLayout(layout, blocks), [])
  })

  it('the menu lists every class its component uses', () => {
    const menu = defaultBlocks().find((b) => b.type === 'menu')
    for (const name of ['group', 'md:contents', 'lg:hidden', 'group-open:block', 'aria-[current=page]:underline']) {
      assert.ok(menu?.classes?.includes(name), name)
    }
  })

  it('heading and text wrap long words', () => {
    const blocks = defaultBlocks()
    for (const type of ['heading', 'text']) {
      assert.match(blocks.find((b) => b.type === type)?.defaultClassName ?? '', /(^|\s)break-words(\s|$)/, type)
    }
  })

  it('the list block starts without a list-style class', () => {
    const list = defaultBlocks().find((b) => b.type === 'list')
    assert.equal(list?.defaultClassName, 'pl-6 space-y-1')
  })
})

describe('linkField', () => {
  it('is a marked group, found by isLinkField', () => {
    const field = linkField({ name: 'cta', label: 'CTA', collections: ['pages'] })
    assert.equal(field.name, 'cta')
    assert.equal(field.label, 'CTA')
    assert.ok(isLinkField(field))
    assert.ok(isLinkField(JSON.parse(JSON.stringify(field))))
    assert.ok(!isLinkField({ type: 'group', name: 'link', fields: [] }))
    assert.ok(!isLinkField(null))
    for (const type of ['button', 'link']) {
      assert.ok(isLinkField(fieldsOf(defaultBlocks(), type).find((f) => f.name === 'link')), type)
    }
  })
})

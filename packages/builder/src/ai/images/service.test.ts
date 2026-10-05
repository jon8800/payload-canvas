import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { BlockDefinition, Layout } from '../../core/types'
import { builderMcpTools } from '../../mcp'
import { aiEndpoints, assistantImageGenerator } from '../endpoint'
import { runTool, Workspace, type ToolEnv } from '../tools'
import type { AiImageRequest } from '../types'
import { fakeImageAdapter } from './fake'
import { AI_IMAGES_KEY, altFromPrompt, createImageService, generatedFilename, generateImageToMedia, HourlyLimiter, IMAGES_NOT_CONFIGURED, memoryCountStore, type ImageCountStore } from './service'
import { AiImageError } from './shared'

type Field = { name: string; type: string }

/** A fake request: a media upload collection, a pages collection, and Payload's create. */
function fakeReq(options: { user?: Record<string, unknown> | null; canCreate?: boolean; fields?: Field[]; createFails?: boolean; custom?: Record<string, unknown>; kv?: ImageCountStore } = {}) {
  const created: Array<Record<string, unknown>> = []
  const user = options.user === undefined ? { id: 'u1', collection: 'users', email: 'a@b.c' } : options.user
  const payload = {
    collections: {
      media: { config: { slug: 'media', upload: { mimeTypes: ['image/*'] }, fields: options.fields ?? [{ name: 'alt', type: 'text' }], access: { create: ({ req }: { req: PayloadRequest }) => Boolean(req.user) && options.canCreate !== false } } },
      docs: { config: { slug: 'docs', upload: { mimeTypes: ['application/pdf'] }, fields: [] } },
      pages: { config: { slug: 'pages', fields: [] } },
    },
    config: { custom: options.custom ?? {} },
    ...(options.kv ? { kv: options.kv } : {}),
    logger: { info: () => {}, error: () => {} },
    create: async (args: Record<string, unknown>) => {
      created.push(args)
      if (options.createFails) throw new Error('The file is too large.')
      const file = args.file as { name: string; mimetype: string; size: number }
      const data = args.data as Record<string, unknown>
      return { id: 42, alt: data.alt, filename: file.name, url: `/api/media/file/${file.name}`, mimeType: file.mimetype, width: 640, height: 360, filesize: file.size, sizes: { thumbnail: { url: '/api/media/file/thumb.png' } } }
    },
  }
  return { req: { user, payload } as unknown as PayloadRequest, created }
}

function counting(options: Parameters<typeof fakeImageAdapter>[0] = {}) {
  const requests: AiImageRequest[] = []
  return { adapter: fakeImageAdapter({ ...options, onRequest: (r) => requests.push(r) }), requests }
}

describe('generateImageToMedia', () => {
  it('explains the setup when no image adapter is configured', async () => {
    const { req } = fakeReq()
    const outcome = await generateImageToMedia(req, createImageService({}), { prompt: 'Coffee beans', source: 'editor' })
    assert.equal(outcome.ok, false)
    assert.equal(!outcome.ok && outcome.code, 'not_configured')
    assert.equal(!outcome.ok && outcome.message, IMAGES_NOT_CONFIGURED)
    const notReady = await generateImageToMedia(req, createImageService({ images: { ...fakeImageAdapter(), ready: false, setupProblem: 'Set MY_KEY.' } }), { prompt: 'Coffee', source: 'mcp' })
    assert.match(!notReady.ok ? notReady.message : '', /Set MY_KEY\. See docs\/ai\/images\.md/)
    assert.equal((await generateImageToMedia(req, null, { prompt: 'Coffee', source: 'mcp' })).ok, false)
  })

  it('generates, uploads as the user with alt text, and returns the media', async () => {
    const { adapter, requests } = counting({ costPerImage: 0.01 })
    const { req, created } = fakeReq()
    const service = createImageService({ images: adapter })
    const outcome = await generateImageToMedia(req, service, { prompt: 'Fresh coffee beans on a table. Soft light.', aspectRatio: '16:9', source: 'assistant' })
    assert.ok(outcome.ok)
    assert.deepEqual(requests.map((r) => [r.prompt, r.aspectRatio, r.n]), [['Fresh coffee beans on a table. Soft light.', '16:9', 1]])
    assert.equal(created.length, 1)
    const args = created[0]
    assert.equal(args.collection, 'media')
    assert.equal(args.overrideAccess, false)
    assert.equal(args.user, req.user)
    assert.deepEqual(args.data, { alt: 'Fresh coffee beans on a table' })
    const file = args.file as { data: Buffer; mimetype: string; name: string; size: number }
    assert.equal(file.mimetype, 'image/png')
    assert.match(file.name, /^ai-fresh-coffee-beans-on-a-table-soft-light-[a-z0-9]+\.png$/)
    assert.equal(file.size, file.data.length)
    assert.deepEqual(outcome.media, {
      id: 42,
      collection: 'media',
      alt: 'Fresh coffee beans on a table',
      filename: file.name,
      url: `/api/media/file/${file.name}`,
      thumbnailUrl: '/api/media/file/thumb.png',
      mimeType: 'image/png',
      width: 640,
      height: 360,
      filesize: file.size,
    })
    assert.equal(outcome.cost, 0.01)
    assert.equal(outcome.model, 'gradient')
    assert.equal(outcome.remainingThisHour, 19)
  })

  it('writes the "generated by" note only into a field the collection has', async () => {
    const service = createImageService({ images: fakeImageAdapter() })
    const text = fakeReq({ fields: [{ name: 'alt', type: 'text' }, { name: 'generatedBy', type: 'textarea' }] })
    await generateImageToMedia(text.req, service, { prompt: 'Beans', alt: 'Roasted beans', source: 'mcp' })
    const data = text.created[0].data as Record<string, unknown>
    assert.equal(data.alt, 'Roasted beans')
    assert.match(String(data.generatedBy), /^AI image \(Test image model, gradient, \d{4}-\d{2}-\d{2}\): Beans$/)

    const json = fakeReq({ fields: [{ name: 'aiNote', type: 'json' }] })
    await generateImageToMedia(json.req, createImageService({ images: fakeImageAdapter(), imageMarkerField: 'aiNote' }), { prompt: 'Beans', source: 'editor' })
    const note = (json.created[0].data as Record<string, unknown>).aiNote as Record<string, unknown>
    assert.deepEqual({ ...note, at: undefined }, { adapter: 'fake', model: 'gradient', prompt: 'Beans', aspectRatio: '1:1', source: 'editor', at: undefined })
    assert.equal('alt' in (json.created[0].data as object), false, 'no alt field, no alt')

    const off = fakeReq({ fields: [{ name: 'generatedBy', type: 'text' }] })
    await generateImageToMedia(off.req, createImageService({ images: fakeImageAdapter(), imageMarkerField: false }), { prompt: 'Beans', source: 'editor' })
    assert.deepEqual(off.created[0].data, {})
  })

  it('checks input, collection and access before the paid call', async () => {
    const { adapter, requests } = counting()
    const service = createImageService({ images: adapter })
    const cases: Array<[Parameters<typeof generateImageToMedia>[2], ReturnType<typeof fakeReq>, string, RegExp]> = [
      [{ prompt: 'x', source: 'editor' }, fakeReq(), 'invalid_request', /Describe the image/],
      [{ prompt: 'Beans', aspectRatio: '5:4', source: 'editor' }, fakeReq(), 'invalid_request', /Unknown aspect ratio "5:4"/],
      [{ prompt: 'Beans', collection: 'pages', source: 'editor' }, fakeReq(), 'invalid_request', /not an upload collection/],
      [{ prompt: 'Beans', collection: 'docs', source: 'editor' }, fakeReq(), 'invalid_request', /does not accept images/],
      [{ prompt: 'Beans', collection: 'nope', source: 'editor' }, fakeReq(), 'invalid_request', /does not exist/],
      [{ prompt: 'Beans', source: 'editor' }, fakeReq({ canCreate: false }), 'forbidden', /may not upload to "media"/],
      [{ prompt: 'Beans', source: 'editor' }, fakeReq({ user: null }), 'forbidden', /Sign in/],
    ]
    for (const [input, { req, created }, code, message] of cases) {
      const outcome = await generateImageToMedia(req, service, input)
      assert.equal(!outcome.ok && outcome.code, code, String(message))
      assert.match(!outcome.ok ? outcome.message : '', message)
      assert.equal(created.length, 0)
    }
    assert.equal(requests.length, 0)
  })

  it('caps images per user per hour, and gives back failed attempts', async () => {
    let now = 1_000_000
    const failing = { fail: false }
    const adapter = { ...fakeImageAdapter(), generate: async (r: AiImageRequest) => (failing.fail ? Promise.reject(new AiImageError('api_error', 'Provider down')) : fakeImageAdapter().generate(r)) }
    const service = createImageService({ images: adapter, imageLimits: { perHour: 2 } }, { now: () => now })
    const { req } = fakeReq()
    const other = fakeReq({ user: { id: 'u2', collection: 'users' } })
    assert.equal((await generateImageToMedia(req, service, { prompt: 'One', source: 'editor' })).ok, true)
    failing.fail = true
    const failed = await generateImageToMedia(req, service, { prompt: 'Two', source: 'editor' })
    assert.equal(!failed.ok && failed.code, 'api_error')
    assert.match(!failed.ok ? failed.message : '', /Provider down/)
    failing.fail = false
    assert.equal((await generateImageToMedia(req, service, { prompt: 'Two', source: 'editor' })).ok, true, 'the failed attempt did not count')
    const limited = await generateImageToMedia(req, service, { prompt: 'Three', source: 'editor' })
    assert.equal(!limited.ok && limited.code, 'rate_limited')
    assert.equal(!limited.ok && limited.status, 429)
    assert.match(!limited.ok ? limited.message : '', /limit of 2 generated images per hour\. Try again in about 60 minutes/)
    assert.equal((await generateImageToMedia(other.req, service, { prompt: 'Other user', source: 'editor' })).ok, true, 'the limit is per user')
    now += 61 * 60_000
    assert.equal((await generateImageToMedia(req, service, { prompt: 'Later', source: 'editor' })).ok, true)
  })

  it('reports an upload failure after the image was made', async () => {
    const { req } = fakeReq({ createFails: true })
    const outcome = await generateImageToMedia(req, createImageService({ images: fakeImageAdapter() }), { prompt: 'Beans', source: 'editor' })
    assert.equal(!outcome.ok && outcome.status, 500)
    assert.match(!outcome.ok ? outcome.message : '', /generated but could not be saved in "media": The file is too large/)
  })

  it('names files and alt texts from the prompt', () => {
    assert.match(generatedFilename('Café au lait!', 'image/jpeg'), /^ai-cafe-au-lait-[a-z0-9]+\.jpg$/)
    assert.equal(altFromPrompt('A red bike. Studio light.'), 'A red bike')
    assert.ok(altFromPrompt('word '.repeat(60)).length <= 120)
  })

  it('HourlyLimiter counts in a sliding hour', async () => {
    let now = 0
    const limiter = new HourlyLimiter(1, () => now)
    const reservation = await limiter.take('a')
    assert.equal(reservation, 0)
    assert.equal(await limiter.take('a'), null)
    assert.equal(await limiter.minutesUntilFree('a'), 60)
    now = 30 * 60_000
    assert.equal(await limiter.minutesUntilFree('a'), 30)
    await limiter.release('a', reservation!)
    assert.equal(await limiter.remaining('a'), 1)
  })

  it('HourlyLimiter lets parallel requests of one user take only the free places', async () => {
    const limiter = new HourlyLimiter(2, () => 5, memoryCountStore())
    const taken = await Promise.all([limiter.take('a'), limiter.take('a'), limiter.take('a')])
    assert.deepEqual(taken, [5, 5, null])
  })
})

/** A store that records its keys, like Payload's `payload-kv` collection. */
function sharedStore() {
  const store = memoryCountStore()
  const keys = new Set<string>()
  const shared: ImageCountStore = {
    get: store.get,
    set: async (key, value) => {
      keys.add(key)
      await store.set(key, value)
    },
    delete: async (key) => {
      keys.delete(key)
      await store.delete(key)
    },
  }
  return { keys, store: shared }
}

describe('hourly image count in a shared store', () => {
  it('keeps the count across two service instances (a restart, or a second server)', async () => {
    const { store, keys } = sharedStore()
    const first = createImageService({ images: fakeImageAdapter(), imageLimits: { perHour: 2 } }, { store })
    const { req } = fakeReq()
    assert.equal((await generateImageToMedia(req, first, { prompt: 'One', source: 'editor' })).ok, true)
    assert.deepEqual([...keys], ['website-builder:image-count:users:u1'])

    const second = createImageService({ images: fakeImageAdapter(), imageLimits: { perHour: 2 } }, { store })
    const two = await generateImageToMedia(req, second, { prompt: 'Two', source: 'mcp' })
    assert.equal(two.ok && two.remainingThisHour, 0)
    const limited = await generateImageToMedia(req, first, { prompt: 'Three', source: 'assistant' })
    assert.equal(!limited.ok && limited.code, 'rate_limited')
    assert.match(!limited.ok ? limited.message : '', /limit of 2 generated images per hour/)
  })

  it('uses payload.kv from the request when no store is given', async () => {
    const { store, keys } = sharedStore()
    const service = createImageService({ images: fakeImageAdapter(), imageLimits: { perHour: 1 } })
    assert.equal((await generateImageToMedia(fakeReq({ kv: store }).req, service, { prompt: 'One', source: 'editor' })).ok, true)
    assert.equal(keys.size, 1)
    const restarted = createImageService({ images: fakeImageAdapter(), imageLimits: { perHour: 1 } })
    const limited = await generateImageToMedia(fakeReq({ kv: store }).req, restarted, { prompt: 'Two', source: 'editor' })
    assert.equal(!limited.ok && limited.code, 'rate_limited')
  })

  it('frees places when the hour rolls over', async () => {
    const { store, keys } = sharedStore()
    let now = 1_000_000
    const service = createImageService({ images: fakeImageAdapter(), imageLimits: { perHour: 2 } }, { now: () => now, store })
    const { req } = fakeReq()
    await generateImageToMedia(req, service, { prompt: 'One', source: 'editor' })
    now += 20 * 60_000
    await generateImageToMedia(req, service, { prompt: 'Two', source: 'editor' })
    now += 30 * 60_000
    const limited = await generateImageToMedia(req, service, { prompt: 'Three', source: 'editor' })
    assert.match(!limited.ok ? limited.message : '', /Try again in about 10 minutes/)
    now += 10 * 60_000 + 1
    const four = await generateImageToMedia(req, service, { prompt: 'Four', source: 'editor' })
    assert.equal(four.ok && four.remainingThisHour, 0, 'the first image dropped out, the second still counts')
    now += 2 * 60 * 60_000
    assert.equal(await service.limiter.remaining('users:u1', store), 2)
    assert.equal(keys.size, 1)
  })

  it('does not count failed attempts (adapter error, access refused); a paid image that failed to upload counts', async () => {
    const { store, keys } = sharedStore()
    const failing = { fail: false }
    const adapter = { ...fakeImageAdapter(), generate: async (r: AiImageRequest) => (failing.fail ? Promise.reject(new AiImageError('api_error', 'Provider down')) : fakeImageAdapter().generate(r)) }
    const service = createImageService({ images: adapter, imageLimits: { perHour: 1 } }, { store })

    failing.fail = true
    assert.equal((await generateImageToMedia(fakeReq().req, service, { prompt: 'Beans', source: 'editor' })).ok, false)
    failing.fail = false
    const refused = await generateImageToMedia(fakeReq({ canCreate: false }).req, service, { prompt: 'Beans', source: 'editor' })
    assert.equal(!refused.ok && refused.code, 'forbidden')
    assert.equal(keys.size, 0, 'nothing is stored')
    assert.equal(await service.limiter.remaining('users:u1', store), 1)
    const upload = await generateImageToMedia(fakeReq({ createFails: true }).req, service, { prompt: 'Beans', source: 'editor' })
    assert.equal(!upload.ok && upload.status, 500)
    assert.equal(await service.limiter.remaining('users:u1', store), 0, 'the paid image counts')
  })

  it('generates nothing when the store cannot be read', async () => {
    const { adapter, requests } = counting()
    const broken: ImageCountStore = {
      get: async () => Promise.reject(new Error('relation "payload_kv" does not exist')),
      set: async () => {},
      delete: async () => {},
    }
    const outcome = await generateImageToMedia(fakeReq().req, createImageService({ images: adapter }, { store: broken }), { prompt: 'Beans', source: 'editor' })
    assert.equal(!outcome.ok && outcome.status, 503)
    assert.equal(requests.length, 0)
  })
})

// ---------------------------------------------------------------------------
// The assistant tool
// ---------------------------------------------------------------------------

const blocks: BlockDefinition[] = [
  { type: 'image', label: 'Image', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }, { name: 'alt', type: 'text' }] },
  { type: 'gallery', label: 'Gallery', fields: [{ name: 'images', type: 'upload', relationTo: 'media', hasMany: true }] },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] },
]
const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'b_img', type: 'image' },
    { id: 'b_gal', type: 'gallery', props: { images: [7] } },
    { id: 'b_head', type: 'heading', props: { text: 'Hi' } },
  ],
}

function toolEnv(generateImage?: ToolEnv['generateImage']): ToolEnv {
  return { blocks, sections: [], bindingSources: null, searchMedia: async () => [], generateImage, mediaCollection: 'media' }
}

describe('generateImage tool (assistant)', () => {
  it('generates and places the image in the block', async () => {
    const { req } = fakeReq()
    const service = createImageService({ images: fakeImageAdapter() })
    const workspace = new Workspace(structuredClone(layout), blocks)
    const outcome = await runTool('generateImage', { prompt: 'Coffee beans', aspectRatio: '16:9', alt: 'Beans', blockId: 'b_img' }, workspace, toolEnv(assistantImageGenerator(req, service, new AbortController().signal)))
    assert.equal(outcome.ok, true)
    assert.equal(outcome.summary, 'Generated an image and placed it')
    assert.deepEqual(outcome.ops, [{ type: 'update', id: 'b_img', props: { image: 42 } }])
    assert.deepEqual(outcome.image, { id: 42, url: '/api/media/file/thumb.png', alt: 'Beans', width: 640, height: 360 })
    const content = JSON.parse(outcome.content)
    assert.deepEqual(content.placed, { blockId: 'b_img', prop: 'image' })
    assert.equal(content.media.id, 42)
    assert.equal(workspace.layout.blocks[0].props?.image, 42)
  })

  it('adds to a hasMany prop, and returns the id without a block', async () => {
    const { req } = fakeReq()
    const service = createImageService({ images: fakeImageAdapter() })
    const env = toolEnv(assistantImageGenerator(req, service, new AbortController().signal))
    const workspace = new Workspace(structuredClone(layout), blocks)
    const gallery = await runTool('generateImage', { prompt: 'More beans', blockId: 'b_gal' }, workspace, env)
    assert.deepEqual(gallery.ops, [{ type: 'update', id: 'b_gal', props: { images: [7, 42] } }])
    const loose = await runTool('generateImage', { prompt: 'Beans', blockId: null, prop: null }, workspace, env)
    assert.equal(loose.ok, true)
    assert.equal(loose.ops, undefined)
    assert.match(JSON.parse(loose.content).next, /applyOperations/)
  })

  it('refuses a block without an image prop before generating', async () => {
    const { adapter, requests } = counting()
    const { req } = fakeReq()
    const env = toolEnv(assistantImageGenerator(req, createImageService({ images: adapter }), new AbortController().signal))
    const workspace = new Workspace(structuredClone(layout), blocks)
    const heading = await runTool('generateImage', { prompt: 'Beans', blockId: 'b_head' }, workspace, env)
    assert.equal(heading.ok, false)
    assert.match(heading.content, /has no image prop/)
    const missing = await runTool('generateImage', { prompt: 'Beans', blockId: 'b_nope' }, workspace, env)
    assert.match(missing.content, /not found/)
    const wrongProp = await runTool('generateImage', { prompt: 'Beans', blockId: 'b_img', prop: 'alt' }, workspace, env)
    assert.match(JSON.parse(wrongProp.content).error, /no image prop "alt"\. Its image props: image/)
    assert.equal(requests.length, 0)
  })

  it('caps images per reply', async () => {
    const { req } = fakeReq()
    const env = toolEnv(assistantImageGenerator(req, createImageService({ images: fakeImageAdapter(), imageLimits: { perRequest: 1 } }), new AbortController().signal))
    const workspace = new Workspace(structuredClone(layout), blocks)
    assert.equal((await runTool('generateImage', { prompt: 'One' }, workspace, env)).ok, true)
    const second = await runTool('generateImage', { prompt: 'Two' }, workspace, env)
    assert.equal(second.ok, false)
    assert.match(second.content, /already generated 1 image, the limit per request/)
  })

  it('explains the setup without an image adapter', async () => {
    const workspace = new Workspace(structuredClone(layout), blocks)
    const none = await runTool('generateImage', { prompt: 'Beans' }, workspace, toolEnv())
    assert.equal(none.summary, `Image generation is not set up: ${IMAGES_NOT_CONFIGURED}`)
    const { req } = fakeReq()
    const unset = await runTool('generateImage', { prompt: 'Beans' }, workspace, toolEnv(assistantImageGenerator(req, createImageService({}), new AbortController().signal)))
    assert.match(unset.content, /docs\/ai\/images\.md/)
  })
})

// ---------------------------------------------------------------------------
// Editor endpoint and MCP tool
// ---------------------------------------------------------------------------

/** The image endpoint's handler. */
function endpoint(images = createImageService({ images: fakeImageAdapter() })) {
  const found = aiEndpoints({ ai: {}, images, collections: {}, blocks, sections: [], getTokens: async () => null, templates: null }).find((e) => e.path === '/builder/ai/image')
  if (!found) throw new Error('No image endpoint')
  return found
}

const result = (value: { content: Array<{ text: string }>; isError?: boolean }) => value

describe('POST /builder/ai/image', () => {
  it('generates for a signed-in user and answers JSON', async () => {
    const { req, created } = fakeReq()
    Object.assign(req, { data: { prompt: 'Coffee beans', aspectRatio: '4:3', alt: 'Beans' } })
    const response = (await endpoint().handler(req)) as Response
    assert.equal(response.status, 200)
    const body = (await response.json()) as Record<string, unknown>
    assert.equal((body.media as Record<string, unknown>).id, 42)
    assert.equal(body.aspectRatio, '4:3')
    assert.equal((created[0].data as Record<string, unknown>).alt, 'Beans')
  })

  it('answers 401, 400 and 501 with a message', async () => {
    const anonymous = fakeReq({ user: null }).req
    assert.equal(((await endpoint().handler(anonymous)) as Response).status, 401)
    const bad = fakeReq().req
    Object.assign(bad, { data: { prompt: 'Beans', aspectRatio: 'square' } })
    assert.equal(((await endpoint().handler(bad)) as Response).status, 400)
    const unset = fakeReq().req
    Object.assign(unset, { data: { prompt: 'Beans' } })
    const response = (await endpoint(createImageService({})).handler(unset)) as Response
    assert.equal(response.status, 501)
    assert.deepEqual(await response.json(), { code: 'not_configured', error: IMAGES_NOT_CONFIGURED })
  })
})

describe('generateImage tool (MCP)', () => {
  const tool = builderMcpTools({ blocks, collections: { pages: {} } }).find((t) => t.name === 'generateImage')

  it('takes the media collection and an aspect ratio', () => {
    assert.ok(tool)
    assert.deepEqual(tool.routing, { kind: 'collection', action: 'create' })
    const schema = z.object(tool.parameters)
    assert.equal(schema.safeParse({ collection: 'media', prompt: 'Beans', aspectRatio: '16:9' }).success, true)
    assert.equal(schema.safeParse({ collection: 'pages', prompt: 'Beans' }).success, false)
    assert.equal(schema.safeParse({ collection: 'media', prompt: 'Beans', aspectRatio: '5:4' }).success, false)
  })

  it('generates with the plugin\'s image service, as the key\'s user', async () => {
    const service = createImageService({ images: fakeImageAdapter() })
    const { req, created } = fakeReq({ custom: { [AI_IMAGES_KEY]: service } })
    const out = result(await tool!.handler({ collection: 'media', prompt: 'Coffee beans', aspectRatio: '21:9' }, req, {}))
    assert.equal(out.isError, undefined)
    const body = JSON.parse(out.content[0].text)
    assert.equal(body.media.id, 42)
    assert.equal(body.media.alt, 'Coffee beans')
    assert.equal(body.imagesLeftThisHour, 19)
    assert.match(body.next, /"image":42/)
    assert.equal(created[0].overrideAccess, false)
  })

  it('explains the setup when the site has no image adapter', async () => {
    const { req } = fakeReq()
    const out = result(await tool!.handler({ collection: 'media', prompt: 'Coffee beans' }, req, {}))
    assert.equal(out.isError, true)
    assert.match(out.content[0].text, /Image generation is not set up on this site/)
  })
})

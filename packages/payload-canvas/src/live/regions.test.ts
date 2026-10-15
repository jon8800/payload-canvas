import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveRegions } from '../core/regions'
import type { RegionConfig } from '../core/types'
import { KEEP_LOCK_CONTEXT, createSettingsLocks } from './fieldsGuard'
import { parseChanges, regionAccessFrom, regionEndpoints, REGION_SAVE_CONTEXT, writeRegionFields } from './regions'
import type { LiveRuntime } from './runtime'
import { createSessionManager, type SessionTarget } from './session'
import { createWriteGate, writeKey, type WriteGate } from './writeGate'
import type { RegionAccess } from './types'

type Doc = Record<string, unknown>

// A neutral collection: a title, a subtitle, a cover image, a list of links and a group.
const fields = [
  { name: 'title', type: 'text', localized: true },
  { name: 'subtitle', type: 'text' },
  { name: 'cover', type: 'upload', relationTo: 'media' },
  { name: 'links', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'url', type: 'text' }] },
  { name: 'meta', type: 'group', fields: [{ name: 'note', type: 'text' }, { name: 'secret', type: 'text' }] },
  { name: 'layout', type: 'json' },
]
const regions: RegionConfig[] = resolveRegions('pages', fields, [{ name: 'header', fields: ['title', 'subtitle', 'cover', 'links', 'meta.note'] }], {
  fields: new Set(['layout']),
})
const allowAll = async (): Promise<RegionAccess> => regionAccessFrom({ update: true, fields: true }, regions)
const subtitleReadOnly = async (): Promise<RegionAccess> => ({ subtitle: { read: true, update: false }, title: { read: true, update: true } })
const target: SessionTarget = { collection: 'pages', id: 7, field: 'layout', drafts: true, autosave: true }
const ana = { id: 1, name: 'Ana' }
const tick = () => new Promise((resolve) => setImmediate(resolve))

/**
 * A fake Local API: one document with drafts. `title` is localized (`en` and `de`); a read in a
 * locale falls back to `en` unless `fallbackLocale: 'none'`. An update merges the data onto the
 * newest version, in its locale. Every update runs the write gate's hooks, as Payload would.
 */
function fakePayload(options: { gate?: WriteGate; failWith?: unknown; localized?: boolean; hidden?: string[]; onSaved?: () => void } = {}) {
  let doc: Doc = {
    id: 7,
    title: { en: 'Welcome', de: null },
    subtitle: 'Sub',
    cover: 3,
    links: [
      { id: 'r1', label: 'One', url: '/one' },
      { id: 'r2', label: 'Two', url: '/two' },
    ],
    meta: { note: 'Note', secret: 'hidden' },
    layout: { version: 1, blocks: [] },
    updatedAt: '2026-10-15T10:00:00.000Z',
  }
  let clock = 0
  const reads: Doc[] = []
  const writes: Doc[] = []
  const view = (locale: string | undefined, fallback: boolean): Doc => {
    const title = doc.title as Record<string, string | null>
    const own = title[locale ?? 'en'] ?? null
    return { ...structuredClone(doc), title: own ?? (fallback ? title.en : null) }
  }
  const payload = {
    config: { localization: options.localized === false ? undefined : { locales: ['en', 'de'], defaultLocale: 'en', fallback: true } },
    collections: { pages: { config: { versions: { drafts: { autosave: true } } } } },
    db: { defaultIDType: 'number' },
    logger: { error() {} },
    async findByID(args: Doc) {
      reads.push(args)
      const result = view(args.locale as string | undefined, args.fallbackLocale !== 'none')
      // Payload's field read access: a read as the user leaves out what the user may not read.
      if (args.overrideAccess === false) {
        for (const path of options.hidden ?? []) {
          const [top, child] = path.split('.')
          if (child) delete (result[top] as Doc | undefined)?.[child]
          else delete result[top]
        }
      }
      return result
    },
    async update(args: Doc) {
      const req = (args.req ?? {}) as object
      const hooks = options.gate?.hooks('pages')
      const opArgs = { id: args.id, data: args.data, req }
      await hooks?.beforeOperation({ args: opArgs, operation: 'update', req } as never)
      const base = structuredClone(doc)
      await tick()
      // The plugin's afterChange queues the `saved` event this way (plugin/hook.ts).
      if (options.onSaved) options.gate?.afterCommit(req, writeKey('pages', 7), options.onSaved)
      if (options.failWith) throw options.failWith
      writes.push(args)
      const data = structuredClone(args.data as Doc)
      if ('title' in data) data.title = { ...(base.title as Doc), [(args.locale as string) ?? 'en']: data.title }
      doc = { ...base, ...data, updatedAt: `2026-10-15T10:00:0${++clock}.000Z` }
      await hooks?.afterOperation({ args: opArgs, operation: 'updateByID', req, result: doc } as never)
      return doc
    },
  }
  return {
    payload,
    reads,
    writes,
    get doc() {
      return doc
    },
    set doc(next: Doc) {
      doc = next
    },
  }
}

function setup(options: Parameters<typeof fakePayload>[0] & { canUpdate?: boolean } = {}) {
  const gate = options.gate ?? createWriteGate()
  const db = fakePayload({ ...options, gate })
  const runtime: LiveRuntime = { sessions: createSessionManager({ logger: { error() {} } }), canUpdate: async () => options.canUpdate ?? true }
  const req = (user: unknown = ana) => ({ user, payload: db.payload, routeParams: { collection: 'pages', id: '7' } }) as never
  const write = (changes: Parameters<typeof writeRegionFields>[1]['changes'], extra: Partial<Parameters<typeof writeRegionFields>[1]> = {}) =>
    writeRegionFields(req(), { target, regions, changes, runtime, gate, access: allowAll, settingsLocks: createSettingsLocks(), ...extra })
  return { db, gate, runtime, req, write }
}

describe('region field writes', () => {
  it('saves a field as a draft through the Local API, as the user, with Payload’s lock and the plugin’s context', async () => {
    const { db, write } = setup()
    const result = await write([{ path: 'subtitle', value: 'New sub', base: 'Sub' }])
    assert.ok(result.ok)
    assert.equal(result.changed, true)
    assert.equal(db.doc.subtitle, 'New sub')
    const [saved] = db.writes
    assert.deepEqual(saved.data, { subtitle: 'New sub' })
    assert.equal(saved.draft, true)
    assert.equal(saved.autosave, true)
    assert.equal(saved.overrideAccess, false)
    assert.equal(saved.overrideLock, false)
    assert.equal(saved.user, ana)
    assert.ok(saved.req, 'the save shares the request, so it does not wait for its own gate')
    assert.deepEqual(saved.context, { [KEEP_LOCK_CONTEXT]: true, [REGION_SAVE_CONTEXT]: true })
    // The answer holds the region values as the user reads them.
    assert.equal((result.values as Doc).subtitle, 'New sub')
    assert.equal((result.values as Doc).layout, undefined)
    assert.equal(db.reads.at(-1)?.overrideAccess, false)
  })

  it('changes one row of a list and keeps the other rows and their ids', async () => {
    const { db, write } = setup()
    const result = await write([{ path: 'links.1.label', value: 'Deux', base: 'Two' }])
    assert.ok(result.ok)
    assert.deepEqual(db.writes[0].data, {
      links: [
        { id: 'r1', label: 'One', url: '/one' },
        { id: 'r2', label: 'Deux', url: '/two' },
      ],
    })
  })

  it('keeps fields of a group that the region does not show', async () => {
    const { db, write } = setup()
    await write([{ path: 'meta.note', value: 'Changed' }])
    assert.deepEqual(db.writes[0].data, { meta: { note: 'Changed', secret: 'hidden' } })
  })

  it('refuses a change when someone else changed the field since, and saves nothing', async () => {
    const { db, write } = setup()
    db.doc = { ...db.doc, subtitle: 'Their sub' }
    const result = await write([{ path: 'subtitle', value: 'Mine', base: 'Sub' }])
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.status === 409)
    assert.deepEqual(!result.ok && result.conflicts, [{ path: 'subtitle', value: 'Their sub' }])
    assert.match(!result.ok ? result.error : '', /someone else changed Subtitle/)
    assert.equal(db.writes.length, 0)
  })

  it('saves nothing when the value is already there', async () => {
    const { db, write } = setup()
    const result = await write([{ path: 'subtitle', value: 'Sub', base: 'Sub' }])
    assert.ok(result.ok && !result.changed)
    assert.equal(db.writes.length, 0)
  })

  it('refuses a row that is gone', async () => {
    const { db, write } = setup()
    const result = await write([{ path: 'links.5.label', value: 'x' }])
    assert.ok(!result.ok && result.status === 409)
    assert.equal(db.writes.length, 0)
  })

  it('refuses users without update access to the document or to the field', async () => {
    const denied = setup({ canUpdate: false })
    const result = await denied.write([{ path: 'subtitle', value: 'x' }])
    assert.ok(!result.ok && result.status === 403)
    const limited = setup()
    const refused = await limited.write([{ path: 'subtitle', value: 'x' }], { access: subtitleReadOnly })
    assert.ok(!refused.ok && refused.status === 403)
    assert.match(!refused.ok ? refused.error : '', /not allowed to change Subtitle/)
    assert.equal(limited.db.writes.length, 0)
  })

  it('refuses while the same user has the settings drawer open', async () => {
    const { db, write } = setup()
    const settingsLocks = createSettingsLocks()
    settingsLocks.add('pages', 7, 1)
    const result = await write([{ path: 'subtitle', value: 'x' }], { settingsLocks })
    assert.ok(!result.ok && result.status === 409)
    assert.match(!result.ok ? result.error : '', /settings drawer/)
    assert.equal(db.writes.length, 0)
  })

  it('says who holds the document lock, and returns validation errors per field', async () => {
    const locked = setup({ failWith: Object.assign(new Error('Locked'), { status: 423 }) })
    const lockedResult = await locked.write([{ path: 'subtitle', value: 'x' }])
    assert.ok(!lockedResult.ok && lockedResult.status === 423)
    const invalid = setup({
      failWith: Object.assign(new Error('Invalid'), { status: 400, data: { errors: [{ path: 'subtitle', message: 'Too short.' }] } }),
    })
    const invalidResult = await invalid.write([{ path: 'subtitle', value: 'x' }])
    assert.ok(!invalidResult.ok && invalidResult.status === 400)
    assert.deepEqual(!invalidResult.ok && invalidResult.errors, [{ path: 'subtitle', message: 'Subtitle: Too short.', code: 'invalid' }])
  })

  it('writes a translation in the editor’s locale and compares with the value the editor saw', async () => {
    const { db, write } = setup()
    // In German the title falls back to the English one; the editor saw "Welcome".
    const result = await write([{ path: 'title', value: 'Willkommen', base: 'Welcome' }], { locale: 'de' })
    assert.ok(result.ok)
    assert.equal(db.writes[0].locale, 'de')
    assert.deepEqual(db.doc.title, { en: 'Welcome', de: 'Willkommen' })
    // The stored values are read without the fallback, so the save never copies English into German.
    assert.ok(db.reads.some((r) => r.fallbackLocale === 'none'))
  })

  it('never loses a layout save that overlaps a region save', async () => {
    const gate = createWriteGate()
    const { db, write } = setup({ gate })
    const layoutSave = db.payload.update({ id: 7, data: { layout: { version: 1, blocks: [{ id: 'b1', type: 'text' }] } }, req: {} })
    const regionSave = write([{ path: 'subtitle', value: 'Both', base: 'Sub' }])
    const [, region] = await Promise.all([layoutSave, regionSave])
    assert.ok(region.ok)
    assert.equal(db.doc.subtitle, 'Both')
    assert.deepEqual((db.doc.layout as Doc).blocks, [{ id: 'b1', type: 'text' }])
  })
})

describe('region writes and their events', () => {
  it('announces a region save once it is stored, and never a save whose error the endpoint caught', async () => {
    let saved = 0
    const ok = setup({ onSaved: () => saved++ })
    assert.ok((await ok.write([{ path: 'subtitle', value: 'Stored' }])).ok)
    assert.equal(saved, 1)
    const failing = setup({ onSaved: () => saved++, failWith: Object.assign(new Error('Invalid'), { status: 400, data: { errors: [{ path: 'subtitle', message: 'Too short.' }] } }) })
    const result = await failing.write([{ path: 'subtitle', value: 'x' }])
    assert.ok(!result.ok && result.status === 400)
    assert.equal(saved, 1, 'the failed save is never announced')
    assert.equal(failing.gate.size(), 0)
  })
})

describe('region requests', () => {
  it('accepts changes inside the regions only', () => {
    assert.deepEqual(parseChanges(regions, { changes: [{ path: 'links.0.label', value: 'A', base: 'B' }] }), [{ path: 'links.0.label', value: 'A', base: 'B' }])
    assert.match(String(parseChanges(regions, { changes: [] })), /must be a list/)
    assert.match(String(parseChanges(regions, { changes: [{ path: 'layout', value: {} }] })), /not a field of a region/)
    assert.match(String(parseChanges(regions, { changes: [{ path: 'meta.secret', value: 'x' }] })), /not a field of a region/)
    assert.match(String(parseChanges(regions, { changes: [{ path: 'title' }] })), /no `value`/)
    assert.match(String(parseChanges(regions, { changes: [{ path: 'a b', value: 1 }] })), /needs a field `path`/)
  })

  it('reads Payload’s sanitized permissions per region path', () => {
    const access = regionAccessFrom(
      {
        update: true,
        fields: {
          title: true,
          subtitle: { read: true },
          links: { read: true, update: true, fields: { label: { read: true, update: true } } },
          meta: { read: true, update: true, fields: { note: { read: true } } },
        },
      },
      regions,
    )
    assert.deepEqual(access.title, { read: true, update: true })
    assert.deepEqual(access.subtitle, { read: true, update: false })
    assert.deepEqual(access.cover, { read: false, update: false })
    assert.deepEqual(access['links.label'], { read: true, update: true })
    assert.deepEqual(access['links.url'], { read: false, update: false })
    assert.deepEqual(access['meta.note'], { read: true, update: false })
    // Without update access to the document, nothing is writable.
    assert.equal(regionAccessFrom({ fields: true }, regions).title.update, false)
  })

  it('serves the values and the access, and saves changes over the endpoints', async () => {
    const { db, runtime } = setup()
    const endpoints = regionEndpoints({ collections: { pages: { field: 'layout', regions } }, runtime, access: allowAll, settingsLocks: createSettingsLocks() })
    const read = endpoints.find((e) => e.path.endsWith('/regions'))
    const write = endpoints.find((e) => e.path.endsWith('/fields'))
    assert.ok(read && write)
    const response = (await read.handler({ user: ana, payload: db.payload, routeParams: { collection: 'pages', id: '7' }, url: 'http://x/api?locale=de' } as never)) as Response
    const body = (await response.json()) as { ok: boolean; values: Doc; access: RegionAccess }
    assert.equal(body.ok, true)
    assert.equal(body.values.title, 'Welcome')
    assert.equal(db.reads.at(-1)?.locale, 'de')
    assert.equal(db.reads.at(-1)?.id, 7, 'the route id is parsed to the collection’s number id')
    const saved = (await write.handler({
      user: ana,
      payload: db.payload,
      routeParams: { collection: 'pages', id: '7' },
      data: { changes: [{ path: 'subtitle', value: 'Over REST' }] },
    } as never)) as Response
    assert.equal(saved.status, 200)
    assert.equal(db.doc.subtitle, 'Over REST')
    const unsigned = (await write.handler({ user: null, payload: db.payload, routeParams: { collection: 'pages', id: '7' } } as never)) as Response
    assert.equal(unsigned.status, 401)
  })

  it('answers 404 for collections without regions', async () => {
    const { db, runtime } = setup()
    const [read] = regionEndpoints({ collections: { pages: { field: 'layout' } }, runtime, access: allowAll })
    const response = (await read.handler({ user: ana, payload: db.payload, routeParams: { collection: 'pages', id: '7' }, url: 'http://x/api' } as never)) as Response
    assert.equal(response.status, 404)
  })
})

const subtitleWriteOnly = async (): Promise<RegionAccess> => ({ ...regionAccessFrom({ update: true, fields: true }, regions), subtitle: { read: false, update: true } })
const groupRegions: RegionConfig[] = resolveRegions('pages', fields, [{ name: 'header', fields: ['subtitle', 'meta'] }], { fields: new Set(['layout']) })

describe('region access and what answers may show', () => {
  it('reads row-scoped collection access ({ permission, where }) as Payload’s runtime check does', () => {
    const allowed = regionAccessFrom({ update: { permission: true, where: { owner: { equals: 1 } } }, fields: true }, regions)
    assert.deepEqual(allowed.title, { read: true, update: true })
    const denied = regionAccessFrom({ update: { permission: false }, fields: true }, regions)
    assert.equal(denied.title.update, false)
    // Unsanitized field rights in the same shape.
    const fieldRows = regionAccessFrom({ update: true, fields: { title: { read: { permission: true }, update: { permission: false } } } }, regions)
    assert.deepEqual(fieldRows.title, { read: true, update: false })
  })

  it('never returns a field the user may not read in a conflict, also when they may change it', async () => {
    const { db, write } = setup({ hidden: ['subtitle'] })
    const result = await write([{ path: 'subtitle', value: 'Guess', base: 'Wrong' }], { access: subtitleWriteOnly })
    assert.ok(!result.ok && result.status === 409)
    assert.deepEqual(!result.ok && result.conflicts, [{ path: 'subtitle', value: null }])
    assert.equal(JSON.stringify(result).includes('"Sub"'), false, 'the stored value never leaves the server')
    assert.equal(db.writes.length, 0)
  })

  it('leaves a hidden field of a group out of a conflict, and keeps it in a save', async () => {
    const { db, write } = setup({ hidden: ['meta.secret'] })
    const access = async (): Promise<RegionAccess> => ({
      ...regionAccessFrom({ update: true, fields: true }, groupRegions),
      'meta.secret': { read: false, update: false },
    })
    const conflict = await writeRegionFields(setup({ hidden: ['meta.secret'] }).req(), {
      target,
      regions: groupRegions,
      changes: [{ path: 'meta', value: { note: 'Mine' }, base: { note: 'Wrong' } }],
      runtime: { sessions: createSessionManager({ logger: { error() {} } }), canUpdate: async () => true },
      gate: createWriteGate(),
      access,
      settingsLocks: createSettingsLocks(),
    })
    assert.ok(!conflict.ok && conflict.status === 409)
    assert.deepEqual(!conflict.ok && conflict.conflicts, [{ path: 'meta', value: { note: 'Note' } }])
    assert.equal(JSON.stringify(conflict).includes('hidden'), false)
    // A whole-group save without the hidden field keeps its stored value.
    const saved = await write([{ path: 'meta', value: { note: 'Mine' }, base: { note: 'Note' } }], { regions: groupRegions, access })
    assert.ok(saved.ok)
    assert.deepEqual(db.writes[0].data, { meta: { note: 'Mine', secret: 'hidden' } })
    assert.equal(JSON.stringify(saved).includes('hidden'), false)
  })

  it('refuses a whole-group change that sets a field the user may not change', async () => {
    const { db, write } = setup({ hidden: ['meta.secret'] })
    const access = async (): Promise<RegionAccess> => ({
      ...regionAccessFrom({ update: true, fields: true }, groupRegions),
      'meta.secret': { read: false, update: false },
    })
    const result = await write([{ path: 'meta', value: { note: 'Note', secret: 'mine' }, base: { note: 'Note' } }], { regions: groupRegions, access })
    assert.ok(!result.ok && result.status === 403)
    assert.equal(db.writes.length, 0)
  })
})

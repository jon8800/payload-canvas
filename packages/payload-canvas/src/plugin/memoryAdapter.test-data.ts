// A small in-memory database adapter for tests that run the real Payload Local API: Payload's own
// operations, field hooks, validation, access, locales and versions, without a database server.
// It keeps documents as Payload hands them over (localized fields as `{ locale: value }`, like the
// MongoDB adapter), and Payload's read hooks pick the locale. Queries support what Payload's own
// operations send: and/or, equals, not_equals, in, not_in, exists, like, contains and comparisons.

import { createDatabaseAdapter, type BaseDatabaseAdapter, type DatabaseAdapterObj, type Where } from 'payload'

type Doc = Record<string, unknown>
type VersionRecord = Doc & { id: number; parent?: unknown; version: Doc; latest?: boolean }

const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value))

const get = (doc: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value === null || typeof value !== 'object' ? undefined : (value as Doc)[key]), doc)

const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a)) return a.some((item) => same(item, b))
  if (a === null || a === undefined || b === null || b === undefined) return a === b || (a == null && b == null)
  if (typeof a === 'object' && 'value' in (a as Doc)) return same((a as Doc).value, b)
  return String(a) === String(b)
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : String(value).split(','))

function matches(doc: unknown, where: Where | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'and') return (condition as Where[]).every((w) => matches(doc, w))
    if (key === 'or') return (condition as Where[]).length === 0 || (condition as Where[]).some((w) => matches(doc, w))
    const value = get(doc, key)
    return Object.entries(condition as Record<string, unknown>).every(([op, expected]) => {
      switch (op) {
        case 'equals':
          return same(value, expected)
        case 'not_equals':
          return !same(value, expected)
        case 'in':
          return list(expected).some((e) => same(value, e))
        case 'not_in':
          return !list(expected).some((e) => same(value, e))
        case 'exists':
          return (value !== undefined && value !== null) === (expected === true || expected === 'true')
        case 'like':
        case 'contains':
          return typeof value === 'string' && value.toLowerCase().includes(String(expected).toLowerCase())
        case 'greater_than':
          return String(value) > String(expected)
        case 'greater_than_equal':
          return String(value) >= String(expected)
        case 'less_than':
          return String(value) < String(expected)
        case 'less_than_equal':
          return String(value) <= String(expected)
        default:
          throw new Error(`memoryAdapter: no "${op}" queries`)
      }
    })
  })
}

/** Sorted by `sort` ("field" or "-field", or a list of them), then by insertion order. */
function sorted<T extends Doc>(docs: T[], sort: unknown): T[] {
  const keys = (Array.isArray(sort) ? sort : sort ? [sort] : []).map(String)
  const indexed = docs.map((doc, index) => ({ doc, index }))
  indexed.sort((a, b) => {
    for (const key of keys) {
      const desc = key.startsWith('-')
      const path = desc ? key.slice(1) : key
      const x = String(get(a.doc, path) ?? '')
      const y = String(get(b.doc, path) ?? '')
      if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1)
      return (a.index - b.index) * (desc ? -1 : 1)
    }
    return a.index - b.index
  })
  return indexed.map((entry) => entry.doc)
}

function paginate<T>(docs: T[], args: { limit?: number; page?: number; pagination?: boolean }) {
  const limit = args.pagination === false || !args.limit ? docs.length || 1 : args.limit
  const page = args.page ?? 1
  const totalPages = Math.max(1, Math.ceil(docs.length / limit))
  return {
    docs: docs.slice((page - 1) * limit, page * limit).map(clone),
    totalDocs: docs.length,
    limit,
    totalPages,
    page,
    pagingCounter: (page - 1) * limit + 1,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < totalPages ? page + 1 : null,
  }
}

const now = () => new Date().toISOString()

/** The adapter and its data. `writes` counts `updateOne` calls per collection. */
export function memoryAdapter() {
  const collections = new Map<string, Map<number, Doc>>()
  const versions = new Map<string, VersionRecord[]>()
  const globals = new Map<string, Doc>()
  const writes = new Map<string, number>()
  let nextId = 1
  let nextTransaction = 1
  /** Like the real adapters: a new document gets its timestamps unless Payload set them. */
  const withTimestamps = (doc: Doc): Doc => ({ ...doc, createdAt: doc.createdAt ?? now(), updatedAt: doc.updatedAt ?? now() })
  const docsOf = (slug: string) => {
    let docs = collections.get(slug)
    if (!docs) collections.set(slug, (docs = new Map()))
    return docs
  }
  const versionsOf = (slug: string) => {
    let records = versions.get(slug)
    if (!records) versions.set(slug, (records = []))
    return records
  }
  const pick = (slug: string, args: { id?: unknown; where?: Where }) =>
    [...docsOf(slug).values()].filter((doc) => (args.id !== undefined ? same(doc.id, args.id) : matches(doc, args.where)))
  const draftView = (record: VersionRecord): Doc => ({ ...record.version, ...record, id: record.parent })

  const obj: DatabaseAdapterObj = {
    name: 'memory',
    defaultIDType: 'number',
    init: ({ payload }) => {
      const methods: Partial<BaseDatabaseAdapter> = {
        name: 'memory',
        packageName: 'memory',
        defaultIDType: 'number',
        payload,
        migrationDir: 'migrations',
        init: async () => {},
        connect: async () => {},
        destroy: async () => {},
        beginTransaction: async () => `tx${nextTransaction++}`,
        commitTransaction: async () => {},
        rollbackTransaction: async () => {},
        async create({ collection, data }) {
          const id = typeof data.id === 'number' ? data.id : nextId++
          const doc = withTimestamps({ ...clone(data), id })
          docsOf(collection).set(id, doc)
          return clone(doc)
        },
        async findOne({ collection, where }) {
          return clone(pick(collection, { where })[0] ?? null) as never
        },
        async find({ collection, where, sort, limit, page, pagination }) {
          return paginate(sorted(pick(collection, { where }), sort), { limit, page, pagination }) as never
        },
        async findDistinct() {
          throw new Error('memoryAdapter: no findDistinct')
        },
        async count({ collection, where }) {
          return { totalDocs: pick(collection, { where }).length }
        },
        async updateOne({ collection, id, where, data }) {
          const doc = pick(collection, { id, where })[0]
          if (!doc) return null as never
          writes.set(collection, (writes.get(collection) ?? 0) + 1)
          const next = { ...doc, ...clone(data), id: doc.id }
          docsOf(collection).set(doc.id as number, next)
          return clone(next)
        },
        async updateMany({ collection, where, data }) {
          const docs = pick(collection, { where })
          for (const doc of docs) docsOf(collection).set(doc.id as number, { ...doc, ...clone(data), id: doc.id })
          return docs.map((doc) => clone(docsOf(collection).get(doc.id as number) as Doc))
        },
        async upsert({ collection, where, data }) {
          const doc = pick(collection, { where })[0]
          if (doc) {
            const next = { ...doc, ...clone(data), id: doc.id }
            docsOf(collection).set(doc.id as number, next)
            return clone(next)
          }
          const id = nextId++
          const created = withTimestamps({ ...clone(data), id })
          docsOf(collection).set(id, created)
          return clone(created)
        },
        async deleteOne({ collection, where }) {
          const doc = pick(collection, { where })[0]
          if (doc) docsOf(collection).delete(doc.id as number)
          return clone(doc ?? null) as never
        },
        async deleteMany({ collection, where }) {
          for (const doc of pick(collection, { where })) docsOf(collection).delete(doc.id as number)
        },
        async createVersion({ collectionSlug, parent, versionData, autosave, createdAt, updatedAt, publishedLocale, snapshot }) {
          const records = versionsOf(collectionSlug)
          for (const record of records) if (same(record.parent, parent)) record.latest = false
          const { id: _id, ...version } = clone(versionData) as Doc
          const record: VersionRecord = {
            id: nextId++,
            parent,
            version,
            autosave,
            latest: true,
            createdAt,
            updatedAt,
            publishedLocale,
            snapshot,
          }
          records.push(record)
          return clone(record) as never
        },
        async findVersions({ collection, where, sort, limit, page, pagination }) {
          return paginate(sorted(versionsOf(collection).filter((r) => matches(r, where)), sort), { limit, page, pagination }) as never
        },
        async countVersions({ collection, where }) {
          return { totalDocs: versionsOf(collection).filter((r) => matches(r, where)).length }
        },
        async updateVersion({ collection, id, where, versionData }) {
          const record = versionsOf(collection).find((r) => (id !== undefined ? same(r.id, id) : matches(r, where)))
          if (!record) return null as never
          Object.assign(record, clone(versionData))
          return clone(record) as never
        },
        async deleteVersions({ collection, where }) {
          const slug = String(collection)
          versions.set(
            slug,
            versionsOf(slug).filter((r) => !matches(r, where)),
          )
        },
        async queryDrafts({ collection, where, sort, limit, page, pagination }) {
          const views = versionsOf(collection)
            .filter((r) => r.latest)
            .map(draftView)
            .filter((view) => matches(view, where))
          const result = paginate(sorted(views, sort), { limit, page, pagination })
          return { ...result, docs: result.docs.map(({ version: _v, parent: _p, latest: _l, ...doc }) => doc) } as never
        },
        async createGlobal({ slug, data }) {
          const doc = { ...clone(data), globalType: slug }
          globals.set(slug, doc)
          return clone(doc) as never
        },
        async findGlobal({ slug }) {
          return clone(globals.get(slug) ?? {}) as never
        },
        async updateGlobal({ slug, data }) {
          const doc = { ...globals.get(slug), ...clone(data), globalType: slug }
          globals.set(slug, doc)
          return clone(doc) as never
        },
        async createGlobalVersion({ globalSlug, versionData, autosave, createdAt, updatedAt }) {
          const records = versionsOf(`global:${globalSlug}`)
          for (const record of records) record.latest = false
          const record: VersionRecord = { id: nextId++, version: clone(versionData) as Doc, autosave, latest: true, createdAt, updatedAt }
          records.push(record)
          return clone(record) as never
        },
        async findGlobalVersions({ global, where, sort, limit, page, pagination }) {
          return paginate(sorted(versionsOf(`global:${global}`).filter((r) => matches(r, where)), sort), { limit, page, pagination }) as never
        },
        async countGlobalVersions({ global, where }) {
          return { totalDocs: versionsOf(`global:${global}`).filter((r) => matches(r, where)).length }
        },
        async updateGlobalVersion({ global, id, versionData }) {
          const record = versionsOf(`global:${global}`).find((r) => same(r.id, id))
          if (!record) return null as never
          Object.assign(record, clone(versionData))
          return clone(record) as never
        },
      }
      return createDatabaseAdapter(methods as never)
    },
  }
  return {
    adapter: obj,
    /** The stored document, as the adapter holds it (every locale). */
    stored: (collection: string, id: unknown) => clone(docsOf(collection).get(Number(id)) ?? null),
    versions: (collection: string) => clone(versionsOf(collection)),
    writes: (collection: string) => writes.get(collection) ?? 0,
  }
}

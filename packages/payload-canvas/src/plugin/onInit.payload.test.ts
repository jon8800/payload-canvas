// The app's own onInit saves builder documents: the write gate must already learn every commit,
// or the gate stays held and later saves of that document wait and fail.

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { buildConfig, getPayload, type CollectionConfig } from 'payload'

import { defaultWriteGate } from '../live/writeGate'
import { memoryAdapter } from './memoryAdapter.test-data'
import { websiteBuilder } from './index'

const users: CollectionConfig = { slug: 'users', auth: true, fields: [] }
const pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  access: { read: () => true, create: () => true, update: () => true, delete: () => true },
  fields: [{ name: 'title', type: 'text' }],
}

it("lets the app's onInit save a builder document, and the gate is free afterwards", { timeout: 10_000 }, async () => {
  let created: number | null = null
  const config = await buildConfig({
    secret: 'test-secret-not-used-anywhere',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: memoryAdapter().adapter,
    collections: [users, pages],
    onInit: async (payload) => {
      const doc = await payload.create({ collection: 'pages', draft: true, overrideAccess: true, data: { title: 'Seed' } as never })
      created = doc.id as number
      await payload.update({ collection: 'pages', id: created, draft: true, overrideAccess: true, data: { title: 'Seeded' } as never })
    },
    plugins: [websiteBuilder({ collections: { pages: {} }, blocks: [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }], css: { entry: 'globals.css' }, theme: false })],
  })
  const payload = await getPayload({ config })
  assert.ok(created !== null)
  assert.equal(defaultWriteGate().size(), 0, 'no save still holds the gate')
  // A later save of the same document goes through at once.
  const saved = await payload.update({ collection: 'pages', id: created, draft: true, overrideAccess: true, data: { title: 'Later' } as never })
  assert.equal(saved.title, 'Later')
})

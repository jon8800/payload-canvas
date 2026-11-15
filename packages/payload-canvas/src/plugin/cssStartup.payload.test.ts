// At startup, the plugin checks the CSS entry: an @plugin line missing from `css.plugins` is in the
// server log with what to pass, before anyone opens the builder.

import assert from 'node:assert/strict'
import path from 'node:path'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildConfig, getPayload, type CollectionConfig } from 'payload'

import { memoryAdapter } from './memoryAdapter.test-data'
import { websiteBuilder } from './index'

const here = path.dirname(fileURLToPath(import.meta.url))
// The starter's entry has `@plugin "@tailwindcss/typography"`.
const entry = path.resolve(here, '../../../../apps/starter/src/app/(frontend)/globals.css')

const users: CollectionConfig = { slug: 'users', auth: true, fields: [] }
const pages: CollectionConfig = { slug: 'pages', fields: [{ name: 'title', type: 'text' }] }

it('logs a @plugin of the CSS entry that css.plugins does not have, at startup', { timeout: 10_000 }, async () => {
  const config = await buildConfig({
    secret: 'test-secret-not-used-anywhere',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: memoryAdapter().adapter,
    collections: [users, pages],
    plugins: [websiteBuilder({ collections: { pages: {} }, blocks: [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }], css: { entry }, theme: false })],
  })
  const payload = await getPayload({ config })
  // The check does not hold up startup: it logs once its compile is done.
  const logged: string[] = []
  const error = payload.logger.error.bind(payload.logger)
  payload.logger.error = ((message: unknown, ...rest: unknown[]) => {
    if (typeof message === 'string') logged.push(message)
    return (error as (...args: unknown[]) => void)(message, ...rest)
  }) as typeof payload.logger.error
  for (let i = 0; i < 100 && !logged.some((m) => m.includes('@plugin')); i++) await new Promise((resolve) => setTimeout(resolve, 50))
  const message = logged.find((m) => m.includes('@plugin'))
  assert.ok(message, `logged: ${JSON.stringify(logged)}`)
  assert.match(message, /^\[websiteBuilder\] The CSS entry uses @plugin "@tailwindcss\/typography", but `css\.plugins` of websiteBuilder\(\) does not have it/)
})

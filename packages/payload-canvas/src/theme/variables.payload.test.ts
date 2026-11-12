// Design variables end to end through the real Payload Local API (memory database): the Theme
// global's validation, the site's page CSS and the classes stylesheet (`bg-brand` compiles after a
// save of the theme), the Styles panel's tokens, where a variable is used, and the MCP tool.

import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildConfig, createPayloadRequest, getPayload, type CollectionConfig, type Payload, type PayloadRequest } from 'payload'

import { loadClassesSheet, upsertClass } from '../classes'
import type { BlockDefinition, Layout } from '../core/types'
import { builderMcpTools } from '../mcp'
import { memoryAdapter } from '../plugin/memoryAdapter.test-data'
import { siteCssConfigOf, websiteBuilder } from '../plugin'
import { compilePageCss } from '../react/server'
import { themeStyleTokens } from './server'
import { variableUsage } from './usage'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '../../node_modules/.cache/payload-canvas-variables-test')

const all = { read: () => true, create: () => true, update: () => true, delete: () => true }
const pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  access: all,
  admin: { useAsTitle: 'title' },
  fields: [{ name: 'title', type: 'text' }],
  authorship: false,
}
const heading: BlockDefinition = { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }
const admin = { id: 1, collection: 'users', email: 'admin@example.test' }
const THEME = 'theme-settings'

let payload: Payload
const asAdmin = async () => (await createPayloadRequest({ user: admin as never, payload })) as PayloadRequest
const layoutOf = (classes: string[]): Layout => ({ version: 1, blocks: classes.map((className, i) => ({ id: `b${i}`, type: 'heading', props: { text: `T${i}` }, className })) })
/** Rejects with the field messages of Payload's ValidationError. */
const refused = async (variables: unknown[], message: RegExp) =>
  assert.rejects(saveTheme(variables), (error: Error & { data?: { errors?: Array<{ message: string }> } }) => {
    assert.match((error.data?.errors ?? []).map((e) => e.message).join(' '), message)
    return true
  })
const saveTheme = (variables: unknown[]) => payload.updateGlobal({ slug: THEME as never, data: { variables } as never, overrideAccess: true, context: { disableRevalidate: true } })

before(async () => {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'entry.css'), '@import "tailwindcss";\n@theme { --font-display: serif; }\n')
  const config = await buildConfig({
    secret: 'test-secret-not-used-anywhere',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: memoryAdapter().adapter,
    collections: [{ slug: 'users', auth: true, fields: [],
      authorship: false,
    }, pages],
    plugins: [websiteBuilder({ collections: { pages: {} }, blocks: [heading], css: { entry: path.join(dir, 'entry.css') } })],
  })
  payload = await getPayload({ config })
})

describe('design variables (Payload)', { concurrency: false, timeout: 60_000 }, () => {
  const layout = layoutOf(['bg-brand text-brand/80 p-gutter', 'font-display'])

  it('the Theme global refuses a bad name, a taken name, a duplicate and a bad value', async () => {
    await refused([{ name: 'Brand', type: 'color', value: '#000' }], /lower-case/)
    await refused([{ name: 'primary', type: 'color', value: '#000' }], /taken/)
    await refused(
      [
        { name: 'brand', type: 'color', value: '#000' },
        { name: 'brand', type: 'size', value: '1rem' },
      ],
      /Another variable has this name/,
    )
    await refused([{ name: 'gutter', type: 'size', value: 'wide' }], /Enter a size/)
  })

  it('without the variables, their classes compile to nothing', async () => {
    const css = (await compilePageCss(payload, [{ layout }])) ?? ''
    assert.doesNotMatch(css, /bg-brand/)
  })

  it('after a theme save the page CSS has the classes, reading the variables (no values in the CSS)', async () => {
    await saveTheme([
      { name: 'brand', type: 'color', value: '#1f4536', darkValue: '#8fd1b4' },
      { name: 'gutter', type: 'size', value: '1.5rem' },
      { name: 'display', type: 'font', value: 'Fraunces' },
    ])
    const css = (await compilePageCss(payload, [{ layout }])) ?? ''
    assert.match(css, /\.bg-brand:where\(\.builder-css\) \{\s*background-color: var\(--color-brand\);/)
    assert.match(css, /color-mix\(in oklab, var\(--color-brand\) 80%, transparent\)/)
    assert.match(css, /\.p-gutter:where\(\.builder-css\) \{\s*padding: var\(--spacing-gutter\);/)
    assert.match(css, /\.font-display:where\(\.builder-css\) \{\s*font-family: var\(--font-display\);/)
    assert.doesNotMatch(css, /#1f4536/)
  })

  it('the save hook stores the CSS of a page that uses them', async () => {
    const doc = (await payload.create({ collection: 'pages', data: { title: 'Home', layout } as never, overrideAccess: true })) as unknown as Record<string, { css?: string }>
    const field = Object.keys(doc).find((key) => typeof doc[key]?.css === 'string')!
    assert.match(doc[field]!.css!, /var\(--color-brand\)/)
  })

  it('variables work inside editable classes', async () => {
    const req = await asAdmin()
    const created = await upsertClass(req, { name: 'tile', styles: 'bg-brand p-gutter', css: 'border-color: var(--color-brand);', publish: true })
    assert.ok(created.ok, !created.ok ? created.error : '')
    const sheet = (await loadClassesSheet(payload))!
    assert.match(sheet.css, /\.tile \{[^}]*background-color: var\(--color-brand\)/)
    assert.match(sheet.css, /padding: var\(--spacing-gutter\)/)
  })

  it('the Styles panel tokens list the variables and know their names', async () => {
    const tokens = await themeStyleTokens(payload, siteCssConfigOf(payload)!.css)
    assert.deepEqual(
      tokens.variables?.map((v) => [v.name, v.type, v.value]),
      [
        ['brand', 'color', '#1f4536'],
        ['gutter', 'size', '1.5rem'],
        ['display', 'font', 'Fraunces'],
      ],
    )
    assert.ok(tokens.colors.some((c) => c.name === 'brand'))
    assert.ok(tokens.spacing.includes('gutter'))
    assert.ok(tokens.fonts.some((f) => f.name === 'display'))
  })

  it('finds where each variable is used: blocks per page and classes', async () => {
    const usage = await variableUsage(await asAdmin(), [
      { name: 'brand', type: 'color' },
      { name: 'gutter', type: 'size' },
      { name: 'unused', type: 'color' },
    ])
    assert.equal(usage.brand?.blocks, 1)
    assert.deepEqual(usage.brand?.documents.map((d) => d.title), ['Home'])
    assert.deepEqual(usage.brand?.classes, ['tile'])
    assert.deepEqual(usage.gutter?.classes, ['tile'])
    assert.deepEqual(usage.unused, { blocks: 0, documents: [], classes: [] })
  })

  it('the MCP listBlocks tool lists the variables with example classes', async () => {
    const tools = builderMcpTools({ collections: { pages: { field: 'layout' } }, blocks: [heading] })
    const listBlocks = tools.find((t) => t.name === 'listBlocks')!
    const result = (await listBlocks.handler({ collection: 'pages' } as never, await asAdmin(), {})) as { content: Array<{ text: string }> }
    const body = JSON.parse(result.content[0]!.text) as { variables?: Array<{ name: string; classes: string }>; variablesNote?: string }
    assert.deepEqual(body.variables?.map((v) => [v.name, v.classes]), [
      ['brand', 'bg-brand text-brand border-brand'],
      ['gutter', 'p-gutter m-gutter gap-gutter w-gutter'],
      ['display', 'font-display'],
    ])
    assert.match(body.variablesNote ?? '', /var\(<property>\)/)
  })
})

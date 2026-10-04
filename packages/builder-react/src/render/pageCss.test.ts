// One stylesheet per page (QA M9): a footer's base class must not beat a page's `md:` class.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'
import { SITE_CSS_KEY } from '@payload-toolkit/builder'
import { defaultBlocks } from '@payload-toolkit/builder/blocks'
import type { Layout } from '@payload-toolkit/builder/core'
import { compilePageCss } from '../server'

const here = path.dirname(fileURLToPath(import.meta.url))
const starter = path.resolve(here, '../../../../apps/starter')
const entry = path.join(starter, 'src/app/(frontend)/globals.css')
// The starter's entry uses the typography plugin, so the compile needs it in the plugins map.
const plugins = { '@tailwindcss/typography': createRequire(path.join(starter, 'package.json'))('@tailwindcss/typography') as unknown }
const blocks = defaultBlocks()

const fake = (custom: Record<string, unknown>) => ({ config: { custom }, logger: { error() {} } }) as unknown as Payload
const layoutWith = (className: string): Layout => ({ version: 1, blocks: [{ id: className, type: 'text', props: { text: 'x' }, className }] })

describe('compilePageCss', () => {
  it('compiles the classes of every layout once, variants after base classes', async () => {
    const payload = fake({ [SITE_CSS_KEY]: { css: { entry, plugins }, blocks } })
    const page = { layout: layoutWith('md:text-xl'), css: '.page{}' }
    const footer = { layout: layoutWith('text-lg'), css: '.footer{}' }
    const css = await compilePageCss(payload, [null, page, footer])
    assert.ok(css)
    const base = css.indexOf('.text-lg')
    const variant = css.indexOf('.md\\:text-xl')
    assert.ok(base !== -1 && variant !== -1, 'both classes compiled')
    assert.ok(variant > base, '`md:text-xl` comes after `text-lg`, so it wins at md and up')
    assert.equal((css.match(/\.text-lg\s*\{/g) ?? []).length, 1, 'no duplicate rules')
  })
  it('falls back to the stored CSS without the plugin config', async () => {
    const css = await compilePageCss(fake({}), [{ layout: layoutWith('p-4'), css: '.a{}' }, { layout: layoutWith('p-2'), css: '.b{}' }])
    assert.equal(css, '.a{}\n.b{}')
  })
  it('returns null when no layout has classes', async () => {
    assert.equal(await compilePageCss(fake({ [SITE_CSS_KEY]: { css: { entry, plugins }, blocks } }), [null, undefined]), null)
  })
})

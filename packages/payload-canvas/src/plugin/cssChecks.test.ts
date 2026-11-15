// `css` of websiteBuilder(): a missing entry fails at startup with a message that says what to pass,
// @plugin lines missing from `css.plugins` are found at startup, and the CSS endpoints answer with
// that message instead of a bare 500.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { CollectionConfig, Config, Endpoint } from 'payload'

import { clearCssCache, cssEntryProblems } from '../css'
import { resolveCssOptions, websiteBuilder } from './index'

const here = path.dirname(fileURLToPath(import.meta.url))
const starter = path.resolve(here, '../../../../apps/starter')
// The starter's entry has `@plugin "@tailwindcss/typography"`.
const entry = path.join(starter, 'src/app/(frontend)/globals.css')
const typography: unknown = createRequire(path.join(starter, 'package.json'))('@tailwindcss/typography')

const pages: CollectionConfig = { slug: 'pages', fields: [{ name: 'title', type: 'text' }] }
const base = { collections: [pages] } as unknown as Config

describe('css.entry is required, with a clear message', () => {
  for (const css of [undefined, {}, { entry: '' }, { entry: '  ' }]) {
    it(`refuses ${JSON.stringify(css)} with what to pass`, () => {
      assert.throws(() => resolveCssOptions(css as never), (error: Error) => {
        assert.match(error.message, /`css\.entry` is missing/)
        assert.match(error.message, /css: \{ entry: /)
        assert.match(error.message, /Payload blocks field/)
        return true
      })
    })
  }

  it('fails at startup, not with a TypeError, when websiteBuilder() gets no css', () => {
    assert.throws(() => websiteBuilder({ collections: { pages: {} } } as never)(base), /\[websiteBuilder\] `css\.entry` is missing/)
  })

  it('refuses plugins that are not an object', () => {
    assert.throws(() => resolveCssOptions({ entry: 'globals.css', plugins: ['x'] as never }), /`css\.plugins` must be an object/)
  })

  it('resolves the entry against the folder the app starts in', () => {
    assert.deepEqual(resolveCssOptions({ entry: 'src/globals.css' }, '/app'), { entry: path.resolve('/app', 'src/globals.css'), plugins: undefined })
  })
})

describe('cssEntryProblems (the startup check)', () => {
  let dir = ''
  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('names the @plugin missing from css.plugins, and what to pass', async () => {
    const problems = await cssEntryProblems({ entry })
    assert.equal(problems.length, 1)
    assert.match(problems[0], /@plugin "@tailwindcss\/typography"/)
    assert.match(problems[0], /`css\.plugins` of websiteBuilder\(\)/)
    assert.match(problems[0], /plugins: \{ '@tailwindcss\/typography': plugin \}/)
  })

  it('finds nothing when every plugin is passed', async () => {
    assert.deepEqual(await cssEntryProblems({ entry, plugins: { '@tailwindcss/typography': typography } }), [])
  })

  it('lists every missing plugin at once', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'canvas-css-'))
    const file = path.join(dir, 'globals.css')
    await writeFile(file, '@plugin "first-plugin";\n@plugin "second-plugin";\n@plugin "kept";\n')
    const problems = await cssEntryProblems({ entry: file, plugins: { kept: () => {} } })
    assert.equal(problems.length, 1)
    assert.match(problems[0], /"first-plugin", "second-plugin"/)
    assert.doesNotMatch(problems[0], /"kept"/)
  })

  it('says when the entry file cannot be read', async () => {
    const problems = await cssEntryProblems({ entry: path.join(here, 'no-such-file.css') })
    assert.equal(problems.length, 1)
    assert.match(problems[0], /cannot be read\. Set `css\.entry`/)
  })
})

describe('the CSS endpoints answer with the problem, not a bare 500', () => {
  const config = websiteBuilder({ collections: { pages: {} }, css: { entry }, theme: false })(base) as Config
  const endpoint = (suffix: string) => (config.endpoints as Endpoint[]).find((e) => e.path === suffix)!
  const logged: string[] = []
  const req = { user: { id: 1 }, payload: { config: { custom: {} }, logger: { error: (message: string) => logged.push(message) } } }

  for (const suffix of ['/builder/canvas-css', '/builder/style-tokens']) {
    it(`${suffix} names the missing plugin`, async () => {
      clearCssCache()
      logged.length = 0
      const res = (await endpoint(suffix).handler(req as never)) as Response
      assert.equal(res.status, 500)
      const body = (await res.json()) as { error: string }
      assert.match(body.error, /\[websiteBuilder\] .* could not be built: Tailwind plugin "@tailwindcss\/typography"/)
      assert.match(body.error, /css\.plugins/)
      assert.deepEqual(logged, [body.error], 'the server log has the same message')
    })
  }
})

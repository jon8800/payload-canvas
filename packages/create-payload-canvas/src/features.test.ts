import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { applyFeatures, stripImportMap, stripRegions } from './features.js'

const lines = (...items: string[]) => items.join('\n')

describe('stripRegions', () => {
  const text = lines('a', '// @feature:ai', 'b', '// @end:ai', 'c')

  it('keeps the region and drops the markers when the feature is on', () => {
    assert.equal(stripRegions(text, ['ai']), lines('a', 'b', 'c'))
  })

  it('drops the region when the feature is off', () => {
    assert.equal(stripRegions(text, []), lines('a', 'c'))
  })

  it('handles several regions in one file', () => {
    const many = lines('// @feature:nav', 'n', '// @end:nav', 'x', '// @feature:ai', 'a1', '// @end:ai', '// @feature:nav', 'n2', '// @end:nav')
    assert.equal(stripRegions(many, ['nav']), lines('n', 'x', 'n2'))
    assert.equal(stripRegions(many, ['ai']), lines('x', 'a1'))
  })

  it('handles # comments and indented markers', () => {
    const env = lines('KEY=1', '# @feature:ai', 'OPENROUTER_API_KEY=', '# @end:ai', '  // @feature:nav', '  nav: 1,', '  // @end:nav', '')
    assert.equal(stripRegions(env, []), lines('KEY=1', ''))
    assert.equal(stripRegions(env, ['ai', 'nav']), lines('KEY=1', 'OPENROUTER_API_KEY=', '  nav: 1,', ''))
  })

  it('keeps Windows line endings', () => {
    assert.equal(stripRegions('a\r\n# @feature:ai\r\nb\r\n# @end:ai\r\nc\r\n', []), 'a\r\nc\r\n')
  })

  it('throws on an unclosed region', () => {
    assert.throws(() => stripRegions(lines('a', '// @feature:ai', 'b'), ['ai'], 'x.ts'), /x\.ts:2: "@feature:ai" is never closed/)
  })

  it('throws on a wrong or stray end marker', () => {
    assert.throws(() => stripRegions(lines('// @feature:ai', '// @end:nav'), []), /closes "@feature:ai"/)
    assert.throws(() => stripRegions(lines('a', '// @end:ai'), []), /no matching/)
  })
})

describe('stripImportMap', () => {
  const map = lines(
    "import { Nav as Nav_1 } from '../../../admin/nav/Nav'",
    "import { Navbar as Navbar_2 } from '../../../admin/navbar/Navbar'",
    "import { Cards as Cards_3 } from '@payloadcms/next/rsc'",
    '',
    'export const importMap = {',
    '  "/admin/nav/Nav#Nav": Nav_1,',
    '  "/admin/navbar/Navbar#Navbar": Navbar_2,',
    '  "@payloadcms/next/rsc#CollectionCards": Cards_3',
    '}',
  )

  it('removes the import lines and map entries of a deleted folder', () => {
    const result = stripImportMap(map, ['src/admin/nav'])
    assert.ok(!result.includes('Nav_1'))
    assert.ok(result.includes('Navbar_2'), 'a folder with a longer name stays')
    assert.ok(result.includes('Cards_3'))
  })

  it('removes the lines of a deleted file', () => {
    const result = stripImportMap(map, ['src/admin/navbar/Navbar.tsx'])
    assert.ok(!result.includes('Navbar_2'))
    assert.ok(result.includes('Nav_1'))
  })

  it('ignores paths outside src', () => {
    assert.equal(stripImportMap(map, ['scripts/seed-demo.ts']), map)
  })

  it('removes the lines of a removed package, and no package with a longer name', () => {
    const withPackages = lines(
      "import { Grid as Grid_4 } from 'payload-media-gallery/rsc'",
      "import { Other as Other_5 } from 'payload-media-gallery-pro/rsc'",
      '  "payload-media-gallery/rsc#Grid": Grid_4,',
      '  "payload-media-gallery-pro/rsc#Other": Other_5,',
    )
    const result = stripImportMap(withPackages, [], ['payload-media-gallery'])
    assert.ok(!result.includes('Grid_4'))
    assert.equal(result.split('Other_5').length, 3, 'both lines of the longer name stay')
  })
})

describe('applyFeatures', () => {
  let dir = ''
  const made: string[] = []
  afterEach(() => {
    for (const each of made.splice(0)) fs.rmSync(each, { recursive: true, force: true })
  })

  function project(files: Record<string, string>): string {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpc-features-'))
    made.push(dir)
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), content)
    }
    return dir
  }
  const read = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8')

  const manifest = {
    features: [
      { id: 'nav', paths: ['src/admin/nav'] },
      { id: 'demo', paths: ['scripts/seed-demo.ts'], scripts: ['seed:demo'] },
      { id: 'custom', paths: ['src/custom'] },
      { id: 'gallery', paths: [], dependencies: ['payload-media-gallery'] },
    ],
  }
  const files = {
    'starter-features.json': JSON.stringify(manifest),
    'package.json': JSON.stringify({ scripts: { dev: 'next dev', 'seed:demo': 'x' }, dependencies: { next: '16', 'payload-media-gallery': '^0.3.0' } }),
    'src/admin/nav/Nav.tsx': 'export {}',
    'src/custom/a.ts': 'export {}',
    'scripts/seed-demo.ts': 'export {}',
    'src/payload.config.ts': lines('a', '// @feature:nav', 'nav', '// @end:nav', '// @feature:custom', 'custom', '// @end:custom'),
    'src/app/(payload)/admin/importMap.js': lines(
      "import { Nav as N } from '../../../admin/nav/Nav'",
      "import { Grid as G } from 'payload-media-gallery/rsc'",
      '"/admin/nav/Nav#Nav": N,',
      '"payload-media-gallery/rsc#Grid": G,',
      'keep',
    ),
  }

  it('removes the files, scripts, regions and importMap lines of features that are off', () => {
    project(files)
    assert.deepEqual(applyFeatures(dir, ['nav', 'gallery']), ['demo'])
    assert.ok(fs.existsSync(path.join(dir, 'src/admin/nav/Nav.tsx')))
    assert.ok(!fs.existsSync(path.join(dir, 'scripts/seed-demo.ts')))
    assert.deepEqual(JSON.parse(read('package.json')).scripts, { dev: 'next dev' })
    // `custom` is not a CLI feature, so it is always kept.
    assert.ok(fs.existsSync(path.join(dir, 'src/custom/a.ts')))
    assert.equal(read('src/payload.config.ts'), lines('a', 'nav', 'custom'))
    assert.ok(!fs.existsSync(path.join(dir, 'starter-features.json')))

    assert.deepEqual(JSON.parse(read('package.json')).dependencies, { next: '16', 'payload-media-gallery': '^0.3.0' })

    project(files)
    applyFeatures(dir, [])
    assert.ok(!fs.existsSync(path.join(dir, 'src/admin/nav')))
    assert.deepEqual(JSON.parse(read('package.json')).dependencies, { next: '16' })
    assert.equal(read('src/payload.config.ts'), lines('a', 'custom'))
    assert.equal(read('src/app/(payload)/admin/importMap.js'), 'keep')
  })

  it('changes nothing in a project without starter-features.json', () => {
    const { 'starter-features.json': _, ...rest } = files
    project(rest)
    assert.equal(applyFeatures(dir, []), null)
    assert.ok(fs.existsSync(path.join(dir, 'src/admin/nav/Nav.tsx')))
    assert.ok(read('src/payload.config.ts').includes('@feature:nav'))
  })

  it('stops on a marker id that the manifest does not list', () => {
    project({ ...files, 'src/x.ts': lines('// @feature:typo', '// @end:typo') })
    assert.throws(() => applyFeatures(dir, []), /marks "typo"/)
  })
})

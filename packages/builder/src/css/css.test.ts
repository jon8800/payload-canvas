import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createCanvasCompiler } from './browser'
import { clearCssCache, compileClasses, getCanvasCssInput, tracingIncludes } from './index'
import { countUtilityLayers, extractUtilities, splitTopLevel } from './shared'

const here = path.dirname(fileURLToPath(import.meta.url))
const starter = path.resolve(here, '../../../../apps/starter')
const entry = path.join(starter, 'src/app/(frontend)/globals.css')
const typography: unknown = createRequire(path.join(starter, 'package.json'))('@tailwindcss/typography')
const plugins = { '@tailwindcss/typography': typography }
const options = { entry, plugins }

const MAIN = ['bg-primary', 'p-8', 'md:p-12', 'hover:bg-secondary', 'p-[37px]', 'prose']

/** Class selectors of every rule in the output, e.g. ".p-8", ".md\:p-12". */
function hasClass(css: string, cls: string): boolean {
  const escaped = cls.replace(/[^\w-]/g, (ch) => `\\${ch}`)
  return css.includes(`.${escaped}`)
}

describe('compileClasses', () => {
  test('compiles theme, variant, arbitrary and plugin classes with no Preflight', async () => {
    const css = await compileClasses(MAIN, options)
    for (const cls of MAIN) assert.ok(hasClass(css, cls), `missing ${cls}`)
    assert.match(css, /var\(--primary\)|var\(--color-primary\)/)
    assert.match(css, /padding: 37px/)
    assert.match(css, /--tw-prose-body/)
    assert.doesNotMatch(css, /@layer base\s*\{/)
    assert.doesNotMatch(css, /box-sizing: border-box/)
    const statements = splitTopLevel(css)
    assert.ok(!statements.some((s) => /^:root|^html|^\*/.test(s)), 'unlayered :root or reset rule in output')
    assert.ok(statements.some((s) => s.startsWith('@layer theme')), 'theme vars must stay in @layer theme')
  })

  test('empty class list returns an empty string', async () => {
    assert.equal(await compileClasses([], options), '')
    assert.equal(await compileClasses(['', '  '], options), '')
  })

  test('does not leak classes between calls', async () => {
    const a = await compileClasses(['mt-7', 'text-[13px]', 'bg-secondary'], options)
    assert.ok(hasClass(a, 'mt-7'))
    const b = await compileClasses(['mb-3', 'text-[14px]'], options)
    assert.ok(hasClass(b, 'mb-3'))
    for (const cls of ['mt-7', 'text-[13px]', 'bg-secondary']) assert.ok(!hasClass(b, cls), `leaked ${cls}`)
  })

  test('ignores unknown classes', async () => {
    const css = await compileClasses(['p-4', 'not-a-tailwind-class', 'foo:bar'], options)
    assert.ok(hasClass(css, 'p-4'))
    assert.ok(!css.includes('not-a-tailwind-class'))
    assert.equal(await compileClasses(['totally-unknown'], options), '')
  })

  test('a missing plugin throws an error that names the id', async () => {
    await assert.rejects(compileClasses(['p-4'], { entry }), /@tailwindcss\/typography/)
    clearCssCache()
    await assert.rejects(getCanvasCssInput({ entry }), /@tailwindcss\/typography/)
  })
})

describe('createCanvasCompiler', () => {
  test('input is JSON-safe and has no absolute server paths', async () => {
    const input = await getCanvasCssInput(options)
    const json = JSON.stringify(input)
    assert.deepEqual(JSON.parse(json), input)
    assert.ok(!json.includes(starter.replaceAll('\\', '\\\\')), 'absolute path leaked into the input')
    assert.ok(!json.includes(starter.replaceAll('\\', '/')), 'absolute path leaked into the input')
    console.log(`CanvasCssInput: ${(json.length / 1024).toFixed(1)} KB JSON, ${Object.keys(input.stylesheets as object).length} stylesheets`)
  })

  test('browser compiler matches the server compile and outputs a full page', async () => {
    const input = JSON.parse(JSON.stringify(await getCanvasCssInput(options)))
    const staticLayers = countUtilityLayers((await createCanvasCompiler(input, plugins)).build([]))
    const canvas = await createCanvasCompiler(input, plugins)
    const full = canvas.build(MAIN)
    assert.match(full, /@layer base\s*\{/)
    assert.match(full, /box-sizing: border-box/)
    assert.equal(extractUtilities(full, staticLayers), await compileClasses(MAIN, options))
  })

  test('browser compiler rejects a missing plugin', async () => {
    const input = await getCanvasCssInput(options)
    await assert.rejects(createCanvasCompiler(input, {}), /@tailwindcss\/typography/)
  })

  test('browser modules import no Node built-ins', async () => {
    for (const file of ['browser.ts', 'shared.ts']) {
      const source = await readFile(path.join(here, file), 'utf8')
      assert.doesNotMatch(source, /from ['"](node:|fs|path|module|crypto)/, file)
    }
  })
})

describe('tracingIncludes', () => {
  test('escapes route groups and lists the CSS packages', () => {
    const globs = tracingIncludes('src/app/(frontend)/globals.css')
    assert.equal(globs[0], './src/app/\\(frontend\\)/globals.css')
    assert.ok(globs.includes('./node_modules/tailwindcss/*.css'))
    assert.equal(tracingIncludes('.\\src\\[x]\\a.css')[0], './src/\\[x\\]/a.css')
  })
})

const ms = (t0: number) => (performance.now() - t0).toFixed(1)

describe('timing', () => {
  const COLORS = ['red', 'blue', 'green', 'zinc', 'amber', 'violet']
  const SHADES = [100, 200, 300, 400, 500, 600, 700, 800, 900]
  const PREFIXES = ['', 'md:', 'lg:', 'hover:', 'dark:']

  /** `size` unique, valid classes. A different seed gives a different set (no cache hit). */
  function classSet(size: number, seed: number): string[] {
    const out = new Set<string>()
    for (let i = 0; out.size < size; i++) {
      const k = i + seed * 1000
      const color = `${COLORS[k % COLORS.length]}-${SHADES[k % SHADES.length]}`
      const pick = [
        `p-${k % 97}`, `mt-${k % 89}`, `gap-${k % 83}`, `bg-${color}`, `text-${color}`, `w-[${k}px]`,
        `bg-primary/${k % 100}`, `grid-cols-${(k % 12) + 1}`, `border-${color}`, `translate-x-${k % 79}`,
      ][i % 10]
      out.add(`${PREFIXES[Math.floor(i / 10) % PREFIXES.length]}${pick}`)
    }
    return [...out]
  }


  for (const size of [50, 300]) {
    test(`${size} classes`, async () => {
      clearCssCache()
      let t0 = performance.now()
      await compileClasses(classSet(size, 1), options)
      const cold = ms(t0)
      t0 = performance.now()
      await compileClasses(classSet(size, 2), options)
      const warm = ms(t0)
      t0 = performance.now()
      await compileClasses(classSet(size, 2), options)
      const hit = ms(t0)

      const canvas = await createCanvasCompiler(await getCanvasCssInput(options), plugins)
      t0 = performance.now()
      canvas.build(classSet(size, 3))
      const browser = ms(t0)
      t0 = performance.now()
      canvas.build([...classSet(size, 3), 'mt-[999px]'])
      const browserOne = ms(t0)
      console.log(
        `${size} classes: server cold ${cold} ms, warm ${warm} ms, cache hit ${hit} ms; ` +
          `canvas build ${browser} ms, +1 class ${browserOne} ms`,
      )
    })
  }
})

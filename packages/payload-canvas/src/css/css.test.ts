import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createCanvasCompiler } from './browser'
import { clearCssCache, compileClasses, getCanvasCssInput, getStyleTokens, tracingIncludes } from './index'
import { type CanvasCssData, countUtilityLayers, extractUtilities, splitTopLevel } from './shared'
import { parseThemeEntries, tokensFromTheme } from './tokens'

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

const names = (list: { name: string }[]) => list.map((t) => t.name)

describe('getStyleTokens', () => {

  test('reads theme colors first, then the palette', async () => {
    const { colors } = await getStyleTokens(options)
    const list = names(colors)
    for (const name of ['primary', 'primary-foreground', 'muted', 'muted-foreground', 'background', 'border', 'ring']) {
      assert.ok(list.includes(name), `missing color ${name}`)
    }
    assert.deepEqual(colors.find((c) => c.name === 'primary'), { name: 'primary', value: 'var(--primary)' })
    assert.equal(list[0], 'background', 'theme colors come first, in theme order')
    assert.ok(list.indexOf('error') < list.indexOf('red-500'), 'theme colors before the palette')
    assert.match(colors.find((c) => c.name === 'red-500')?.value ?? '', /^oklch\(/)
    for (const name of ['black', 'white', 'transparent', 'current', 'inherit']) assert.ok(list.includes(name), name)
    assert.equal(new Set(list).size, list.length, 'no duplicate colors')
  })

  test('reads spacing, type, radius, shadows, breakpoints and containers', async () => {
    const tokens = await getStyleTokens(options)
    assert.deepEqual(tokens.spacing.slice(0, 4), ['0', 'px', '0.5', '1'])
    for (const key of ['4', '8', '12', '96']) assert.ok(tokens.spacing.includes(key), `spacing ${key}`)
    assert.ok(names(tokens.fontSizes).includes('lg') && names(tokens.fontSizes).includes('xl'))
    assert.ok(!names(tokens.fontSizes).some((n) => n.includes('--') || n.startsWith('shadow')), 'nested keys leaked')
    assert.deepEqual(tokens.fontWeights.find((t) => t.name === 'bold'), { name: 'bold', value: '700' })
    assert.ok(names(tokens.fonts).includes('sans') && !names(tokens.fonts).some((n) => n.startsWith('weight')))
    assert.equal(tokens.fonts.find((t) => t.name === 'sans')?.value, 'var(--font-sans)')
    assert.ok(names(tokens.leading).includes('tight') && names(tokens.tracking).includes('wide'))
    assert.deepEqual(tokens.radius.find((t) => t.name === 'lg'), { name: 'lg', value: 'var(--radius)' })
    assert.ok(names(tokens.shadows).includes('md'))
    assert.deepEqual(names(tokens.breakpoints), ['sm', 'md', 'lg', 'xl', '2xl'])
    assert.equal(tokens.breakpoints.at(-1)?.value, '86rem', 'the app value, not the default')
    assert.ok(names(tokens.containers).includes('7xl'))
  })

  test('lists every utility class, including theme and plugin classes', async () => {
    const { classList } = await getStyleTokens(options)
    for (const cls of ['bg-primary', 'pt-4', 'prose', 'text-muted-foreground', 'rounded-lg']) {
      assert.ok(classList.includes(cls), `missing ${cls}`)
    }
    assert.ok(!classList.some((c) => c.includes(':')), 'class list has no variants')
    assert.equal(new Set(classList).size, classList.length, 'no duplicate classes')
    const kb = JSON.stringify(await getStyleTokens(options)).length / 1024
    console.log(`StyleTokens: ${classList.length} classes, ${kb.toFixed(0)} KB JSON`)
  })

  test('the @theme parse fallback gives the same tokens (without a class list)', async () => {
    const tokens = await getStyleTokens(options)
    const input = (await getCanvasCssInput(options)) as unknown as CanvasCssData
    const fallback = tokensFromTheme(parseThemeEntries(input), null)
    assert.deepEqual({ ...fallback, classList: undefined }, { ...tokens, classList: undefined })
    assert.deepEqual(fallback.classList, [])
  })

  test('caches per entry content: a cache hit returns the same object', async () => {
    clearCssCache()
    let t0 = performance.now()
    const first = await getStyleTokens(options)
    const cold = performance.now() - t0
    t0 = performance.now()
    const second = await getStyleTokens(options)
    const hit = performance.now() - t0
    assert.equal(second, first, 'same cached object')
    // Relative, not a fixed limit: CI machines are slow, but a hit never compiles again.
    assert.ok(hit < cold, `cache hit took ${hit.toFixed(1)} ms, cold ${cold.toFixed(1)} ms`)
    console.log(`getStyleTokens: cold ${cold.toFixed(1)} ms, cache hit ${hit.toFixed(2)} ms`)
  })
})

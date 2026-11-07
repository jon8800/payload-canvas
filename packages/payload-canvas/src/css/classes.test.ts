// The stylesheet of the editable classes: compile, variants, custom CSS, precedence over code
// `@utility` rules, problems, and page compiles that leave the class names out.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { compileClassSheet } from './classes'
import { compileClasses, getCanvasCssInput } from './index'
import { type CanvasCssData } from './shared'
import { SITE_GLOBALS_CSS } from './siteClasses.test-data'

const here = path.dirname(fileURLToPath(import.meta.url))
const starter = path.resolve(here, '../../../../apps/starter')
const entry = path.join(starter, 'src/app/(frontend)/globals.css')
const typography: unknown = createRequire(path.join(starter, 'package.json'))('@tailwindcss/typography')
const plugins = { '@tailwindcss/typography': typography }
const options = { entry, plugins }

/** The site's input with more CSS at the end of the entry (code `@utility` rules). */
async function inputWith(extra: string): Promise<CanvasCssData> {
  const input = (await getCanvasCssInput(options)) as CanvasCssData
  return { ...input, entry: `${input.entry}\n${extra}` }
}

/** The body of the first rule for `.name` (not inside @media). */
function ruleBody(css: string, name: string): string {
  const start = css.indexOf(`.${name} {`)
  assert.ok(start >= 0, `no rule for .${name} in:\n${css}`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  return css.slice(start)
}

describe('compileClassSheet', () => {
  test('compiles styles with variants and theme tokens under the class name', async () => {
    const input = await getCanvasCssInput(options)
    const sheet = await compileClassSheet(input, [{ name: 'card', styles: 'rounded-xl p-6 md:p-8 hover:shadow-lg bg-primary' }], plugins)
    assert.deepEqual(sheet.errors, {})
    assert.deepEqual(sheet.names, ['card'])
    const rule = ruleBody(sheet.css, 'card')
    assert.match(rule, /padding: calc\(var\(--spacing\) \* 6\)/)
    // md: is a media query inside the rule, hover: a nested state.
    assert.match(rule, /@media \(width >= 48rem\)\s*\{\s*padding: calc\(var\(--spacing\) \* 8\)/)
    assert.match(rule, /&:hover/)
    assert.match(rule, /box-shadow/)
    assert.match(rule, /var\(--color-primary\)|var\(--primary\)/)
    assert.doesNotMatch(sheet.css, /pc-db-class/, 'internal names never reach the output')
    assert.match(sheet.css, /@layer utilities/)
    assert.doesNotMatch(sheet.css, /builder-css/, 'class rules are not scoped to blocks: app components may use them too')
    assert.doesNotMatch(sheet.css, /box-sizing: border-box/, 'no Preflight')
  })

  test('adds custom CSS: declarations, nested rules and keyframes', async () => {
    const input = await getCanvasCssInput(options)
    const css = [
      'background: linear-gradient(120deg, red, blue), radial-gradient(circle, white, transparent);',
      '&::before { content: ""; position: absolute; inset: 0 }',
      '@keyframes card-pulse { from { opacity: 0.5 } to { opacity: 1 } }',
      'animation: card-pulse 2s infinite',
    ].join('\n')
    const sheet = await compileClassSheet(input, [{ name: 'fancy', styles: 'relative', css }], plugins)
    assert.deepEqual(sheet.errors, {})
    const rule = ruleBody(sheet.css, 'fancy')
    assert.match(rule, /position: relative/)
    assert.match(rule, /linear-gradient\(120deg, red, blue\), radial-gradient/)
    assert.match(rule, /&::before\s*\{/)
    assert.match(rule, /animation: card-pulse 2s infinite/)
    assert.match(sheet.css, /@keyframes card-pulse/)
  })

  test('a class overrides a code @utility with the same name, and never adds its rules', async () => {
    const input = await inputWith('@utility card { border: 7px solid red; padding: 99px; }')
    const sheet = await compileClassSheet(input, [{ name: 'card', styles: 'p-4' }], plugins)
    const rule = ruleBody(sheet.css, 'card')
    assert.match(rule, /padding: calc\(var\(--spacing\) \* 4\)/)
    assert.doesNotMatch(sheet.css, /7px solid red|99px/)
  })

  test('a class can use another class, and keeps its former names as aliases', async () => {
    const input = await getCanvasCssInput(options)
    const sheet = await compileClassSheet(
      input,
      [
        { name: 'btn', styles: 'inline-flex px-4', previousNames: ['button-old'] },
        { name: 'btn-primary', styles: 'btn md:btn bg-primary' },
      ],
      plugins,
    )
    assert.deepEqual(sheet.errors, {})
    assert.deepEqual(sheet.names, ['btn', 'btn-primary', 'button-old'])
    assert.match(ruleBody(sheet.css, 'btn-primary'), /display: inline-flex/)
    assert.match(ruleBody(sheet.css, 'button-old'), /display: inline-flex/)
  })

  test('leaves out unknown Tailwind classes and broken custom CSS, and says so', async () => {
    const input = await getCanvasCssInput(options)
    const sheet = await compileClassSheet(
      input,
      [
        { name: 'card', styles: 'p-4 not-a-class mt-2' },
        { name: 'broken', styles: 'p-2', css: 'color: red; &:hover { color: blue' },
        { name: 'ok', styles: 'flex' },
        { name: '1bad', styles: 'p-1' },
      ],
      plugins,
    )
    assert.match(sheet.errors.card ?? '', /not-a-class/)
    assert.match(sheet.errors.broken ?? '', /not closed/)
    assert.match(sheet.errors['1bad'] ?? '', /start with a letter/)
    assert.match(ruleBody(sheet.css, 'card'), /margin-top/)
    assert.match(ruleBody(sheet.css, 'broken'), /padding/)
    assert.doesNotMatch(ruleBody(sheet.css, 'broken'), /color: red/)
    assert.match(ruleBody(sheet.css, 'ok'), /display: flex/)
    assert.deepEqual(sheet.names, ['broken', 'card', 'ok'])
  })

  test('a class that applies itself through another is left out; the others compile', async () => {
    const input = await getCanvasCssInput(options)
    const sheet = await compileClassSheet(
      input,
      [
        { name: 'a', styles: 'b p-1' },
        { name: 'b', styles: 'a p-2' },
        { name: 'c', styles: 'p-3' },
      ],
      plugins,
    )
    assert.ok(sheet.errors.a || sheet.errors.b, 'the loop is reported')
    assert.match(ruleBody(sheet.css, 'c'), /padding: calc\(var\(--spacing\) \* 3\)/)
  })

  test('the code fixture still compiles with classes appended (site classes, functional utilities)', async () => {
    const input: CanvasCssData = { ...((await getCanvasCssInput(options)) as CanvasCssData) }
    const fixture = await compileClassSheet({ ...input, entry: `${input.entry}\n${SITE_GLOBALS_CSS.replace(/^@import 'tailwindcss';\n@plugin '@tailwindcss\/typography';\n/, '')}` }, [{ name: 'glass', styles: 'p-2' }], plugins)
    assert.deepEqual(fixture.errors, {})
    assert.doesNotMatch(fixture.css, /backdrop-filter/, 'the code glass rule is replaced, not merged')
  })
})

describe('page compiles leave the class names out', () => {
  test('compileClasses with `exclude` drops the classes with any variant prefix', async () => {
    const css = await compileClasses(['p-4', 'card', 'md:card', 'shadow'], options, { exclude: ['card', 'shadow'] })
    assert.match(css, /\.p-4/)
    assert.doesNotMatch(css, /\.card|md\\:card|\.shadow\b/)
  })
})

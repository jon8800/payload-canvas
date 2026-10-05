// The order of the generated CSS next to the app's own CSS (docs/architecture.md section 8).
// A page loads the app's CSS (every class of the app's components, in Tailwind's order) and then
// the generated CSS (the layout's classes). These tests run a small model of the cascade over
// both sheets: last matching rule wins, as all rules are in `@layer utilities` with the same
// specificity (`:where()` adds none).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createCanvasCompiler } from './browser'
import { BUILDER_CSS_CLASS, compileClasses, getCanvasCssInput, withBuilderCssClass } from './index'
import { compileFromInput, countUtilityLayers, extractUtilities, splitTopLevel } from './shared'

const here = path.dirname(fileURLToPath(import.meta.url))
const starter = path.resolve(here, '../../../../apps/starter')
const entry = path.join(starter, 'src/app/(frontend)/globals.css')
const typography: unknown = createRequire(path.join(starter, 'package.json'))('@tailwindcss/typography')
const plugins = { '@tailwindcss/typography': typography }
const options = { entry, plugins }

/** The app's own CSS for these component classes, as the app's build makes it (no scope). */
async function appCss(classes: string[]): Promise<string> {
  const input = await getCanvasCssInput(options)
  const compiler = await compileFromInput(input, plugins)
  const statics = countUtilityLayers(compiler.build([]))
  return extractUtilities(compiler.build(classes), statics)
}

/** The generated CSS as it was before scoping: the layout's classes, unscoped. */
async function oldGeneratedCss(classes: string[]): Promise<string> {
  const input = await getCanvasCssInput(options)
  const compiler = await compileFromInput(input, plugins)
  const statics = countUtilityLayers(compiler.build([]))
  return extractUtilities(compiler.build(classes), statics)
}

const CLASS = /\.((?:\\.|[\w-])+)/g
const unescape = (value: string) => value.replace(/\\(.)/g, '$1')
/** Index of the first `{` that is not escaped. */
const open = (statement: string) => statement.search(/(?<!\\)\{/)
const headOf = (statement: string) => statement.slice(0, open(statement))
const blockOf = (statement: string) => statement.slice(open(statement) + 1, statement.lastIndexOf('}'))
const minWidth = (head: string) => Number(head.match(/@media \(width >= ([\d.]+)rem\)/)?.[1] ?? NaN) * 16

/**
 * The `display` an element gets from these sheets at a viewport width, in a model of the cascade:
 * a rule of `@layer utilities` matches when the element has the rule's own class (the first class
 * in its selector) and, if the selector has `:where(.builder-css)`, the marker class.
 * `@media (width >= Nrem)` (around or inside a rule) applies when the width is at least N * 16 px.
 */
function display(sheets: string[], element: string, width: number): string | undefined {
  const classes = new Set(element.split(' '))
  let value: string | undefined
  const visit = (statements: string[]) => {
    for (const statement of statements) {
      const head = headOf(statement)
      if (head.startsWith('@media')) {
        if (width >= minWidth(head)) visit(splitTopLevel(blockOf(statement)))
        continue
      }
      const own = [...head.matchAll(CLASS)].map((m) => unescape(m[1])).find((cls) => cls !== BUILDER_CSS_CLASS)
      if (!own || !classes.has(own)) continue
      if (head.includes(`:where(.${BUILDER_CSS_CLASS})`) && !classes.has(BUILDER_CSS_CLASS)) continue
      const body = blockOf(statement)
      const nested = body.match(/@media ([^{]*)\{\s*display:\s*([\w-]+)/)
      if (nested) {
        if (width >= minWidth(`@media ${nested[1]}`)) value = nested[2]
        continue
      }
      const plain = body.match(/^\s*display:\s*([\w-]+)/)
      if (plain) value = plain[1]
    }
  }
  for (const sheet of sheets) {
    const layer = splitTopLevel(sheet).find((s) => /^@layer utilities\s*\{/.test(s))
    if (layer) visit(splitTopLevel(blockOf(layer)))
  }
  return value
}

const DESKTOP = 1024
const PHONE = 390

describe('generated CSS next to the app CSS', () => {
  test('a component with `flex md:grid` stays grid on desktop when a layout uses `flex`', async () => {
    const app = await appCss(['flex', 'md:grid'])
    const layout = ['flex', 'gap-4']
    const component = 'flex md:grid'

    // The bug: the old generated CSS declares `.flex` again after the app's `md:grid`.
    const before = [app, await oldGeneratedCss(layout)]
    assert.equal(display(before, component, DESKTOP), 'flex', 'the old output reproduces the bug')

    const after = [app, await compileClasses(layout, options)]
    assert.equal(display(after, component, DESKTOP), 'grid')
    assert.equal(display(after, component, PHONE), 'flex')
    // The block itself still gets its class.
    assert.equal(display(after, withBuilderCssClass('flex gap-4') ?? '', DESKTOP), 'flex')
  })

  test('a component with `grid md:flex` stays flex on desktop when a layout uses `grid`', async () => {
    const app = await appCss(['grid', 'md:flex'])
    const layout = ['grid', 'grid-cols-3']
    const component = 'grid md:flex'

    const before = [app, await oldGeneratedCss(layout)]
    assert.equal(display(before, component, DESKTOP), 'grid', 'the old output reproduces the bug')

    const after = [app, await compileClasses(layout, options)]
    assert.equal(display(after, component, DESKTOP), 'flex')
    assert.equal(display(after, component, PHONE), 'grid')
  })

  test('a block keeps its own variant order when the app has the reverse pair', async () => {
    // The app's `md:flex` comes before the generated `.grid`; the block's own `md:flex` is in the
    // generated CSS too, after its `.grid`.
    const app = await appCss(['flex', 'md:grid', 'grid', 'md:flex'])
    const blockA = withBuilderCssClass('grid md:flex') ?? ''
    const blockB = withBuilderCssClass('flex md:grid') ?? ''
    const sheets = [app, await compileClasses(['grid', 'md:flex', 'flex', 'md:grid'], options)]
    assert.equal(display(sheets, blockA, DESKTOP), 'flex')
    assert.equal(display(sheets, blockA, PHONE), 'grid')
    assert.equal(display(sheets, blockB, DESKTOP), 'grid')
    assert.equal(display(sheets, blockB, PHONE), 'flex')
    // And the app's components on the same page keep theirs.
    assert.equal(display(sheets, 'flex md:grid', DESKTOP), 'grid')
    assert.equal(display(sheets, 'grid md:flex', DESKTOP), 'flex')
  })

  test('the canvas compile is scoped the same way', async () => {
    const app = await appCss(['flex', 'md:grid'])
    const canvas = await createCanvasCompiler(await getCanvasCssInput(options), plugins)
    const css = canvas.build(['flex', 'gap-4'])
    assert.equal(display([app, css], 'flex md:grid', DESKTOP), 'grid')
    assert.equal(display([app, css], withBuilderCssClass('flex gap-4') ?? '', DESKTOP), 'flex')
    // Preflight stays global in the canvas build.
    assert.match(css, /box-sizing: border-box/)
  })
})

describe('scoping', () => {
  // Classes whose rules Tailwind writes in different shapes.
  const TRICKY = [
    'md:grid',
    '2xl:p-4',
    'hover:bg-primary',
    'dark:text-white',
    'space-y-4',
    'divide-y',
    '*:p-2',
    '[&_p]:mt-2',
    "content-['{x}']",
    'group-hover:underline',
    'peer-checked:flex',
    'has-[img]:p-1',
    '!mt-3',
    'before:block',
    'prose',
    'animate-spin',
    'bg-[url(/a;b.png)]',
  ]

  test('every rule of the generated utilities gets the scope after its own class', async () => {
    const css = await compileClasses(TRICKY, options)
    const layer = splitTopLevel(css).find((s) => /^@layer utilities\s*\{/.test(s))
    assert.ok(layer)
    const rules = splitTopLevel(blockOf(layer))
    assert.ok(rules.length >= TRICKY.length - 1, `expected a rule per class, got ${rules.length}`)
    const heads = (statements: string[]): string[] =>
      statements.flatMap((s) => (s.startsWith('@') ? heads(splitTopLevel(blockOf(s))) : [headOf(s)]))
    for (const head of heads(rules)) assert.match(head, /:where\(\.builder-css\)/, `unscoped rule: ${head}`)
    // Shapes Tailwind writes with the class inside another selector.
    assert.match(css, /:where\(\.space-y-4:where\(\.builder-css\) > :not\(:last-child\)\)/)
    assert.match(css, /:is\(\.\\\*\\:p-2:where\(\.builder-css\) > \*\)/)
    // Classes of other elements stay unscoped (`.group` is any ancestor).
    assert.match(css, /:where\(\.group\)/)
    assert.doesNotMatch(css, /\.group:where\(\.builder-css\)/)
    // Keyframes and @property rules are not touched.
    assert.match(css, /@keyframes spin/)
  })

  test('withBuilderCssClass adds the marker only to non-empty classes', () => {
    assert.equal(withBuilderCssClass('p-4 md:p-8'), 'p-4 md:p-8 builder-css')
    assert.equal(withBuilderCssClass(' '), undefined)
    assert.equal(withBuilderCssClass(undefined), undefined)
  })
})

// Tailwind compile from an in-memory record of stylesheets. Shared by the server compile and the
// canvas iframe. Must not import Node built-ins: browser.ts imports this file.
import { compile } from 'tailwindcss'

import type { CanvasCssInput, TailwindPlugins } from './index'
import { BUILDER_CSS_CLASS } from './marker'

export type Compiler = Awaited<ReturnType<typeof compile>>

export type Stylesheet = { path: string; base: string; content: string }

/**
 * The private shape of CanvasCssInput.
 * Paths and bases are relative to the entry file's folder (forward slashes), so the browser
 * never sees server file paths. The entry's own base is ".".
 */
export type CanvasCssData = {
  version: 1
  /** The entry CSS content. */
  entry: string
  /** Every stylesheet Tailwind loaded, by `stylesheetKey(id, base)`. */
  stylesheets: Record<string, Stylesheet>
  /** Every `@plugin` id the entry uses. */
  plugins: string[]
}

export const ENTRY_BASE = '.'

export const stylesheetKey = (id: string, base: string) => `${id}|${base}`

export function missingPluginError(id: string): Error {
  return new Error(
    `Tailwind plugin "${id}" is used by @plugin in the CSS entry but is not in the plugins map. ` +
      `Pass it as plugins: { '${id}': plugin }.`,
  )
}

export function loadPlugin(id: string, base: string, plugins: TailwindPlugins = {}) {
  if (!Object.hasOwn(plugins, id)) throw missingPluginError(id)
  const mod = plugins[id] as { default?: unknown } | undefined
  // Accept both the plugin and an ES module namespace that wraps it.
  const plugin = mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod
  return Promise.resolve({ path: id, base, module: plugin as never })
}

/**
 * Creates a Tailwind compiler from a recorded input. No file system.
 * Each compiler remembers every class passed to build(), so make a new one when the class set
 * must not grow.
 */
export function compileFromInput(input: CanvasCssInput, plugins?: TailwindPlugins): Promise<Compiler> {
  const data = input as CanvasCssData
  if (data.version !== 1) throw new Error(`Unsupported CanvasCssInput version: ${String(data.version)}`)
  return compile(data.entry, {
    base: ENTRY_BASE,
    loadStylesheet: (id, base) => {
      const sheet = data.stylesheets[stylesheetKey(id, base)]
      if (!sheet) return Promise.reject(new Error(`Stylesheet "${id}" (from "${base}") is not in the CanvasCssInput.`))
      return Promise.resolve(sheet)
    },
    loadModule: (id, base) => loadPlugin(id, base, plugins),
  })
}

/** Splits a stylesheet into its top-level statements (rules and at-rules). Comments are dropped. */
export function splitTopLevel(css: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  let i = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      const stop = end === -1 ? css.length : end + 2
      if (depth === 0) start = stop
      i = stop
      continue
    }
    // An escaped character outside a string (`.content-\[\'x\'\]`) is never a quote or a brace.
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '"' || ch === "'") {
      i++
      while (i < css.length && css[i] !== ch) i += css[i] === '\\' ? 2 : 1
      i++
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push(css.slice(start, i + 1).trim())
        start = i + 1
      }
    }
    if (ch === ';' && depth === 0) {
      const stmt = css.slice(start, i + 1).trim()
      if (stmt) out.push(stmt)
      start = i + 1
    }
    i++
  }
  return out.filter(Boolean)
}

const layerPattern = (name: string) => new RegExp(`^@layer ${name}\\s*\\{`)

const findLayer = (statements: string[], name: string) => statements.find((s) => layerPattern(name).test(s))

/**
 * Counts the `@layer utilities` blocks in an empty build (`compiler.build([])`). These are the
 * app's own hand-written utilities. Tailwind's generated block exists only when some class
 * matched, so a build with more blocks than this has generated utilities, and they come first.
 */
export function countUtilityLayers(css: string): number {
  return splitTopLevel(css).filter((s) => layerPattern('utilities').test(s)).length
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ---------------------------------------------------------------------------------------------
// Scoping: every generated rule matches only elements with the marker class (see marker.ts)

const SCOPE = `:where(.${BUILDER_CSS_CLASS})`
/** A class selector, with CSS escapes (`\:`, `\32 `). */
const CLASS_TOKEN = /\.((?:\\[0-9a-fA-F]{1,6}[ \t\n]?|\\[^\n]|[\w -￿-])+)/g
const ESCAPE = /\\([0-9a-fA-F]{1,6})[ \t\n]?|\\([^\n])/g

const unescapeClass = (value: string) =>
  value.replace(ESCAPE, (_, hex: string | undefined, ch: string | undefined) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : (ch ?? ''),
  )

/** Index of the `{` that opens a statement's block, skipping escapes, strings and brackets. */
function blockStart(statement: string): number {
  let depth = 0
  for (let i = 0; i < statement.length; i++) {
    const ch = statement[i]
    if (ch === '\\') i++
    else if (ch === '"' || ch === "'") {
      i++
      while (i < statement.length && statement[i] !== ch) i += statement[i] === '\\' ? 2 : 1
    } else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === '{' && depth === 0) return i
  }
  return -1
}

/**
 * Adds the scope after the class of the rule's own utility: the first class in the selector that
 * is one of `classes` (Tailwind writes it first: `.md\:grid`, `:where(.space-y-4 > …)`,
 * `:is(.\*\:p-4 > *)`). Other classes (`.dark`, `.group`) stay as they are.
 */
function scopeSelector(selector: string, classes: ReadonlySet<string>): string {
  let target: string | null = null
  for (const match of selector.matchAll(CLASS_TOKEN)) {
    if (classes.has(unescapeClass(match[1]))) {
      target = match[0]
      break
    }
  }
  if (!target) return selector
  let out = ''
  let last = 0
  for (const match of selector.matchAll(CLASS_TOKEN)) {
    if (match[0] !== target) continue
    const end = (match.index ?? 0) + match[0].length
    // A hex escape may end in a space (`.\32 xl\:p-4`); the scope goes after the whole class.
    out += `${selector.slice(last, end).trimEnd()}${SCOPE}`
    last = end
  }
  return out + selector.slice(last)
}

function scopeStatements(css: string, classes: ReadonlySet<string>): string {
  return splitTopLevel(css)
    .map((statement) => {
      const open = blockStart(statement)
      if (open === -1) return statement
      const head = statement.slice(0, open)
      // At-rules (`@media`, `@supports`) wrap rules: scope the rules inside.
      if (head.startsWith('@')) return `${head}{\n${scopeStatements(statement.slice(open + 1, -1), classes)}\n}`
      return `${scopeSelector(head.trimEnd(), classes)} ${statement.slice(open)}`
    })
    .join('\n')
}

/** Scopes every rule in a `@layer utilities { … }` statement to the marker class. */
export function scopeUtilitiesLayer(layer: string, classes: ReadonlySet<string>): string {
  const open = blockStart(layer)
  return `${layer.slice(0, open)}{\n${scopeStatements(layer.slice(open + 1, -1), classes)}\n}`
}

/**
 * A full build with its generated utilities (the first `@layer utilities` block, when there are
 * more than `staticUtilityLayers`) scoped to the marker class. The rest stays as it is.
 */
export function scopeFullBuild(fullCss: string, staticUtilityLayers: number, classes: ReadonlySet<string>): string {
  const statements = splitTopLevel(fullCss)
  const layers = statements.filter((s) => layerPattern('utilities').test(s))
  if (layers.length <= staticUtilityLayers) return statements.join('\n')
  return statements.map((s) => (s === layers[0] ? scopeUtilitiesLayer(s, classes) : s)).join('\n')
}

/**
 * Keeps only what the generated utilities need from a full Tailwind build:
 * - the `properties` and `theme` layers (theme holds only the variables the build used, and stays
 *   layered, so the site's unlayered `:root` values win),
 * - the first `@layer utilities` block (the one at `@tailwind utilities`; later blocks are the
 *   app's own hand-written utilities), scoped to the marker class when `classes` is given,
 * - the `@property` and `@keyframes` rules those utilities reference.
 * Drops Preflight, `@layer base`, and every unlayered rule (`:root`, `.dark`).
 * `staticUtilityLayers` comes from countUtilityLayers(); with no generated block this returns "".
 */
export function extractUtilities(fullCss: string, staticUtilityLayers: number, classes?: ReadonlySet<string>): string {
  const statements = splitTopLevel(fullCss)
  const layers = statements.filter((s) => layerPattern('utilities').test(s))
  if (layers.length <= staticUtilityLayers) return ''
  const utilities = classes ? scopeUtilitiesLayer(layers[0], classes) : layers[0]

  const kept: string[] = ['@layer properties, theme, base, components, utilities;']
  for (const name of ['properties', 'theme']) {
    const block = findLayer(statements, name)
    if (block) kept.push(block)
  }
  kept.push(utilities)

  for (const stmt of statements) {
    const prop = stmt.match(/^@property\s+(--[\w-]+)/)?.[1]
    if (prop && new RegExp(`${escapeRegExp(prop)}(?![\\w-])`).test(utilities)) kept.push(stmt)
    const keyframes = stmt.match(/^@keyframes\s+([\w-]+)/)?.[1]
    if (keyframes && new RegExp(`animation(-name)?:[^;]*\\b${escapeRegExp(keyframes)}\\b`).test(utilities)) {
      kept.push(stmt)
    }
  }
  return kept.join('\n')
}

/** Trims, drops empties and duplicates, sorts. Sorting makes the cache key stable. */
export function normalizeClasses(classes: string[]): string[] {
  const set = new Set<string>()
  for (const value of classes) {
    for (const cls of value.split(/\s+/)) if (cls) set.add(cls)
  }
  return [...set].toSorted()
}

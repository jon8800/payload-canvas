// Tailwind compile from an in-memory record of stylesheets. Shared by the server compile and the
// canvas iframe. Must not import Node built-ins: browser.ts imports this file.
import { compile } from 'tailwindcss'

import type { CanvasCssInput, TailwindPlugins } from './index'

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

/**
 * Keeps only what the generated utilities need from a full Tailwind build:
 * - the `properties` and `theme` layers (theme holds only the variables the build used, and stays
 *   layered, so the site's unlayered `:root` values win),
 * - the first `@layer utilities` block (the one at `@tailwind utilities`; later blocks are the
 *   app's own hand-written utilities),
 * - the `@property` and `@keyframes` rules those utilities reference.
 * Drops Preflight, `@layer base`, and every unlayered rule (`:root`, `.dark`).
 * `staticUtilityLayers` comes from countUtilityLayers(); with no generated block this returns "".
 */
export function extractUtilities(fullCss: string, staticUtilityLayers: number): string {
  const statements = splitTopLevel(fullCss)
  const layers = statements.filter((s) => layerPattern('utilities').test(s))
  if (layers.length <= staticUtilityLayers) return ''
  const utilities = layers[0]

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

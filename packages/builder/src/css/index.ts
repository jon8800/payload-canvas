import type { StyleTokens } from '../core/types'

// Server-only Tailwind compile. Owner: css agent. See docs/architecture.md section 8.
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compile } from 'tailwindcss'

import {
  type CanvasCssData,
  compileFromInput,
  countUtilityLayers,
  ENTRY_BASE,
  extractUtilities,
  loadPlugin,
  normalizeClasses,
  type Stylesheet,
  stylesheetKey,
} from './shared'
import { buildStyleTokens } from './tokens'

export { applyFontFamilies, resolveFontValue, type FontFamilies } from './tokens'

/** Tailwind plugins by the id used in `@plugin "<id>"`, e.g. { '@tailwindcss/typography': typography }. */
export type TailwindPlugins = Record<string, unknown>

export type CssOptions = {
  /** Absolute path to the app's Tailwind entry CSS (the file with @import "tailwindcss" and @theme). */
  entry: string
  plugins?: TailwindPlugins
}

/**
 * What the canvas iframe needs to run the same compile in the browser.
 * JSON-serializable. Its inner shape is private to the css module.
 */
export type CanvasCssInput = { version: 1; entry: string; [key: string]: unknown }

// ---------------------------------------------------------------------------------------------
// Small LRU cache

class Lru<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}

  get(key: string): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: string, value: V) {
    this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
  }

  delete(key: string) {
    this.map.delete(key)
  }

  clear() {
    this.map.clear()
  }
}

// ---------------------------------------------------------------------------------------------
// File reads and stylesheet resolution

const fileCache = new Map<string, { mtimeMs: number; content: string }>()

async function readCached(file: string): Promise<string> {
  const { mtimeMs } = await fs.stat(file)
  const cached = fileCache.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.content
  const content = await fs.readFile(file, 'utf8')
  fileCache.set(file, { mtimeMs, content })
  return content
}

type ExportTarget = string | null | { [condition: string]: ExportTarget } | ExportTarget[]

const STYLE_CONDITIONS = ['style', 'default', 'import', 'require']

function pickExport(target: ExportTarget | undefined): string | null {
  if (!target) return null
  if (typeof target === 'string') return target
  if (Array.isArray(target)) {
    for (const entry of target) {
      const picked = pickExport(entry)
      if (picked) return picked
    }
    return null
  }
  for (const condition of STYLE_CONDITIONS) {
    if (!(condition in target)) continue
    const picked = pickExport(target[condition])
    if (picked) return picked
  }
  return null
}

function splitPackageId(id: string): { name: string; subpath: string } {
  const parts = id.split('/')
  const nameParts = id.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)
  const rest = parts.slice(nameParts.length)
  return { name: nameParts.join('/'), subpath: rest.length ? `./${rest.join('/')}` : '.' }
}

async function findPackageDir(name: string, base: string): Promise<string> {
  let dir = base
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name)
    try {
      await fs.access(path.join(candidate, 'package.json'))
      return candidate
    } catch {
      // keep walking up
    }
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`Cannot find package "${name}" (imported from ${base})`)
    dir = parent
  }
}

const withCss = (file: string) => (file.endsWith('.css') ? file : `${file}.css`)

/** Resolves an `@import` id to a file: relative paths, or packages via `exports` (style condition) / `style`. */
async function resolveStylesheet(id: string, base: string): Promise<string> {
  if (id.startsWith('.') || path.isAbsolute(id)) return withCss(path.resolve(base, id))

  const { name, subpath } = splitPackageId(id)
  const pkgDir = await findPackageDir(name, base)
  const pkg = JSON.parse(await readCached(path.join(pkgDir, 'package.json'))) as {
    exports?: ExportTarget | Record<string, ExportTarget>
    style?: string
    main?: string
  }

  if (pkg.exports) {
    const isSubpathMap =
      typeof pkg.exports === 'object' && !Array.isArray(pkg.exports) && Object.keys(pkg.exports)[0]?.startsWith('.')
    const map = (isSubpathMap ? pkg.exports : { '.': pkg.exports }) as Record<string, ExportTarget>
    const target = pickExport(map[subpath]) ?? pickExport(map[`${subpath}.css`])
    if (target) return path.join(pkgDir, target)
  }
  if (subpath !== '.') return path.join(pkgDir, withCss(subpath))
  return path.join(pkgDir, pkg.style ?? (pkg.main?.endsWith('.css') ? pkg.main : 'index.css'))
}

// ---------------------------------------------------------------------------------------------
// Canvas input: every stylesheet the compile loads, recorded with paths relative to the entry

const hash = (...parts: string[]) => createHash('sha256').update(parts.join('\0')).digest('hex')

const inputCache = new Lru<Promise<CanvasCssData>>(8)

/** countUtilityLayers() of an empty build, per recorded input. Server-side only. */
const staticUtilityLayers = new WeakMap<CanvasCssData, number>()

async function recordInput(entryFile: string, entryCss: string, plugins?: TailwindPlugins): Promise<CanvasCssData> {
  const entryDir = path.dirname(entryFile)
  const toVirtual = (real: string) => path.relative(entryDir, real).replaceAll('\\', '/') || ENTRY_BASE
  const data: CanvasCssData = { version: 1, entry: entryCss, stylesheets: {}, plugins: [] }

  const compiler = await compile(entryCss, {
    base: ENTRY_BASE,
    loadStylesheet: async (id, base) => {
      const file = await resolveStylesheet(id, path.resolve(entryDir, base))
      let content: string
      try {
        content = await readCached(file)
      } catch {
        throw new Error(`Cannot read stylesheet "${id}" (resolved to ${file})`)
      }
      const sheet: Stylesheet = { path: toVirtual(file), base: toVirtual(path.dirname(file)), content }
      data.stylesheets[stylesheetKey(id, base)] = sheet
      return sheet
    },
    loadModule: (id, base) => {
      if (!data.plugins.includes(id)) data.plugins.push(id)
      return loadPlugin(id, base, plugins)
    },
  })
  staticUtilityLayers.set(data, countUtilityLayers(compiler.build([])))
  return data
}

async function getInput(options: CssOptions): Promise<CanvasCssData> {
  const entryCss = await readCached(options.entry)
  const key = hash(options.entry, entryCss)
  const cached = inputCache.get(key)
  if (cached) return cached
  const pending = recordInput(options.entry, entryCss, options.plugins)
  inputCache.set(key, pending)
  pending.catch(() => inputCache.delete(key))
  return pending
}

// ---------------------------------------------------------------------------------------------
// Public API

const cssCache = new Lru<string>(100)

/**
 * Compiles only the given classes against the app's CSS entry. Output: the utilities plus the
 * @property / @keyframes rules they need. No Preflight, no base layer, never overrides theme vars.
 * Unknown classes are ignored. A `@plugin` id missing from `plugins` throws.
 * Results are cached (LRU) by entry content, plugin ids and the sorted class set.
 */
export async function compileClasses(classes: string[], options: CssOptions): Promise<string> {
  const candidates = normalizeClasses(classes)
  if (candidates.length === 0) return ''

  const input = await getInput(options)
  const pluginIds = Object.keys(options.plugins ?? {}).toSorted().join(',')
  const key = hash(options.entry, input.entry, pluginIds, candidates.join(' '))
  const cached = cssCache.get(key)
  if (cached !== undefined) return cached

  // A new compiler per call: build() remembers every class it has seen.
  const compiler = await compileFromInput(input, options.plugins)
  const css = extractUtilities(compiler.build(candidates), staticUtilityLayers.get(input) ?? 0)
  cssCache.set(key, css)
  return css
}

/** Input for createCanvasCompiler (browser). Cached per entry file content. */
export async function getCanvasCssInput(options: CssOptions): Promise<CanvasCssInput> {
  return getInput(options)
}

/** Clears every cache: file reads, canvas inputs and compiled CSS. For tests and dev tooling. */
export function clearCssCache() {
  fileCache.clear()
  inputCache.clear()
  cssCache.clear()
  tokensCache.clear()
}

/** Escapes glob characters that are common in Next route folders: `(group)`, `[slug]`, `{a,b}`. */
const escapeGlob = (value: string) => value.replace(/[()[\]{}]/g, '\\$&')

/**
 * Globs for next.config `outputFileTracingIncludes['/*']`, so the compile works in standalone
 * output. The compile reads these files with fs at runtime, so Next's tracer cannot see them.
 * Covers the entry file and the CSS packages the starter imports (tailwindcss, tw-animate-css,
 * shadcn). Plugins are not listed: they come from the plugins map, so Next bundles them.
 */
export function tracingIncludes(entryRelativeToApp: string): string[] {
  const entry = entryRelativeToApp.replaceAll('\\', '/').replace(/^(\.\/)?/, './')
  return [
    escapeGlob(entry),
    './node_modules/tailwindcss/package.json',
    './node_modules/tailwindcss/*.css',
    './node_modules/tw-animate-css/package.json',
    './node_modules/tw-animate-css/dist/*.css',
    './node_modules/shadcn/package.json',
    './node_modules/shadcn/dist/tailwind.css',
  ]
}

const tokensCache = new Lru<Promise<StyleTokens>>(8)

/**
 * Design tokens and the class list from the app's Tailwind theme, for the Styles panel.
 * Uses Tailwind's design system API; falls back to parsing @theme if that API breaks
 * (see tokens.ts). Cached per entry path, entry content and plugin ids.
 */
export async function getStyleTokens(options: CssOptions): Promise<StyleTokens> {
  const entryCss = await readCached(options.entry)
  const pluginIds = Object.keys(options.plugins ?? {}).toSorted().join(',')
  const key = hash('tokens', options.entry, entryCss, pluginIds)
  const cached = tokensCache.get(key)
  if (cached) return cached
  const pending = getInput(options).then(async (input) => (await buildStyleTokens(input, options.plugins)).tokens)
  tokensCache.set(key, pending)
  pending.catch(() => tokensCache.delete(key))
  return pending
}

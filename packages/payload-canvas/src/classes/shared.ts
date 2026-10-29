// Editable classes (the `builder-classes` collection): shared types, keys and pure helpers.
// Browser-safe: no Node built-ins and no Payload runtime imports. The editor, the canvas, the
// server and the MCP tools all use these. See the README section "Editable classes".

import type { SiteClass } from '../core/types'

/** Default slug of the classes collection. */
export const DEFAULT_CLASSES_SLUG = 'builder-classes'

/** Default slug of the hidden global that stores the compiled stylesheet of the published classes. */
export const DEFAULT_CLASSES_SHEET_SLUG = 'builder-classes-sheet'

/** Path below the API route: `GET` lists the classes (latest drafts). Sub-paths: `/usage`, `/import`, `/rename`, `/delete`. */
export const CLASSES_PATH = '/builder/classes'

/** Path below the API route of the compiled stylesheet: `GET {api}/builder/classes-sheet/<hash>.css`. */
export const CLASSES_SHEET_PATH = '/builder/classes-sheet'

/**
 * BroadcastChannel name. The editor posts `{ classes }` (the latest drafts, with its own unsaved
 * edits) after every class change; canvases in the same browser compile them at once.
 */
export const CLASSES_CHANNEL = 'payload-canvas:classes'

/** Server-only key in `config.custom` that holds `ClassesServerConfig`. */
export const CLASSES_CONFIG_KEY = 'websiteBuilderClasses'

/** `context` flag: delete a class even while blocks use it (the plugin removed it from them first). */
export const FORCE_DELETE_CLASS_CONTEXT = 'builderForceDeleteClass'

export const CLASS_NAME_MAX = 64
/** Former names a class keeps at most (see `previousNames`). */
export const CLASS_ALIASES_MAX = 10

/** One editable class as the editor, the canvas and the MCP tools see it (its newest version). */
export type BuilderClass = {
  id: string | number
  /** The class name blocks use, e.g. "card". */
  name: string
  label?: string | null
  group?: string | null
  /** Tailwind classes with variants, e.g. "rounded-xl p-6 md:p-8 hover:shadow-lg". */
  styles?: string | null
  /** Custom CSS inside the class rule: declarations, nested rules (`&::before`), `@keyframes`. */
  css?: string | null
  /** Names the class had when it was published before. Published pages that still use them keep their look. */
  previousNames?: string[] | null
  /** `draft`: the newest version is not published (new, or has unpublished changes). */
  status: 'draft' | 'published'
  updatedAt?: string | null
}

/** What the compile needs from a class. */
export type ClassStyleSource = Pick<BuilderClass, 'name' | 'styles' | 'css' | 'previousNames'>

/** The client config of the classes (in `BuilderClientConfig.classes`). */
export type ClassesClientConfig = {
  /** Slug of the classes collection, for REST writes (`{api}/{collection}/{id}`). */
  collection: string
  /** Full API path of the plugin's class endpoints, e.g. "/api/builder/classes". */
  endpoint: string
}

/** Where one class is used: blocks in one document. */
export type ClassUsageDocument = {
  collection: string
  id: string | number
  /** The document's title (its `useAsTitle` field), else its id. */
  title: string
  /** Blocks (and inner parts) in this document that use the class. */
  blocks: number
}

/** Where one class is used, in the latest drafts (and open live sessions) of every builder collection. */
export type ClassUsage = { blocks: number; documents: ClassUsageDocument[] }

// ---------------------------------------------------------------------------------------------
// Names

const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/

/** Prefix of the names the compile gives classes internally. Never a class name. */
export const INTERNAL_CLASS_PREFIX = 'pc-db-class-'

/** Names that never become classes: the marker of generated CSS and the plugin's own prefixes. */
const RESERVED = new Set(['builder-css', 'group', 'peer', 'dark', 'container'])

/**
 * Why a class name is not usable, or null. Checks the form only (a CSS identifier without escapes,
 * no variant prefix); `tailwindUtilityProblem` (server) checks that Tailwind has no utility with it.
 */
export function classNameProblem(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'Enter a class name.'
  const value = name.trim()
  if (value.length > CLASS_NAME_MAX) return `Use at most ${CLASS_NAME_MAX} characters.`
  if (value.startsWith('.')) return 'Leave out the dot: "card", not ".card".'
  if (!NAME.test(value)) return 'Use letters, digits, "-" and "_", and start with a letter or "_". For example "card" or "btn-primary".'
  if (RESERVED.has(value) || value.startsWith(INTERNAL_CLASS_PREFIX) || value.startsWith('builder-')) return `“${value}” is reserved. Pick another name.`
  return null
}

/** The variant prefix ("md:hover:"), the bare class and an important mark of one class token. */
export function splitClassToken(token: string): { prefix: string; bare: string; important: boolean } {
  const prefix = /^(?:[^\s:[\]]+:|!)*/.exec(token)?.[0] ?? ''
  const rest = token.slice(prefix.length)
  const important = rest.endsWith('!')
  return { prefix, bare: important ? rest.slice(0, -1) : rest, important }
}

/** The bare class of a token: "md:hover:card!" -> "card". */
export const bareClass = (token: string) => splitClassToken(token).bare

export const classTokens = (className: string | null | undefined): string[] => (className ?? '').split(/\s+/).filter(Boolean)

/** True when a class string uses the class, with or without a variant prefix. */
export function usesClass(className: string | null | undefined, name: string): boolean {
  return classTokens(className).some((token) => bareClass(token) === name)
}

/**
 * Replaces every use of class `from` in a class string with `to` (keeping each variant prefix and
 * important mark), or removes it when `to` is null. Duplicates go; the order stays.
 */
export function replaceClass(className: string | null | undefined, from: string, to: string | null): string {
  const out: string[] = []
  for (const token of classTokens(className)) {
    const { prefix, bare, important } = splitClassToken(token)
    if (bare !== from) {
      if (!out.includes(token)) out.push(token)
      continue
    }
    if (to === null) continue
    const next = `${prefix}${to}${important ? '!' : ''}`
    if (!out.includes(next)) out.push(next)
  }
  return out.join(' ')
}

/** Removes the tokens whose bare class is in `names`. For page compiles: these classes come from the classes stylesheet. */
export function withoutClassNames(classes: readonly string[], names: ReadonlySet<string>): string[] {
  if (names.size === 0) return [...classes]
  return classes.filter((token) => !names.has(bareClass(token)))
}

/** Every name the classes answer to: their names and their former names. */
export function classNamesOf(classes: readonly ClassStyleSource[]): Set<string> {
  const names = new Set<string>()
  for (const item of classes) {
    names.add(item.name)
    for (const alias of item.previousNames ?? []) names.add(alias)
  }
  return names
}

// ---------------------------------------------------------------------------------------------
// Custom CSS

/** At-rules that change the design system or load files. Custom CSS only styles the class. */
const FORBIDDEN_AT_RULES = ['import', 'plugin', 'config', 'source', 'theme', 'utility', 'custom-variant', 'tailwind', 'layer', 'reference', 'charset', 'namespace']

/**
 * Why a class's custom CSS cannot compile, or null: unbalanced braces, brackets or quotes, an
 * at-rule that would change the design system (`@import`, `@theme`, `@utility`, …), or text that
 * would end a `<style>` tag.
 */
export function cssProblem(css: string | null | undefined): string | null {
  const value = css ?? ''
  if (!value.trim()) return null
  if (/<\/style/i.test(value)) return 'Custom CSS cannot contain "</style".'
  const at = new RegExp(`@(${FORBIDDEN_AT_RULES.join('|')})\\b`, 'i').exec(value.replace(/\/\*[^]*?\*\//g, ''))
  if (at) return `Custom CSS cannot use @${at[1]}. It styles this class only.`
  const stack: string[] = []
  const pairs: Record<string, string> = { '}': '{', ')': '(', ']': '[' }
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!
    if (ch === '/' && value[i + 1] === '*') {
      const end = value.indexOf('*/', i + 2)
      if (end === -1) return 'A comment is not closed: add "*/".'
      i = end + 1
      continue
    }
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      const end = closingQuote(value, i)
      if (end === -1) return `A string is not closed: add ${ch}.`
      i = end
      continue
    }
    if (ch === '{' || ch === '(' || ch === '[') stack.push(ch)
    else if (ch in pairs) {
      if (stack.pop() !== pairs[ch]) return `"${ch}" has no matching "${pairs[ch]}".`
    }
  }
  if (stack.length > 0) return `"${stack.at(-1)}" is not closed.`
  return null
}

function closingQuote(value: string, start: number): number {
  const quote = value[start]
  for (let i = start + 1; i < value.length; i++) {
    if (value[i] === '\\') i++
    else if (value[i] === quote) return i
    else if (value[i] === '\n') return -1
  }
  return -1
}

// ---------------------------------------------------------------------------------------------
// Data helpers

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, max)
  return trimmed || null
}

/** One space between classes, no empty value. */
export const normalizeStyles = (value: unknown): string | null => (typeof value === 'string' ? classTokens(value).join(' ') || null : null)

/** A classes document (REST or Local API, depth 0) as a `BuilderClass`. Null without an id or name. */
export function toBuilderClass(doc: Record<string, unknown>): BuilderClass | null {
  const { id, name } = doc
  if ((typeof id !== 'string' && typeof id !== 'number') || typeof name !== 'string' || !name) return null
  const previous = Array.isArray(doc.previousNames) ? doc.previousNames.filter((n): n is string => typeof n === 'string' && n !== name) : []
  return {
    id,
    name,
    label: text(doc.label, 120),
    group: text(doc.group, 60),
    styles: normalizeStyles(doc.styles),
    css: typeof doc.css === 'string' && doc.css.trim() ? doc.css : null,
    previousNames: previous.length > 0 ? previous : null,
    status: doc._status === 'draft' ? 'draft' : 'published',
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
  }
}

/** Former names to keep after a rename: the old name first, without the new name and duplicates. */
export function withPreviousName(previous: readonly string[] | null | undefined, oldName: string, newName: string): string[] {
  return [oldName, ...(previous ?? [])].filter((n, i, all) => n !== newName && all.indexOf(n) === i).slice(0, CLASS_ALIASES_MAX)
}

/** A short preview of what a class does, for tooltips and suggestions. */
export function classPreview(item: Pick<BuilderClass, 'styles' | 'css'>, max = 160): string {
  const parts = [item.styles ?? '', (item.css ?? '').replace(/\/\*[^]*?\*\//g, '').replace(/\s+/g, ' ').trim()].filter(Boolean)
  const value = parts.join(' · ')
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/**
 * The classes as site classes for the Classes box suggestions and the AI's tokens: the editable
 * classes first, then the code classes (`@utility` in the site's CSS) that no editable class replaces.
 */
export function mergeSiteClasses(classes: readonly BuilderClass[], code: readonly SiteClass[] | undefined): SiteClass[] {
  const own = classes.map((item): SiteClass => ({
    name: item.name,
    ...(item.label ? { label: item.label } : {}),
    ...(item.group ? { group: item.group } : {}),
    css: classPreview(item),
  }))
  const names = new Set(own.map((c) => c.name))
  return [...own, ...(code ?? []).filter((c) => !names.has(c.name))]
}

/** "1 block", "3 blocks". */
export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** "changes 12 blocks on 3 pages", "is not used yet". */
export function usageText(usage: ClassUsage | null | undefined): string {
  if (!usage || usage.blocks === 0) return 'is not used on any page yet'
  return `changes ${plural(usage.blocks, 'block')} on ${plural(usage.documents.length, 'page')}`
}

// ---------------------------------------------------------------------------------------------
// Import from the site's CSS

/** One `@utility` rule of the site's CSS with its full body (see `siteClassRules` in css/tokens.ts). */
export type SiteClassRule = { name: string; label?: string; group?: string; body: string }

/** The data of a class made from a code `@utility` rule: `@apply` lists become `styles`, everything else `css`. */
export type ImportedClass = { name: string; label: string | null; group: string | null; styles: string | null; css: string | null }

/** Top-level statements of a rule body, comments removed, nested blocks kept whole. */
function statements(body: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  const css = body.replace(/\/\*[^]*?\*\//g, '')
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      const end = closingQuote(css, i)
      i = end === -1 ? css.length : end
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push(css.slice(start, i + 1).trim())
        start = i + 1
      }
    } else if (ch === ';' && depth === 0) {
      out.push(css.slice(start, i + 1).trim())
      start = i + 1
    }
  }
  const rest = css.slice(start).trim()
  if (rest) out.push(rest.endsWith(';') ? rest : `${rest};`)
  return out.filter(Boolean)
}

/** Re-indents a rule body for the custom CSS box: two spaces per level. */
function indent(statement: string): string {
  let depth = 0
  return statement
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('}')) depth = Math.max(0, depth - 1)
      const out = `${'  '.repeat(depth)}${line}`
      depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0) + (line.startsWith('}') ? 1 : 0)
      depth = Math.max(0, depth)
      return out
    })
    .join('\n')
}

/**
 * Converts a code `@utility` rule into class data. `@apply a b;` statements (without `!important`)
 * become `styles`; declarations, nested rules and anything else stay as `css`, in their order.
 */
export function importSiteClass(rule: SiteClassRule): ImportedClass {
  const styles: string[] = []
  const css: string[] = []
  for (const statement of statements(rule.body)) {
    const apply = /^@apply\s+([^;{}]+?);$/.exec(statement)
    if (apply && !/!important/.test(apply[1]!)) {
      for (const token of classTokens(apply[1])) if (!styles.includes(token)) styles.push(token)
      continue
    }
    css.push(indent(statement))
  }
  return {
    name: rule.name,
    label: rule.label?.trim() || null,
    group: rule.group?.trim() || null,
    styles: styles.join(' ') || null,
    css: css.join('\n') || null,
  }
}

// Localization of block props (docs/architecture.md, "Localization").
//
// One layout structure for every locale; only localized props differ. `block.props` holds the
// default locale's values, `block.locales[code]` holds the other locales' own values of localized
// props (a prop whose Payload field config says `localized: true`, or holds such a field). The
// structure (blocks, order, slots), classes, bindings and props that are not localized are shared.
// A missing value falls back the way Payload's `fallback` / `fallbackLocale` say.
//
// Pure: no React, no Payload runtime imports.

import { getBlockDefinition } from './blocks'
import { sameJson } from './fieldSemantics'
import { dataFields, fieldBlocks, textOf, type DataField } from './fields'
import { applyOperation } from './operations'
import { findBlock, isPlainObject } from './tree'
import type { Block, BlockDefinition, BlockProps, Layout, LocaleSettings, Operation } from './types'

export type { LocaleSettings } from './types'

/** Payload's `fallbackLocale` of a request: a code, a list of codes, `false` (no fallback), or unset (the config decides). */
export type FallbackLocale = string | string[] | false | null | undefined

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Reads Payload's `localization` config (raw or sanitized). `null` when localization is off.
 * Locales may be codes or `{ code, label, fallbackLocale }` objects.
 */
export function localeSettingsOf(localization: unknown): LocaleSettings | null {
  if (!isPlainObject(localization) || !Array.isArray(localization.locales)) return null
  const locales: string[] = []
  const labels: Record<string, string> = {}
  const fallbacks: Record<string, string | string[]> = {}
  for (const entry of localization.locales) {
    if (typeof entry === 'string' && entry) {
      locales.push(entry)
      continue
    }
    if (!isPlainObject(entry) || typeof entry.code !== 'string' || !entry.code) continue
    locales.push(entry.code)
    const label = textOf(entry.label)
    if (label) labels[entry.code] = label
    const own = entry.fallbackLocale
    if (typeof own === 'string' && own) fallbacks[entry.code] = own
    else if (Array.isArray(own)) {
      const list = own.filter((code): code is string => typeof code === 'string' && code !== '')
      if (list.length > 0) fallbacks[entry.code] = list
    }
  }
  if (locales.length === 0) return null
  const defaultLocale = typeof localization.defaultLocale === 'string' && locales.includes(localization.defaultLocale) ? localization.defaultLocale : locales[0]
  return {
    locales,
    defaultLocale,
    // Payload's default is true.
    fallback: localization.fallback !== false,
    ...(Object.keys(fallbacks).length > 0 ? { fallbacks } : {}),
    ...(Object.keys(labels).length > 0 ? { labels } : {}),
  }
}

/** The locale's name for people: its label, else the code in capitals ("DE"). */
export function localeLabel(settings: LocaleSettings | null | undefined, code: string): string {
  return settings?.labels?.[code] ?? code.toUpperCase()
}

/** A known locale code, or the default locale (Payload uses the default for unknown codes). */
export function knownLocale(settings: LocaleSettings, locale: string | null | undefined): string {
  return locale && settings.locales.includes(locale) ? locale : settings.defaultLocale
}

/**
 * The locales a value missing in `locale` falls back to, in order (Payload's `fallbackLocale`).
 * `requested` is the request's fallback; unset means the config's: the locale's own
 * `fallbackLocale`, else the default locale, and none when `fallback` is off.
 */
export function fallbackChain(settings: LocaleSettings, locale: string, requested?: FallbackLocale): string[] {
  let chain: string[]
  if (requested === false) chain = []
  else if (Array.isArray(requested)) chain = requested
  else if (typeof requested === 'string' && requested) {
    chain = ['false', 'none', 'null'].includes(requested) ? [] : [requested]
  } else if (!settings.fallback) chain = []
  else {
    const own = settings.fallbacks?.[locale]
    chain = own === undefined ? [settings.defaultLocale] : Array.isArray(own) ? own : [own]
  }
  return chain.filter((code) => code !== locale && settings.locales.includes(code))
}

// ---------------------------------------------------------------------------
// Which props are localized
// ---------------------------------------------------------------------------

function containsLocalized(field: DataField): boolean {
  if ((field as { localized?: unknown }).localized === true) return true
  if (field.type === 'group' || field.type === 'array') return dataFields(field.fields).some(containsLocalized)
  if (field.type === 'blocks') return fieldBlocks(field).some((b) => dataFields(b.fields).some(containsLocalized))
  return false
}

const keyCache = new WeakMap<BlockDefinition, ReadonlySet<string>>()
const NO_KEYS: ReadonlySet<string> = new Set()

/**
 * The block's localized props: top-level props whose field says `localized: true`, or holds such a
 * field (a group or an array with a localized field inside is localized as a whole).
 */
export function localizedKeys(def: BlockDefinition | undefined): ReadonlySet<string> {
  if (!def) return NO_KEYS
  let keys = keyCache.get(def)
  if (!keys) {
    keys = new Set(dataFields(def.fields as unknown[]).filter(containsLocalized).map((f) => f.name))
    keyCache.set(def, keys)
  }
  return keys
}

/** True when any block has a localized prop. */
export function hasLocalizedProps(blocks: readonly BlockDefinition[]): boolean {
  return blocks.some((def) => localizedKeys(def).size > 0)
}

// ---------------------------------------------------------------------------
// Reading values
// ---------------------------------------------------------------------------

/** True when the block has its own value of `key` in `locale` (the default locale's value lives in `props`). */
export function hasOwnValue(block: Block, key: string, locale: string, defaultLocale: string): boolean {
  const own = locale === defaultLocale ? block.props : block.locales?.[locale]
  return own !== undefined && Object.hasOwn(own, key)
}

/** The block's own value of `key` in `locale`, without fallback. */
export function ownValue(block: Block, key: string, locale: string, defaultLocale: string): unknown {
  return locale === defaultLocale ? block.props?.[key] : block.locales?.[locale]?.[key]
}

const isMissing = (value: unknown) => value === undefined || value === null

/** Payload's afterRead rule: text and textarea fall back when empty too; other types only when missing. */
function fallsBack(field: DataField | undefined, value: unknown): boolean {
  if (isMissing(value)) return true
  return value === '' && (field?.type === 'text' || field?.type === 'textarea')
}

const fieldCache = new WeakMap<BlockDefinition, Map<string, DataField>>()

function fieldOf(def: BlockDefinition, key: string): DataField | undefined {
  let map = fieldCache.get(def)
  if (!map) {
    map = new Map(dataFields(def.fields as unknown[]).map((f) => [f.name, f]))
    fieldCache.set(def, map)
  }
  return map.get(key)
}

/** The value of a localized prop in `locale`, with fallback (Payload's afterRead hoisting). */
export function localizedValue(block: Block, def: BlockDefinition, key: string, locale: string, chain: readonly string[], settings: LocaleSettings): unknown {
  const value = ownValue(block, key, locale, settings.defaultLocale)
  const field = fieldOf(def, key)
  if (chain.length === 0 || !fallsBack(field, value)) return value
  for (const code of chain) {
    const candidate = ownValue(block, key, code, settings.defaultLocale)
    if (!isMissing(candidate) && candidate !== '') return candidate
  }
  return value
}

/** The block's props in `locale`: shared props plus the localized props with fallback. Same object when nothing differs. */
function propsIn(block: Block, def: BlockDefinition | undefined, locale: string, chain: readonly string[], settings: LocaleSettings): BlockProps | undefined {
  const keys = localizedKeys(def)
  if (!def || keys.size === 0 || locale === settings.defaultLocale) return block.props
  let next: Record<string, unknown> | null = null
  for (const key of keys) {
    const value = localizedValue(block, def, key, locale, chain, settings)
    const current = block.props?.[key]
    if (value === current && (value !== undefined || !block.props || !Object.hasOwn(block.props, key))) continue
    next ??= { ...block.props }
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  if (!next) return block.props
  return Object.keys(next).length > 0 ? next : undefined
}

/** One block in `locale`, without `locales`. Children through `child`. Same object when nothing differs. */
function resolveBlock(block: Block, ctx: ResolveCtx, child: (b: Block) => Block): Block {
  const def = getBlockDefinition(ctx.blocks, block.type)
  const props = propsIn(block, def, ctx.locale, ctx.chain, ctx.settings)
  let slots = block.slots
  if (block.slots) {
    let changed = false
    const next: Record<string, Block[]> = {}
    for (const [name, list] of Object.entries(block.slots)) {
      const mapped = list.map(child)
      if (mapped.some((b, i) => b !== list[i])) changed = true
      next[name] = mapped
    }
    if (changed) slots = next
  }
  if (props === block.props && slots === block.slots && block.locales === undefined) return block
  const { locales: _locales, props: _props, slots: _slots, ...rest } = block
  const out: Block = { ...rest }
  if (props) out.props = props
  if (slots) out.slots = slots
  return out
}

type ResolveCtx = { blocks: readonly BlockDefinition[]; settings: LocaleSettings; locale: string; chain: readonly string[] }

/**
 * The layout as readers in `locale` see it (Payload's read with `locale` and `fallbackLocale`):
 * localized props hold the locale's values with fallback, and no block has `locales`. Blocks
 * that do not change keep their identity. Never mutates.
 */
export function resolveLayoutLocale(
  layout: Layout,
  blocks: readonly BlockDefinition[],
  settings: LocaleSettings,
  locale: string,
  fallback?: FallbackLocale,
): Layout {
  const code = knownLocale(settings, locale)
  const ctx: ResolveCtx = { blocks, settings, locale: code, chain: fallbackChain(settings, code, fallback) }
  const visit = (block: Block): Block => resolveBlock(block, ctx, visit)
  const list = layout.blocks.map(visit)
  return list.some((b, i) => b !== layout.blocks[i]) ? { ...layout, blocks: list } : layout
}

/**
 * A cached `resolveLayoutLocale` for the editor: each stored block object maps to one resolved
 * object per locale, so unchanged blocks keep their identity across edits (the canvas and React
 * reuse them).
 */
export function createLocaleView(blocks: readonly BlockDefinition[], settings: LocaleSettings) {
  const caches = new Map<string, WeakMap<Block, Block>>()
  return (layout: Layout, locale: string): Layout => {
    const code = knownLocale(settings, locale)
    let cache = caches.get(code)
    if (!cache) caches.set(code, (cache = new WeakMap()))
    const map = cache
    const ctx: ResolveCtx = { blocks, settings, locale: code, chain: fallbackChain(settings, code) }
    const visit = (block: Block): Block => {
      const hit = map.get(block)
      if (hit) return hit
      const out = resolveBlock(block, ctx, visit)
      map.set(block, out)
      return out
    }
    const list = layout.blocks.map(visit)
    return list.some((b, i) => b !== layout.blocks[i]) ? { ...layout, blocks: list } : layout
  }
}

/**
 * The localized props of a block that show another locale's value in `locale` (no own value, and
 * the fallback has one). The editor marks them "Not translated". Empty for the default locale.
 */
export function untranslatedKeys(block: Block, blocks: readonly BlockDefinition[], settings: LocaleSettings, locale: string): string[] {
  if (locale === settings.defaultLocale) return []
  const def = getBlockDefinition(blocks, block.type)
  const out: string[] = []
  const chain = fallbackChain(settings, locale)
  for (const key of localizedKeys(def)) {
    const own = ownValue(block, key, locale, settings.defaultLocale)
    if (!fallsBack(fieldOf(def as BlockDefinition, key), own)) continue
    if (chain.some((code) => !isEmptyValue(ownValue(block, key, code, settings.defaultLocale)))) out.push(key)
  }
  return out
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

/**
 * The localized props of a block that the default locale does not have (empty or missing) while
 * another locale has its own value: a block written in another language first. The editor marks
 * them "Missing in English"; publishing needs them when they are required.
 */
export function missingDefaultKeys(block: Block, blocks: readonly BlockDefinition[], settings: LocaleSettings): string[] {
  if (!block.locales) return []
  const def = getBlockDefinition(blocks, block.type)
  const out: string[] = []
  for (const key of localizedKeys(def)) {
    if (!isEmptyValue(block.props?.[key])) continue
    if (localeWithValue(block, key, settings) !== null) out.push(key)
  }
  return out
}

/** The first locale (in the config's order, not the default) with its own value of `key`, or null. */
export function localeWithValue(block: Block, key: string, settings: LocaleSettings): string | null {
  for (const code of settings.locales) {
    if (code === settings.defaultLocale) continue
    if (!isEmptyValue(block.locales?.[code]?.[key])) return code
  }
  return null
}

/** Locale codes that hold values anywhere in the layout. */
export function localesIn(layout: Layout | null | undefined): string[] {
  const found = new Set<string>()
  const visit = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.locales) for (const code of Object.keys(block.locales)) found.add(code)
      for (const children of Object.values(block.slots ?? {})) visit(children)
    }
  }
  if (layout && Array.isArray(layout.blocks)) visit(layout.blocks)
  return [...found]
}

function anyLocales(list: readonly unknown[]): boolean {
  return list.some(
    (b) => isPlainObject(b) && (b.locales !== undefined || (isPlainObject(b.slots) && Object.values(b.slots).some((c) => Array.isArray(c) && anyLocales(c)))),
  )
}

/** True when any block of the layout has `locales` (the stored form with translations). */
export function hasLocaleValues(layout: Layout | null | undefined): boolean {
  if (!layout || !Array.isArray(layout.blocks)) return false
  return anyLocales(layout.blocks)
}

// ---------------------------------------------------------------------------
// Per-locale views for field logic (hooks, validate, access)
// ---------------------------------------------------------------------------

type Pair = { raw: Block; view: Block; start: Record<string, unknown> }

/**
 * A copy of the layout for one non-default locale: every block's props are its default props
 * with the locale's own values over them. Field logic runs on `view`; `commit()` writes the
 * localized props it replaced back into `block.locales[locale]` of the original layout (in place).
 * Values the logic changed inside an own value change the original directly (they share objects).
 */
export function localeOverlay(layout: Layout, locale: string, blocks: readonly BlockDefinition[]) {
  const pairs: Pair[] = []
  const copy = (list: Block[]): Block[] =>
    list.map((raw) => {
      const own = raw.locales?.[locale]
      const props = own ? { ...raw.props, ...own } : { ...raw.props }
      const view: Block = { ...raw, props }
      if (raw.slots) view.slots = Object.fromEntries(Object.entries(raw.slots).map(([name, children]) => [name, copy(children)]))
      pairs.push({ raw, view, start: { ...props } })
      return view
    })
  const view: Layout = { ...layout, blocks: copy(layout.blocks) }
  return {
    view,
    /** Writes back the localized props whose value the field logic replaced or removed. */
    commit(): boolean {
      let changed = false
      for (const { raw, view: block, start } of pairs) {
        const keys = localizedKeys(getBlockDefinition(blocks, raw.type))
        const props = block.props ?? {}
        for (const key of keys) {
          if (props[key] === start[key]) continue
          setLocaleValue(raw, locale, key, props[key])
          changed = true
        }
      }
      return changed
    },
  }
}

/** Sets (or with `undefined` removes) one own value of a locale, keeping the canonical form. In place. */
function setLocaleValue(block: Block, locale: string, key: string, value: unknown): void {
  const locales: Record<string, BlockProps> = { ...block.locales }
  const own: Record<string, unknown> = { ...locales[locale] }
  if (value === undefined) delete own[key]
  else own[key] = value
  if (Object.keys(own).length > 0) locales[locale] = own
  else delete locales[locale]
  if (Object.keys(locales).length > 0) block.locales = locales
  else delete block.locales
}

/**
 * The scope of one locale pass: a top-level prop takes part when it is localized and has an own
 * value in the locale, in `layout` or in `before`.
 */
export function localeScope(blocks: readonly BlockDefinition[], locale: string, layout: Layout, before?: Layout | null) {
  const own = new Map<string, Set<string>>()
  const visit = (list: readonly Block[]) => {
    for (const block of list) {
      const values = block.locales?.[locale]
      if (values) {
        const keys = localizedKeys(getBlockDefinition(blocks, block.type))
        let set = own.get(block.id)
        for (const key of Object.keys(values)) {
          if (!keys.has(key)) continue
          if (!set) own.set(block.id, (set = new Set()))
          set.add(key)
        }
      }
      for (const children of Object.values(block.slots ?? {})) visit(children)
    }
  }
  for (const l of [layout, before]) if (l && Array.isArray(l.blocks)) visit(l.blocks)
  return (block: Block, key: string) => own.get(block.id)?.has(key) === true
}

/** Locales other than the default that have values in either layout. */
export function overlayLocales(layout: Layout, before: Layout | null | undefined, settings: LocaleSettings | null | undefined): string[] {
  const codes = new Set([...localesIn(layout), ...localesIn(before)])
  if (settings) codes.delete(settings.defaultLocale)
  return [...codes]
}

/** One locale pass of field logic (see `eachLocalePass`). */
export type LocalePass = {
  locale: string
  /** The layout in this locale: own values over the default props. Changes to localized props are written back. */
  view: Layout
  /** The previous layout in this locale, or null. */
  before: Layout | null
  /** `walkPropFields({ only })`: the localized props with an own value in this locale (now or before). */
  only: (block: Block, name: string) => boolean
}

/**
 * Runs field logic (hooks, validate, access) once for each locale other than the default that
 * has own values in `layout` or `before`, as Payload runs field logic per locale. The default
 * locale's pass is the caller's normal run on `layout`. Returns true when a pass changed a value.
 */
export async function eachLocalePass(
  layout: Layout,
  options: { blocks: readonly BlockDefinition[]; localization?: LocaleSettings | null; before?: Layout | null },
  run: (pass: LocalePass) => Promise<void> | void,
): Promise<boolean> {
  let changed = false
  for (const locale of overlayLocales(layout, options.before, options.localization)) {
    const overlay = localeOverlay(layout, locale, options.blocks)
    const before = options.before ? localeOverlay(options.before, locale, options.blocks).view : null
    await run({ locale, view: overlay.view, before, only: localeScope(options.blocks, locale, layout, options.before) })
    if (overlay.commit()) changed = true
  }
  return changed
}

/**
 * A request object for field logic of one locale: Payload's `req` with `locale` set. Reads fall
 * through to the real request (prototype), so transactions and the user stay the same.
 */
export function requestInLocale<T>(req: T, locale: string): T {
  if (!req || typeof req !== 'object') return req
  return Object.create(req as object, { locale: { value: locale, enumerable: true, writable: true } }) as T
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

type UpdateOp = Extract<Operation, { type: 'update' }>

/**
 * Sets `locale` on `update` operations that change props and name no locale. For edits made in a
 * locale (the editor's locale switcher, MCP tools with `locale`). The default locale sets nothing.
 * `inserts`: `insert` operations without a locale get it too: their blocks are new content written
 * in that locale (an AI that works in German writes German). Leave it off for copies (paste,
 * duplicate, sections), which keep their own locale data.
 */
export function stampLocale(
  ops: readonly Operation[],
  locale: string | null | undefined,
  settings: LocaleSettings | null | undefined,
  options?: { inserts?: boolean },
): Operation[] {
  if (!locale || !settings || locale === settings.defaultLocale) return [...ops]
  return ops.map((op) => {
    if (!isPlainObject(op) || 'locale' in op) return op
    if (op.type === 'insert') return options?.inserts ? { ...op, locale } : op
    if (op.type !== 'update') return op
    if (op.props === undefined && op.unsetProps === undefined) return op
    return { ...op, locale }
  })
}

/**
 * The block as new content written in `locale` (not the default), in the stored form: its
 * localized props move from `props` to `locales[locale]`; shared props stay in `props`. The
 * default locale gets no values, so it shows the block empty until someone writes it there. Only
 * this block, not the blocks inside it (`blockInLocale` does those too). Never mutates.
 */
function ownBlockInLocale(block: Block, locale: string, blocks: readonly BlockDefinition[]): Block {
  const keys = localizedKeys(getBlockDefinition(blocks, block.type))
  if (keys.size === 0 || !isPlainObject(block.props)) return block
  const shared: Record<string, unknown> = {}
  const own: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(block.props)) {
    if (value === undefined) continue
    if (keys.has(key)) own[key] = value
    else shared[key] = value
  }
  if (Object.keys(own).length === 0) return block
  const { props: _props, ...rest } = block
  const out: Block = { ...rest, locales: { [locale]: own } }
  if (Object.keys(shared).length > 0) out.props = shared
  return out
}

/** `ownBlockInLocale` for the block and every block inside it. */
export function blockInLocale(block: Block, locale: string, blocks: readonly BlockDefinition[]): Block {
  const out = ownBlockInLocale(block, locale, blocks)
  if (!block.slots) return out
  const slots = Object.fromEntries(Object.entries(block.slots).map(([name, list]) => [name, list.map((b) => blockInLocale(b, locale, blocks))]))
  return { ...out, slots }
}

type Localized = { ok: true; ops: Operation[] } | { ok: false; error: string }

/** An `update` or `insert` that names its locale. */
const namesLocale = (op: unknown) => isPlainObject(op) && (op.type === 'update' || op.type === 'insert') && op.locale !== undefined

/**
 * Puts the locale of `update` operations in canonical form, against the layout as the operations
 * change it: an unknown locale is refused, the default locale is dropped (its values live in
 * `props`), and props that are not localized move to an operation without a locale (they are
 * shared by every locale). The editor and the server run the same function, so both apply the same
 * operations. Operations without `locale` pass unchanged.
 */
export function localizeOperations(
  layout: Layout,
  ops: readonly unknown[],
  blocks: readonly BlockDefinition[],
  settings: LocaleSettings | null | undefined,
): Localized {
  if (!Array.isArray(ops)) return { ok: true, ops: ops as Operation[] }
  if (!ops.some(namesLocale)) return { ok: true, ops: ops as Operation[] }
  let current = layout
  let tracking = true
  const out: Operation[] = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] as Operation
    let produced: Operation[] = [op]
    if (isPlainObject(op) && op.type === 'update' && op.locale !== undefined) {
      const split = splitUpdate(current, op, blocks, settings)
      if (typeof split === 'string') return { ok: false, error: `Operation ${i} (update): ${split}` }
      produced = split
    } else if (isPlainObject(op) && op.type === 'insert' && op.locale !== undefined) {
      const placed = insertInLocale(op, blocks, settings)
      if (typeof placed === 'string') return { ok: false, error: `Operation ${i} (insert): ${placed}` }
      produced = [placed]
    }
    for (const item of produced) {
      out.push(item)
      if (!tracking) continue
      const result = applyOperation(current, item)
      // The real apply reports the error; later operations stay as they are.
      if (result.ok) current = result.layout
      else tracking = false
    }
  }
  return { ok: true, ops: out }
}

/** Why an operation's `locale` cannot be used, or null. */
function localeProblem(locale: unknown, settings: LocaleSettings | null | undefined): string | null {
  if (typeof locale !== 'string' || locale === '') return '`locale` must be a locale code'
  if (!settings) return 'This document has no locales. Leave out `locale`.'
  if (!settings.locales.includes(locale)) return `Unknown locale "${locale}". Use one of: ${settings.locales.join(', ')}`
  return null
}

type InsertOp = Extract<Operation, { type: 'insert' }>

/**
 * An insert of new content written in a locale, as an insert without `locale`: the localized props
 * of its blocks go to that locale (`blockInLocale`). The default locale's content stays in
 * `props`, and content that already has `locales` (the stored form) stays as it is.
 */
function insertInLocale(op: InsertOp, blocks: readonly BlockDefinition[], settings: LocaleSettings | null | undefined): Operation | string {
  const { locale, ...rest } = op
  const problem = localeProblem(locale, settings)
  if (problem || !settings || !locale) return problem ?? '`locale` must be a locale code'
  if (locale === settings.defaultLocale || !isPlainObject(op.block) || anyLocales([op.block])) return rest
  return { ...rest, block: blockInLocale(op.block, locale, blocks) }
}

function splitUpdate(layout: Layout, op: UpdateOp, blocks: readonly BlockDefinition[], settings: LocaleSettings | null | undefined): Operation[] | string {
  const { locale, ...rest } = op
  const problem = localeProblem(locale, settings)
  if (problem || !settings || !locale) return problem ?? '`locale` must be a locale code'
  if (locale === settings.defaultLocale) return [rest]
  const block = typeof op.id === 'string' ? findBlock(layout, op.id) : null
  // A missing block fails in the real apply, with its usual message.
  if (!block) return [op]
  const keys = localizedKeys(getBlockDefinition(blocks, block.type))
  const sharedProps: Record<string, unknown> = {}
  const localProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(isPlainObject(op.props) ? op.props : {})) {
    if (keys.has(key)) localProps[key] = value
    else sharedProps[key] = value
  }
  const unset = Array.isArray(op.unsetProps) ? op.unsetProps : []
  const sharedUnset = unset.filter((key) => !keys.has(key))
  const localUnset = unset.filter((key) => keys.has(key))

  const { props: _props, unsetProps: _unset, ...other } = rest
  const shared: UpdateOp = { ...other }
  if (Object.keys(sharedProps).length > 0) shared.props = sharedProps
  if (sharedUnset.length > 0) shared.unsetProps = sharedUnset
  const local: UpdateOp = { type: 'update', id: op.id, locale }
  if (Object.keys(localProps).length > 0) local.props = localProps
  if (localUnset.length > 0) local.unsetProps = localUnset

  const out: Operation[] = []
  if (Object.keys(shared).some((key) => key !== 'type' && key !== 'id')) out.push(shared)
  if (local.props || local.unsetProps) out.push(local)
  return out.length > 0 ? out : [shared]
}

// ---------------------------------------------------------------------------
// Saves through the API in one locale
// ---------------------------------------------------------------------------

/**
 * A layout an API client read in `locale` and sends back (REST, the Local API, the Edit view's
 * JSON field), merged into the stored layout, the way Payload saves localized fields: the
 * structure and the shared props come from `incoming`, the localized props go to `locale`, and the
 * other locales keep their stored values.
 *
 * A value that equals what the reader saw as a fallback (no own value before) stays a fallback, so
 * reading and saving a page in German does not copy the English text into German. A new block's
 * localized values go to `locale` (like a block added in the editor in that locale). Returns `incoming`
 * unchanged when it already has `locales` (it is the stored form, for example from `locale=all`).
 */
export function mergeLocaleView(
  stored: Layout | null | undefined,
  incoming: Layout,
  locale: string,
  blocks: readonly BlockDefinition[],
  settings: LocaleSettings,
): Layout {
  if (hasLocaleValues(incoming)) return incoming
  const code = knownLocale(settings, locale)
  const before = new Map<string, Block>()
  if (stored) {
    const visit = (list: readonly Block[]) => {
      for (const block of list) {
        before.set(block.id, block)
        for (const children of Object.values(block.slots ?? {})) visit(children)
      }
    }
    visit(stored.blocks)
  }
  const chain = fallbackChain(settings, code)
  const merge = (block: Block): Block => {
    const old = before.get(block.id)
    const out: Block = { ...block }
    if (block.slots) out.slots = Object.fromEntries(Object.entries(block.slots).map(([name, list]) => [name, list.map(merge)]))
    // A new block: its text is written in this locale, as when the editor adds one there.
    if (!old || old.type !== block.type) return code === settings.defaultLocale ? out : ownBlockInLocale(out, code, blocks)
    if (old.locales) out.locales = structuredClone(old.locales)
    if (code === settings.defaultLocale) return out
    const def = getBlockDefinition(blocks, block.type)
    const keys = localizedKeys(def)
    if (!def || keys.size === 0) return out
    const props: Record<string, unknown> = { ...block.props }
    for (const key of keys) {
      const value = props[key]
      // The default locale's value stays as stored.
      if (old.props && Object.hasOwn(old.props, key)) props[key] = old.props[key]
      else delete props[key]
      const hadOwn = hasOwnValue(old, key, code, settings.defaultLocale)
      const seen = localizedValue(old, def, key, code, chain, settings)
      if (value === undefined || (!hadOwn && sameJson(value, seen))) {
        if (hadOwn) setLocaleValue(out, code, key, undefined)
        continue
      }
      setLocaleValue(out, code, key, value)
    }
    if (Object.keys(props).length > 0) out.props = props
    else delete out.props
    return out
  }
  return { ...incoming, blocks: incoming.blocks.map(merge) }
}

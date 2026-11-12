// The compiled stylesheet of the published classes: one site-wide sheet, stored in a hidden global
// with a hash of its CSS. The classes collection's hooks compile it again after every publish,
// unpublish and delete; the site loads it once per request (`ClassesStyle`) and the browser caches
// it by its hashed URL. Server-only.

import { createHash } from 'node:crypto'
import type { GlobalConfig, Payload, PayloadRequest } from 'payload'

import { compileClassesSheet, cssInputKey } from '../css'
import { withThemeVariables } from '../theme/server'
import { classesConfigOf, type ClassesServerConfig } from './config'
import { toBuilderClass, type BuilderClass } from './shared'

/** The stored stylesheet. `input`: the key of the CSS input it was compiled from (`cssInputKey`). */
export type StoredClassSheet = { hash: string; css: string; names: string[]; errors: Record<string, string>; input: string }

const EMPTY: StoredClassSheet = { hash: '', css: '', names: [], errors: {}, input: '' }

/** The hidden global. Only the plugin reads and writes it (access off, `overrideAccess` in the plugin). */
export function classesSheetGlobal(slug: string): GlobalConfig {
  return {
    slug,
    label: 'Classes stylesheet',
    versions: false,
    authorship: false,
    admin: { hidden: true },
    access: { read: () => false, update: () => false },
    fields: [
      { name: 'hash', type: 'text' },
      { name: 'css', type: 'textarea' },
      { name: 'names', type: 'json' },
      { name: 'errors', type: 'json' },
      { name: 'input', type: 'text' },
    ],
  }
}

const hashOf = (css: string) => createHash('sha256').update(css).digest('hex').slice(0, 16)

function asSheet(value: unknown): StoredClassSheet {
  const doc = (value ?? {}) as Record<string, unknown>
  return {
    hash: typeof doc.hash === 'string' ? doc.hash : '',
    css: typeof doc.css === 'string' ? doc.css : '',
    names: Array.isArray(doc.names) ? doc.names.filter((n): n is string => typeof n === 'string') : [],
    errors: doc.errors && typeof doc.errors === 'object' && !Array.isArray(doc.errors) ? (doc.errors as Record<string, string>) : {},
    input: typeof doc.input === 'string' ? doc.input : '',
  }
}

/** The published classes (the main documents with `_status: published`). */
export async function publishedClasses(payload: Payload, config: ClassesServerConfig, req?: PayloadRequest): Promise<BuilderClass[]> {
  const result = await payload.find({
    collection: config.slug as never,
    depth: 0,
    pagination: false,
    where: { _status: { equals: 'published' } },
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  return (result.docs as unknown as Record<string, unknown>[]).flatMap((doc) => toBuilderClass(doc) ?? [])
}

/** Compiles the published classes. */
export async function compilePublishedSheet(payload: Payload, config: ClassesServerConfig, req?: PayloadRequest): Promise<StoredClassSheet> {
  const classes = await publishedClasses(payload, config, req)
  // The theme's variables work inside classes too (`bg-brand` in a class's styles).
  const css = await withThemeVariables(payload, config.css)
  const [sheet, input] = await Promise.all([compileClassesSheet(classes, css), cssInputKey(css)])
  return { hash: sheet.css ? hashOf(sheet.css) : '', css: sheet.css, names: sheet.names, errors: sheet.errors, input }
}

/** Names of the stored sheet per Payload instance, for page compiles in the save hook. */
const namesCache = new WeakMap<object, { names: string[]; at: number }>()
const NAMES_TTL_MS = 10_000

function remember(payload: Payload, sheet: StoredClassSheet) {
  namesCache.set(payload, { names: sheet.names, at: Date.now() })
}

/**
 * Compiles the published classes and stores the stylesheet when it changed. Runs in the classes
 * collection's hooks with their `req` (same transaction). Returns the stored sheet.
 */
export async function storeClassesSheet(payload: Payload, req?: PayloadRequest): Promise<(StoredClassSheet & { changed: boolean }) | null> {
  const config = classesConfigOf(payload)
  if (!config) return null
  const sheet = await compilePublishedSheet(payload, config, req)
  const current = asSheet(await payload.findGlobal({ slug: config.sheetSlug as never, depth: 0, overrideAccess: true, ...(req ? { req } : {}) }).catch(() => null))
  const same = current.hash === sheet.hash && current.input === sheet.input && current.names.join(' ') === sheet.names.join(' ')
  if (!same) {
    await payload.updateGlobal({ slug: config.sheetSlug as never, data: sheet as never, depth: 0, overrideAccess: true, ...(req ? { req } : {}) })
  }
  remember(payload, sheet)
  if (!same) for (const [name, error] of Object.entries(sheet.errors)) payload.logger.warn(`[websiteBuilder] Class "${name}": ${error}`)
  return { ...sheet, changed: !same }
}

/** One recompile at a time per Payload instance (a deploy with a new CSS entry: the first request compiles). */
const refreshing = new WeakMap<object, Promise<StoredClassSheet | null>>()

/**
 * The stored stylesheet for the site. Compiles it again when the site's CSS input changed since it
 * was stored (a deploy with new theme tokens) or when it was never stored. `null` without classes.
 */
export async function loadClassesSheet(payload: Payload): Promise<StoredClassSheet | null> {
  const config = classesConfigOf(payload)
  if (!config) return null
  const stored = asSheet(await payload.findGlobal({ slug: config.sheetSlug as never, depth: 0, overrideAccess: true }).catch(() => EMPTY))
  // A CSS entry that cannot be read cannot compile either: keep the stored sheet.
  const input = await withThemeVariables(payload, config.css)
    .then(cssInputKey)
    .catch(() => null)
  if (input === null || (stored.input && stored.input === input)) {
    remember(payload, stored)
    return stored
  }
  let pending = refreshing.get(payload)
  if (!pending) {
    pending = storeClassesSheet(payload).catch((error: unknown) => {
      payload.logger.error({ err: error, msg: '[websiteBuilder] The classes stylesheet failed to compile. Using the stored one.' })
      return stored
    })
    refreshing.set(payload, pending)
    void pending.finally(() => refreshing.delete(payload))
  }
  return pending
}

/**
 * Names the classes stylesheet styles (published class names and former names). Page compiles
 * leave them out. Cached for 10 s per process; a save of the sheet in this process updates it at once.
 */
export async function classNamesFor(payload: Payload): Promise<string[]> {
  if (!classesConfigOf(payload)) return []
  const cached = namesCache.get(payload)
  if (cached && Date.now() - cached.at < NAMES_TTL_MS) return cached.names
  const sheet = await loadClassesSheet(payload).catch(() => null)
  return sheet?.names ?? []
}

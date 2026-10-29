// Editable classes: a plugin collection of named classes (Tailwind classes plus custom CSS) that
// blocks use by name. Server entry. See the README section "Editable classes".

import type { CollectionConfig, Endpoint, GlobalConfig } from 'payload'

import type { BlockDefinition } from '../core/types'
import type { CssOptions } from '../css'
import { publishClassesWithPage } from './actions'
import { classesCollection } from './collection'
import type { ClassesOptions, ClassesServerConfig } from './config'
import { classesEndpoints } from './endpoints'
import { classesSheetGlobal } from './sheet'
import { CLASSES_PATH, CLASSES_SHEET_PATH, DEFAULT_CLASSES_SHEET_SLUG, DEFAULT_CLASSES_SLUG, type ClassesClientConfig } from './shared'

export * from './shared'
export { classesConfigOf, type ClassesOptions, type ClassesServerConfig } from './config'
export { classesCollection, SKIP_CLASSES_SHEET_CONTEXT } from './collection'
export { classesEndpoints } from './endpoints'
export { classNamesFor, classesSheetGlobal, compilePublishedSheet, loadClassesSheet, storeClassesSheet, type StoredClassSheet } from './sheet'
export { classUsage, countClassUses, replaceClassInLayouts, replaceClassOps, type ReplaceResult } from './usage'
export {
  deleteClass,
  errorMessage,
  findClass,
  importSiteClasses,
  loadClasses,
  publishClass,
  publishClassesWithPage,
  renameClass,
  upsertClass,
  type ActionResult,
  type ClassInput,
} from './actions'

export type ResolvedClasses = {
  server: ClassesServerConfig
  client: ClassesClientConfig
  collection: CollectionConfig
  global: GlobalConfig
  endpoints: Endpoint[]
  /** Adds the hook that publishes a page's classes with the page (JSON layouts with drafts). */
  withPublish: (collection: CollectionConfig, field: string) => CollectionConfig
}

/**
 * The classes collection, the hidden stylesheet global, the endpoints and the configs, from the
 * plugin's `classes` option (on by default; `false` turns it off). Throws on a slug clash.
 */
export function resolveClasses(
  option: ClassesOptions | boolean | undefined,
  args: { apiRoute: string; css: CssOptions; blocks: BlockDefinition[]; collections: readonly { slug: string }[]; globals: readonly { slug: string }[] },
): ResolvedClasses | null {
  if (option === false) return null
  const options = option === true || option === undefined ? {} : option
  const slug = options.slug ?? DEFAULT_CLASSES_SLUG
  const sheetSlug = options.sheetSlug ?? DEFAULT_CLASSES_SHEET_SLUG
  if (args.collections.some((c) => c.slug === slug)) {
    throw new Error(`[websiteBuilder] A collection named "${slug}" already exists. Set \`classes.slug\` to another name, or \`classes: false\`.`)
  }
  if (args.globals.some((g) => g.slug === sheetSlug)) {
    throw new Error(`[websiteBuilder] A global named "${sheetSlug}" already exists. Set \`classes.sheetSlug\` to another name, or \`classes: false\`.`)
  }
  const endpoint = `${args.apiRoute}${CLASSES_PATH}`
  return {
    server: { slug, sheetSlug, endpoint, sheetPath: `${args.apiRoute}${CLASSES_SHEET_PATH}`, css: args.css, blocks: args.blocks },
    client: { collection: slug, endpoint },
    collection: classesCollection(slug, options),
    global: classesSheetGlobal(sheetSlug),
    endpoints: classesEndpoints(),
    withPublish: (collection, field) =>
      collection.versions && typeof collection.versions === 'object' && collection.versions.drafts
        ? { ...collection, hooks: { ...collection.hooks, afterChange: [...(collection.hooks?.afterChange ?? []), publishClassesWithPage(field)] } }
        : collection,
  }
}

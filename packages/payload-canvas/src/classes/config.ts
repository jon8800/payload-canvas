// Options of the editable classes and the config the plugin stores for the server helpers.
// Type imports only from `payload`: the site helpers import this file.

import type { CollectionConfig } from 'payload'

import type { BlockDefinition } from '../core/types'
import type { CssOptions } from '../css'
import { CLASSES_CONFIG_KEY } from './shared'

export type ClassesOptions = {
  /** Slug of the classes collection. Default "builder-classes". */
  slug?: string
  /** Slug of the hidden global that stores the compiled stylesheet. Default "builder-classes-sheet". */
  sheetSlug?: string
  /** Access control. Default: signed-in users read, create, update and delete. The site never reads the collection: it loads the compiled stylesheet. */
  access?: CollectionConfig['access']
  /** Merged into the collection's `admin` options (e.g. `group`). */
  admin?: CollectionConfig['admin']
  /** Extra hooks. They run after the plugin's own hooks. */
  hooks?: CollectionConfig['hooks']
}

/** What the server helpers need. Stored under `CLASSES_CONFIG_KEY`. */
export type ClassesServerConfig = {
  slug: string
  sheetSlug: string
  /** Full API path of the class endpoints, e.g. "/api/builder/classes". */
  endpoint: string
  /** Full API path of the stylesheet route, e.g. "/api/builder/classes-sheet". */
  sheetPath: string
  /** The site's CSS entry and Tailwind plugins: the classes compile against them. */
  css: CssOptions
  /** The block definitions: renames and removals apply operations to layouts with them. */
  blocks: BlockDefinition[]
}

/** The classes config the plugin stored on the Payload config. `null` without the plugin or with `classes: false`. */
export function classesConfigOf(payload: { config: { custom?: Record<string, unknown> } }): ClassesServerConfig | null {
  const value = payload.config.custom?.[CLASSES_CONFIG_KEY] as ClassesServerConfig | undefined
  return typeof value?.slug === 'string' && typeof value.sheetSlug === 'string' ? value : null
}

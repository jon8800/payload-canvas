// Saved sections: blocks people save from the editor ("Save as section…") to reuse on any page.
// A plugin-owned collection. The editor's library, the MCP tools and the AI assistant list them
// next to the app's built-in sections. Only type imports from `payload`: the editor imports the
// pure helpers below.

import type { Access, CollectionConfig, PayloadRequest } from 'payload'

import { normalizeLayout } from '../core/tree'
import type { Block, BlockDefinition, SectionDefinition } from '../core/types'
import { validateLayout } from '../core/validate'
import { splitLayoutErrors } from '../live/apply'

export const DEFAULT_SAVED_SECTIONS_SLUG = 'builder-sections'

/** Server-only key in `config.custom`: `{ slug }` of the saved sections collection, for the MCP tools. */
export const SAVED_SECTIONS_CONFIG_KEY = 'websiteBuilderSavedSections'

/** A saved section's id in section lists: `saved:<document id>`. */
export const SAVED_SECTION_PREFIX = 'saved:'

/** At most this many saved sections are listed (newest first). */
export const SAVED_SECTIONS_LIMIT = 200

const NAME_MAX = 120
const CATEGORY_MAX = 60

export type SavedSectionsOptions = {
  /** Slug of the collection. Default "builder-sections". */
  slug?: string
  /** Access control. Default: every signed-in user can read, create, update and delete. */
  access?: CollectionConfig['access']
  /** Merged into the collection's `admin` options (e.g. `group`, `hidden`). */
  admin?: CollectionConfig['admin']
  hooks?: CollectionConfig['hooks']
}

export type SavedSectionsServerConfig = { slug: string }

/** Reads the saved sections config the plugin stored on the Payload config. `null` when turned off. */
export function savedSectionsConfigOf(payload: { config: { custom?: Record<string, unknown> } }): SavedSectionsServerConfig | null {
  const value = payload.config.custom?.[SAVED_SECTIONS_CONFIG_KEY] as SavedSectionsServerConfig | undefined
  return value && typeof value.slug === 'string' ? value : null
}

export function savedSectionId(docId: string | number): string {
  return `${SAVED_SECTION_PREFIX}${docId}`
}

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, max)
  return trimmed || undefined
}

/** A saved sections document as a section. Null when it has no id or no valid blocks. */
export function toSavedSection(doc: Record<string, unknown>): SectionDefinition | null {
  const id = doc.id
  if (typeof id !== 'string' && typeof id !== 'number') return null
  const blocks = normalizeLayout({ version: 1, blocks: doc.blocks }).blocks
  if (blocks.length === 0) return null
  const category = text(doc.category, CATEGORY_MAX)
  return {
    id: savedSectionId(id),
    label: text(doc.name, NAME_MAX) ?? 'Untitled section',
    ...(category ? { category } : {}),
    blocks,
    savedId: id,
  }
}

/**
 * The data that saves `block` (with everything inside it) as a section. The blocks keep their
 * ids: every insert gives the copy new ids. An empty name falls back to `fallbackName`.
 */
export function savedSectionData(
  block: Block,
  name: string,
  category?: string | null,
  fallbackName = 'Untitled section',
): { name: string; category: string | null; blocks: Block[] } {
  return {
    name: text(name, NAME_MAX) ?? fallbackName,
    category: text(category, CATEGORY_MAX) ?? null,
    blocks: normalizeLayout({ version: 1, blocks: [block] }).blocks,
  }
}

/**
 * Finds a section by its id (`hero`, `saved:12`), by a saved section's document id (`12`) or by
 * its name (case-insensitive, the first match). Ids win over names.
 */
export function findSection(sections: readonly SectionDefinition[], ref: string): SectionDefinition | undefined {
  const value = ref.trim()
  if (!value) return undefined
  const byId = sections.find((s) => s.id === value)
  if (byId) return byId
  const bySavedId = sections.find((s) => s.savedId !== undefined && String(s.savedId) === value)
  if (bySavedId) return bySavedId
  const name = value.toLowerCase()
  return sections.find((s) => s.label.trim().toLowerCase() === name)
}

/** The saved sections the request's user can read, newest first. Empty when the read fails. */
export async function loadSavedSections(req: PayloadRequest, slug: string): Promise<SectionDefinition[]> {
  try {
    const result = await req.payload.find({
      collection: slug as never,
      depth: 0,
      limit: SAVED_SECTIONS_LIMIT,
      sort: '-createdAt',
      overrideAccess: false,
      user: req.user,
      req,
    })
    return (result.docs as unknown as Record<string, unknown>[]).flatMap((doc) => toSavedSection(doc) ?? [])
  } catch {
    return []
  }
}

const signedIn: Access = ({ req }) => Boolean(req.user)

/** The saved sections collection. `blocks` are the app's block definitions (the layout is checked against them). */
export function savedSectionsCollection(args: { slug: string; blocks: BlockDefinition[]; options?: SavedSectionsOptions }): CollectionConfig {
  const { slug, blocks, options } = args
  return {
    slug,
    labels: { singular: 'Saved section', plural: 'Saved sections' },
    access: {
      read: signedIn,
      create: signedIn,
      update: signedIn,
      delete: signedIn,
      ...options?.access,
    },
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'category', 'updatedAt'],
      description: 'Sections saved from the page builder with "Save as section…". The builder lists them under "Saved" in Add > Sections.',
      ...options?.admin,
    },
    defaultSort: '-createdAt',
    hooks: options?.hooks,
    fields: [
      { name: 'name', type: 'text', required: true, maxLength: NAME_MAX },
      {
        name: 'category',
        type: 'text',
        maxLength: CATEGORY_MAX,
        admin: { description: 'Optional, e.g. "Heroes" or "Pricing". Search in the library finds it.' },
      },
      {
        name: 'blocks',
        type: 'json',
        required: true,
        admin: {
          description: 'The section\'s blocks. To change them, insert the section on a page, edit it there and save it as a section again.',
        },
        hooks: {
          // Canonical form, like every layout (no empty slots or props).
          beforeValidate: [({ value }) => (value === undefined || value === null ? value : normalizeLayout({ version: 1, blocks: value }).blocks)],
        },
        validate: (value: unknown) => {
          if (!Array.isArray(value) || value.length === 0) return 'A section needs at least one block.'
          const { blocking } = splitLayoutErrors(validateLayout({ version: 1, blocks: value }, blocks))
          return blocking.length === 0 ? true : blocking.slice(0, 3).map((e) => e.message).join(' ')
        },
      },
    ],
  }
}

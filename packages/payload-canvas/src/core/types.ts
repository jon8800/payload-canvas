// Shared types for the website builder. See docs/architecture.md sections 5, 6 and 12.
// This file is the contract between the core, the editor, the renderer and the plugin.
// It is pure TypeScript: no React, no Payload runtime imports.

import type { Field } from 'payload'
import type { AiClientConfig } from '../ai/types'
import type { BlockMotion, MotionPatch } from './motion'

// ---------------------------------------------------------------------------
// Layout data (stored in one JSON field)
// ---------------------------------------------------------------------------

export type BlockProps = Record<string, unknown>

export type Block = {
  /** Stable id. Selection, operations and bindings use it, never an array index. */
  id: string
  /** Block type, matches `BlockDefinition.type`. */
  type: string
  /** The block's own field values. Relationship and upload values are stored as IDs. */
  props?: BlockProps
  /** Tailwind classes, including variants (`md:`, `hover:`). */
  className?: string
  /** Child blocks by slot name. No depth limit. */
  slots?: Record<string, Block[]>
  /** Prop path -> document field path. Used by templates (later). */
  bindings?: Record<string, string>
  /** Hidden blocks stay in the data but do not render on the site. */
  hidden?: boolean
  /**
   * A name the editor gives the block (outline, breadcrumbs, error messages), e.g. "Hero".
   * Never rendered on the site. Stored only when non-empty.
   */
  label?: string
  /**
   * Translations (docs/architecture.md, "Localization"): the values of localized props per locale
   * other than the default, e.g. `{ de: { text: 'Hallo' } }`. `props` holds the default locale.
   * A prop missing here falls back as Payload's `fallback` says. Stored only when non-empty.
   */
  locales?: Record<string, BlockProps>
  /**
   * Animations (docs/architecture.md, "Motion"; `core/motion.ts`): an entrance, hover and press
   * effects, a scroll-linked effect and a loop. Not classes: the motion runtime plays them.
   * Stored only when it holds a kind.
   */
  motion?: BlockMotion
}

export type Layout = {
  version: 1
  blocks: Block[]
}

export const EMPTY_LAYOUT: Layout = { version: 1, blocks: [] }

// ---------------------------------------------------------------------------
// Block definitions
// ---------------------------------------------------------------------------

export type SlotDefinition = {
  label?: string
  /** Block types this slot accepts as direct children. `undefined` means any type. */
  allow?: string[]
  /**
   * Block types refused anywhere inside this slot, at any depth (not only direct children).
   * Example: a link's content slot refuses links, buttons and forms, because interactive content
   * inside `<a>` is invalid HTML.
   */
  disallow?: string[]
  /**
   * Most direct children the slot holds (Payload's `maxRows`). A full slot refuses insert, move,
   * paste and duplicate, drop targets skip it and the "+" picker hides there.
   */
  max?: number
  /** Fewest direct children the slot needs (Payload's `minRows`). Fewer blocks only publishing. */
  min?: number
}

export type BlockDefinition = {
  type: string
  label: string
  /** Block props, declared with Payload field configs. */
  fields: Field[]
  slots?: Record<string, SlotDefinition>
  /**
   * Block types this block may sit in directly (in any of their slots). Undefined means anywhere,
   * the root list included. Example: a list item goes only inside a list.
   */
  parents?: string[]
  /** Adds `className` and the style controls. Default true. */
  styles?: boolean
  /** Classes a newly inserted block starts with (e.g. "flex flex-col gap-4" for a stack). */
  defaultClassName?: string
  /**
   * Tailwind classes the block's React component uses itself. They are added to the generated
   * CSS (save hook and canvas) whenever the block type appears in a layout.
   */
  classes?: string[]
  /** Icon name from the editor's built-in icon set (e.g. "heading", "image"). Falls back to a generic icon. */
  icon?: string
  /** Group in the block library, e.g. "Layout", "Content", "Media", "Interactive". */
  category?: string
  /** Text for AI tools: what the block is for, plus a small example. */
  ai?: { description: string; example?: Omit<Partial<Block>, 'id'> }
  /**
   * Set by `fromPayloadBlocks`: the Payload block config this definition was made from. Its
   * `slug` is the `blockType` in Payload data. The content conversion and the component adapter
   * use it, so a block may get another `type` (for example to avoid a clash with `heading`).
   */
  payload?: { slug: string }
}

// ---------------------------------------------------------------------------
// Ready-made sections (inserted as a whole; the main unit for AI tools)
// ---------------------------------------------------------------------------

export type SectionDefinition = {
  /** Stable id, e.g. "hero". */
  id: string
  label: string
  description?: string
  /** Group in the sections library, e.g. "Heroes", "Features", "Calls to action". */
  category?: string
  /** The section's block tree. Block ids are regenerated on every insert. */
  blocks: Block[]
  /**
   * Set on sections people saved from the editor ("Save as section…"): the id of the document in
   * the saved sections collection. The section's own `id` is then `saved:<savedId>`.
   */
  savedId?: string | number
}

/** The saved sections collection, for the editor. Null when `websiteBuilder({ savedSections: false })`. */
export type SavedSectionsClientConfig = {
  /** Slug of the collection, e.g. "builder-sections". */
  collection: string
}

// ---------------------------------------------------------------------------
// Templates and binding (docs/architecture.md section 11)
// ---------------------------------------------------------------------------

/**
 * One field of a template's target collection that block props can bind to. Built by walking the
 * collection's Payload fields: groups and arrays become `children`, and relationship/upload fields
 * get one level of `children` from the related collection (one hop). `path` is a dot path from the
 * document root, e.g. "title", "seo.description", "author.name".
 */
export type BindingField = {
  path: string
  label: string
  /** Payload field type, e.g. "text", "richText", "upload", "relationship", "date", "group". */
  type: string
  relationTo?: string | string[]
  hasMany?: boolean
  children?: BindingField[]
}

/** Template data for the editor. Null when no collection uses templates. */
export type TemplatesClientConfig = {
  /** Slug of the templates collection, e.g. "builder-templates". */
  collection: string
  /** Bindable fields per template target collection slug. */
  sources: Record<string, BindingField[]>
}

/** Render-time template context: the document the template renders. */
export type TemplateContext = {
  collection: string
  // `any` values: Payload's generated document interfaces have no index signature, so they are
  // not assignable to Record<string, unknown>.
  // oxlint-disable-next-line typescript/no-explicit-any
  doc: Record<string, any>
}

// ---------------------------------------------------------------------------
// Config the plugin passes to the admin editor
// ---------------------------------------------------------------------------

/**
 * Set by the plugin on the layout field as `admin.custom.builder` (field `admin.custom` reaches
 * the client; top-level `custom` does not). Must be JSON-serializable: block field configs are
 * stripped of functions (validate, hooks, filterOptions) before they are put here.
 */
export type BuilderClientConfig = {
  collection: string
  /** Name of the layout JSON field. */
  field: string
  blocks: BlockDefinition[]
  /** Frontend route of the canvas iframe, e.g. "/builder-canvas". */
  canvasPath: string
  /** Full API path that returns CanvasCssInput as JSON, e.g. "/api/builder/canvas-css". */
  cssEndpoint: string
  /** Full API path that returns StyleTokens as JSON, e.g. "/api/builder/style-tokens". */
  tokensEndpoint: string
  /** Ready-made sections for the library. */
  sections: SectionDefinition[]
  /**
   * Full API path prefix for live editing, e.g. "/api/builder/live". The editor subscribes to
   * `${liveEndpoint}/${collection}/${id}/events` (Server-Sent Events) and posts operations to
   * `${liveEndpoint}/${collection}/${id}/operations`.
   */
  liveEndpoint: string
  /** Templates and binding. Null when no collection uses templates. */
  templates: TemplatesClientConfig | null
  /** The AI assistant. Null when the plugin has no `ai` option. */
  ai: AiClientConfig | null
  /** Sections people save from the editor. Null when turned off. */
  savedSections: SavedSectionsClientConfig | null
  /**
   * Full API path that returns the theme as `{ css, fontsHref }`, e.g. "/api/builder/theme". The
   * library's section thumbnails follow it. Null without the theme global.
   */
  themeEndpoint: string | null
  /** Editor behaviour from `websiteBuilder({ editor })`. */
  editor: EditorClientConfig
  /**
   * Block types with a prop that has its own `validate` function. The inspector asks the server
   * (`${liveEndpoint}/${collection}/${id}/validate`) for their messages while someone edits.
   */
  validateTypes?: string[]
  /** The locales of the layout's localized props. Null without Payload localization (or when the collection turns it off). */
  localization?: LocaleSettings | null
}

/**
 * What the builder needs from Payload's `localization` config (`localeSettingsOf`). Plain data, so
 * it reaches the editor.
 */
export type LocaleSettings = {
  /** Locale codes, in Payload's order. */
  locales: string[]
  /** Payload's `defaultLocale`. Its values live in `block.props`. */
  defaultLocale: string
  /** Payload's `fallback`: a value missing in a locale shows the fallback locale's value. */
  fallback: boolean
  /** A locale's own `fallbackLocale`, when it has one. Otherwise the default locale is the fallback. */
  fallbacks?: Record<string, string | string[]>
  /** Locale names for the editor, e.g. `{ en: 'English', de: 'Deutsch' }`. */
  labels?: Record<string, string>
}

/**
 * How drag and drop looks in the editor. `indicator`: a line shows where the block lands, and
 * blocks move on drop. `smooth`: the block lifts and follows the pointer, and the other blocks
 * move out of the way as it moves.
 */
export type DragMode = 'indicator' | 'smooth'

/** `websiteBuilder({ editor })`: editor behaviour. */
export type EditorOptions = {
  /** The default drag and drop style. Each user can change it in the editor. Default 'indicator'. */
  dragMode?: DragMode
}

export type EditorClientConfig = { dragMode: DragMode }

// ---------------------------------------------------------------------------
// Design tokens from the app's Tailwind theme (for the Styles panel)
// ---------------------------------------------------------------------------

/** A named theme value, e.g. { name: "primary", value: "var(--primary)" } for `--color-primary`. */
export type ThemeToken = { name: string; value: string }

/**
 * Read from the app's compiled Tailwind theme (`@theme`), so the Styles panel offers exactly the
 * values the site's classes support. JSON-serializable.
 */
export type StyleTokens = {
  /** `--color-*` (theme colors such as primary, plus the default palette like red-500). */
  colors: ThemeToken[]
  /** Spacing scale keys valid after p-/m-/gap-, e.g. ["0", "px", "0.5", "1", …, "96"]. */
  spacing: string[]
  /** `--text-*`, e.g. { name: "lg", value: "1.125rem" }. */
  fontSizes: ThemeToken[]
  /** `--font-weight-*`. */
  fontWeights: ThemeToken[]
  /** `--font-*` families, e.g. sans, serif, mono, heading. */
  fonts: ThemeToken[]
  /** `--leading-*`. */
  leading: ThemeToken[]
  /** `--tracking-*`. */
  tracking: ThemeToken[]
  /** `--radius-*`. */
  radius: ThemeToken[]
  /** `--shadow-*`. */
  shadows: ThemeToken[]
  /** `--breakpoint-*`, in ascending order. */
  breakpoints: ThemeToken[]
  /** `--container-*` (max-width sizes like sm, md, 7xl). */
  containers: ThemeToken[]
  /** Every utility class name the design system knows (for autocomplete), without variants. */
  classList: string[]
}

// ---------------------------------------------------------------------------
// Operations (every edit is one of these)
// ---------------------------------------------------------------------------

/**
 * Where a block goes. `parentId: null` means the root list (`layout.blocks`).
 * `slot` defaults to "children". `index` is the block's final index in the target list.
 */
export type Position = {
  parentId: string | null
  slot?: string
  index: number
}

export type Operation =
  | {
      type: 'insert'
      block: Block
      to: Position
      /**
       * New content written in a locale other than the default: the localized props of the block
       * (and of the blocks inside it) are that locale's values. `localizeOperations` moves them
       * into `locales[locale]`, so the default locale has no value yet. A block that already has
       * `locales` (the stored form: pasted, duplicated or section content) keeps its own data.
       */
      locale?: string
    }
  | { type: 'move'; id: string; to: Position }
  | { type: 'remove'; id: string }
  /** `newId` is the id of the copy's root. Child ids are regenerated. */
  | { type: 'duplicate'; id: string; newId: string }
  | {
      type: 'update'
      id: string
      /** Shallow merge into `props`. */
      props?: BlockProps
      /** Prop keys to delete. */
      unsetProps?: string[]
      /**
       * A locale other than the default: `props` and `unsetProps` change that locale's values
       * (`block.locales[locale]`) instead of `props`. Never the default locale (see
       * `localizeOperations`, which also moves props that are not localized out of such an op).
       */
      locale?: string
      /** `null` removes the className. */
      className?: string | null
      hidden?: boolean
      /** Shallow merge into `bindings`. A `null` value removes that binding. */
      bindings?: Record<string, string | null>
      /** The editor's name for the block. `null` or "" removes it. */
      label?: string | null
      /**
       * Animations. Each kind listed replaces that kind (`{ enter: {...} }`), `null` removes it;
       * kinds left out stay. `motion: null` removes all motion.
       */
      motion?: MotionPatch | null
    }

/** `inverse` undoes this operation when applied in order to the resulting layout. */
export type ApplyResult =
  | { ok: true; layout: Layout; inverse: Operation[] }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Canvas geometry (shared by the canvas iframe and the admin overlay)
// ---------------------------------------------------------------------------

/** A rectangle in the iframe viewport's coordinates (CSS pixels). */
export type Rect = { x: number; y: number; width: number; height: number }

export type Axis = 'x' | 'y'

export type BlockRect = { id: string; rect: Rect }

/** The element that holds a slot's children. Empty slots render a placeholder with this rect. */
export type SlotRect = { ownerId: string; slot: string; rect: Rect; axis: Axis; empty: boolean }

export type CanvasMeasurement = {
  blocks: BlockRect[]
  slots: SlotRect[]
  /** Axis of the root list. */
  rootAxis: Axis
  viewport: { width: number; height: number }
  scroll: { x: number; y: number }
  documentHeight: number
}

/** What is being dragged. */
export type DragSource = { kind: 'block'; id: string } | { kind: 'new'; blockType: string }

export type DropIndicator = { kind: 'line'; rect: Rect } | { kind: 'box'; rect: Rect }

export type DropTarget = {
  /** Final position, ready for a `move` or `insert` operation. */
  to: Position
  indicator: DropIndicator
  /** True when the drop would leave the layout unchanged. */
  noop: boolean
}

export type Point = { x: number; y: number }

/** One row of the outline tree, in admin client coordinates. */
export type OutlineRow = { id: string; rect: Rect; depth: number }

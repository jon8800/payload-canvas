// Shared types for the website builder. See docs/architecture.md sections 5, 6 and 12.
// This file is the contract between the core, the editor, the renderer and the plugin.
// It is pure TypeScript: no React, no Payload runtime imports.

import type { Field } from 'payload'

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
  /** Block types this slot accepts. `undefined` means any type. */
  allow?: string[]
}

export type BlockDefinition = {
  type: string
  label: string
  /** Block props, declared with Payload field configs. */
  fields: Field[]
  slots?: Record<string, SlotDefinition>
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
}

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
  | { type: 'insert'; block: Block; to: Position }
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
      /** `null` removes the className. */
      className?: string | null
      hidden?: boolean
      /** Shallow merge into `bindings`. A `null` value removes that binding. */
      bindings?: Record<string, string | null>
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

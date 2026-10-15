// What the canvas sends to the app's canvas server action (`createCanvasServer`) and gets back.
// Plain data in both directions, except the rendered blocks (React Server Component output).

import type { Block } from '../../core'
import type { ReactNode } from 'react'

import type { PageData } from './types'

/** A document by collection and id. */
export type CanvasDocumentRef = { collection: string; id: string | number }

/** What a canvas shows: the edited document, and in a template the sample document. */
export type CanvasScope = {
  /** The document open in the builder. Null for section thumbnails. */
  document: CanvasDocumentRef | null
  /** The sample document a template previews. Null on normal pages. */
  context: CanvasDocumentRef | null
  /**
   * The locale the editor shows. Documents, collection lists and the page data load in it, as the
   * site loads them in the page's locale. Missing or null: the default locale.
   */
  locale?: string | null
}

export type CanvasServerRequest =
  /** The page data for this scope (the `pageData` loader). */
  | { kind: 'pageData'; scope: CanvasScope }
  /**
   * Blocks to render on the server. `block` is the stored block with its children (IDs, not
   * loaded documents). `key` names the result.
   */
  | { kind: 'blocks'; scope: CanvasScope; blocks: Array<{ key: string; block: Block }> }
  /** The page frame of the scope's document: the app's page around the layout, with its regions. */
  | { kind: 'frame'; scope: CanvasScope }

/** One rendered block, or why it failed. */
export type CanvasServerResult = { node: ReactNode } | { error: string }

export type CanvasServerResponse =
  | { kind: 'pageData'; data: PageData }
  /**
   * The page frame. `node`: the frame's output, with a layout outlet where the canvas puts the
   * live layout; null when the frame shows the layout alone. `values`: the regions' values, as the
   * frame got them (documents loaded), for the canvas's text and image editing. `missing`: the
   * collection has regions, but `createCanvasServer` has no `frame` option.
   */
  | { kind: 'frame'; node: ReactNode | null; values: Record<string, unknown>; missing?: true }
  | { kind: 'blocks'; results: Record<string, CanvasServerResult> }
  /** The request failed as a whole (for example: not signed in). */
  | { kind: 'error'; error: string }

/**
 * The app's canvas server action. Make it in a `'use server'` file with `createCanvasServer`
 * (`payload-canvas/react/server`) and pass it to `BuilderCanvas` as `server`.
 */
export type CanvasServer = (request: CanvasServerRequest) => Promise<CanvasServerResponse>

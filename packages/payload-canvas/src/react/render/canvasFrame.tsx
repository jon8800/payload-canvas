// Server only. The page frame of the canvas server action (`createCanvasServer({ frame })`): the
// app's page around the layout, with the document's regions marked. Takes the Payload instance
// and the user as arguments, so it runs in tests without Next.
//
// The output holds two client components of this package, `LayoutOutlet` and `PayloadRoot`. Next
// finds them in the route's client manifest because the canvas page is a server component that
// imports the server action (README, "Add the canvas route"); a client page that imports the action
// leaves them out ("Could not find the module … in the React Client Manifest").

import type { Payload } from 'payload'
import type { ReactNode } from 'react'

import { regionValues, type TemplateContext } from '../../core'
import { builderConfigOf } from '../../live/document'
import type { CanvasDocumentRef, CanvasScope, CanvasServerResponse } from './canvasServerTypes'
import { LayoutOutlet } from './LayoutOutlet'
import { localeArgs } from './locale'
import { PayloadRoot } from './PayloadRoot'
import { REGION_ATTRIBUTE, type RegionMark } from './regions'
import type { PageData, RenderMode } from './types'

/** What the page frame gets. */
export type CanvasFrameArgs = {
  payload: Payload
  /** The signed-in user (the canvas needs one). */
  user: unknown
  /** The document open in the builder. */
  document: CanvasDocumentRef
  /** In a template: the sample document. Null on normal pages. */
  context: TemplateContext | null
  /** The locale the editor shows, or null without localization. */
  locale: string | null
  /** The document's latest draft, read as the signed-in user (`frameDepth`, the editor's locale). */
  doc: Record<string, unknown>
  /** The page data, as the layout gets it. */
  pageData: PageData
  /** Put it where the page shows the layout: the canvas renders the live layout there. */
  layout: ReactNode
  /** Marks a region: `region('header', <Header … />)`. The name is a name from the collection's `regions`. */
  region: RegionMark
  /** Always `'canvas'`: pass it to `editableText` and `editableImage` in the frame's components. */
  mode: RenderMode
}

export type CanvasFrameOptions = {
  frame?: (args: CanvasFrameArgs) => ReactNode | Promise<ReactNode>
  frameDepth?: number
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Renders the page frame for the scope's document. Without regions in the collection: no frame
 * (`node: null`), so the canvas shows the layout alone. With regions but no `frame` option:
 * `missing`, so the canvas says what to add. The document loads as the user (field read access
 * applies), with the latest draft and the editor's locale.
 */
export async function renderCanvasFrame(
  options: CanvasFrameOptions,
  args: { payload: Payload; user: unknown; scope: CanvasScope; locale: string | null; context: TemplateContext | null; pageData: PageData },
): Promise<CanvasServerResponse> {
  const { payload, user, scope, locale, context, pageData } = args
  const document = scope.document
  if (!document) return { kind: 'frame', node: null, values: {} }
  const regions = builderConfigOf(payload)?.collections[document.collection]?.regions ?? []
  if (regions.length === 0) return { kind: 'frame', node: null, values: {} }
  if (!options.frame) return { kind: 'frame', node: null, values: {}, missing: true }
  let doc: Record<string, unknown>
  try {
    doc = (await payload.findByID({
      collection: document.collection as never,
      id: document.id,
      depth: options.frameDepth ?? 1,
      draft: true,
      overrideAccess: false,
      user: user as never,
      ...localeArgs({ locale }),
    })) as Record<string, unknown>
  } catch (error) {
    return { kind: 'error', error: `Page frame: the document could not be read (${message(error)}).` }
  }
  const names = new Set(regions.map((r) => r.name))
  const region: RegionMark = (name, node) => {
    if (!names.has(name)) {
      payload.logger.warn(`[builder] The page frame marks a region "${name}" that "${document.collection}" has no \`regions\` entry for. It shows, but cannot be selected.`)
      return node
    }
    // The region's attribute goes on the first element of `node`: no element is added.
    return (
      <PayloadRoot attributes={{ [REGION_ATTRIBUTE]: name }} label={name} placeholder={false}>
        {node}
      </PayloadRoot>
    )
  }
  // The canvas renders the live layout here.
  const layout = <LayoutOutlet />
  try {
    const node = await options.frame({ payload, user, document, context, locale, doc, pageData, layout, region, mode: 'canvas' })
    return { kind: 'frame', node: node ?? null, values: regionValues(doc, regions) }
  } catch (error) {
    payload.logger.error({ err: error, msg: '[builder] The page frame failed to render.' })
    return { kind: 'error', error: `Page frame: ${message(error)}` }
  }
}

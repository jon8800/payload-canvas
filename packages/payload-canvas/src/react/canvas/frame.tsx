'use client'

// The page frame in the canvas: the app's page around the layout, rendered by the canvas server
// action (`createCanvasServer({ frame })`) for collections with `regions`. The layout stays a live
// client render inside the frame's outlet; the regions show the document's own fields.

import { regionDefinition, type Block, type BlockDefinition, type RegionConfig } from '../../core'
import { Component, type ReactNode } from 'react'

import type { CanvasScope, CanvasServer } from '../render/canvasServerTypes'

/** What the canvas shows around the layout. */
export type FrameView =
  /** No regions: the layout alone, as before. */
  | { status: 'off' }
  /** The first frame is on its way. The canvas waits for it, so nothing moves when it arrives. */
  | { status: 'loading' }
  /** `node` null: the frame shows the layout alone. `values`: the regions' values as the frame got them. */
  | { status: 'ready'; node: ReactNode | null; values: Record<string, unknown> }
  /** The frame could not be shown. The canvas shows the problem above the layout. */
  | { status: 'error'; error: string }

/** The text shown when a collection has regions and the canvas page has no server action. */
export const NO_SERVER =
  'This page has fixed regions (the collection’s `regions` option), but the canvas page gives `BuilderCanvas` no `server`. ' +
  'Pass the canvas server action, made with `createCanvasServer({ frame })`.'

/** The text shown when the server action has no `frame` option. */
export const NO_FRAME =
  'This page has fixed regions (the collection’s `regions` option), but `createCanvasServer` has no `frame`. ' +
  'Pass the page frame, the component that renders the page around the layout.'

/** The text shown when the frame never renders the layout outlet. */
export const NO_OUTLET = 'The page frame does not render `layout`, so the canvas shows the layout under it. Render `layout` where the page shows the layout.'

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Asks the server action for the frame of `scope`. Never throws. */
export async function requestFrame(server: CanvasServer, scope: CanvasScope): Promise<FrameView> {
  try {
    const response = await server({ kind: 'frame', scope })
    if (response.kind === 'frame') return response.missing ? { status: 'error', error: NO_FRAME } : { status: 'ready', node: response.node, values: response.values }
    if (response.kind === 'error') return { status: 'error', error: response.error }
    return { status: 'error', error: 'Page frame: unexpected answer from the canvas server action.' }
  } catch (error) {
    return { status: 'error', error: `Page frame: ${message(error)}` }
  }
}

/** One region as the inline editor and the mapping read it: its values as block props, its fields as a definition. */
export type RegionData = { block: Block; definition: BlockDefinition }

/** The regions' data for the mapping and inline editing. New objects only when the values change. */
export function regionData(regions: readonly RegionConfig[] | undefined, values: Record<string, unknown> | null): Map<string, RegionData> {
  const out = new Map<string, RegionData>()
  for (const region of regions ?? []) {
    const definition = regionDefinition(region)
    // Regions have no block id: the mapping and inline editing key them by name.
    out.set(region.name, { block: { id: '', type: definition.type, props: values ?? {} }, definition })
  }
  return out
}

const PROBLEM_STYLE = {
  margin: 8,
  padding: '8px 12px',
  border: '1px solid rgb(180 30 30 / 0.5)',
  borderRadius: 4,
  color: 'rgb(180 30 30)',
  background: 'rgb(255 240 240)',
  font: '13px/1.4 system-ui, sans-serif',
} as const

/** A visible problem with the page frame, above the layout. Never part of the site. */
export function FrameProblem({ text }: { text: string }) {
  return (
    <div data-builder-frame-error="" role="alert" style={PROBLEM_STYLE}>
      {text}
    </div>
  )
}

type BoundaryProps = { resetKey: unknown; renderError: (error: string) => ReactNode; children: ReactNode }

/** Catches errors the frame's output throws while it renders (a server component that failed). */
export class FrameBoundary extends Component<BoundaryProps, { error: string | null; resetKey: unknown }> {
  state = { error: null as string | null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown) {
    return { error: `Page frame: ${message(error)}` }
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: { error: string | null; resetKey: unknown }) {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey }
  }

  render() {
    return this.state.error === null ? this.props.children : this.props.renderError(this.state.error)
  }
}

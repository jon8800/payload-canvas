// Server preview of one block for the canvas (`createCanvasServer`). A module of its own: it uses
// the client `SlotOutlet`, and a page ships every client component its modules import, rendered
// or not. The site renderer (`RenderLayout.tsx`) stays without it.
import type { ReactNode } from 'react'
import type { Block } from '../../core'
import { renderBlockPreview, type PreviewBlockOptions } from './RenderLayout'
import { SlotOutlet } from './SlotOutlet'

export type { PreviewBlockOptions }

const outlet = (slot: string): ReactNode => <SlotOutlet name={slot} />

/**
 * Server preview for the canvas (`createCanvasServer`): renders one block (its data already
 * loaded) as the canvas would, with the given components. It gets no editor attributes, and each
 * slot is a `SlotOutlet`: the canvas fills it with the children it renders itself, so they stay
 * editable. Its slot containers get the editor's slot attributes, as on the canvas.
 */
export function renderPreviewBlock(block: Block, options: PreviewBlockOptions = {}): ReactNode {
  return renderBlockPreview(block, options, outlet)
}

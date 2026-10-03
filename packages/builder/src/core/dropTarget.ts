import type { BlockDefinition, CanvasMeasurement, DragSource, DropTarget, Layout, OutlineRow, Point } from './types'

/** The deepest block whose rect contains the point. Ties go to the smaller rect. */
export function deepestBlockAt(
  layout: Layout,
  measurement: CanvasMeasurement,
  p: Point,
  excluded?: Set<string>,
): string | null {
  throw new Error('not implemented')
}

/** Where a dragged block lands on the canvas. Respects slot `allow` rules from `blocks`. */
export function canvasDropTarget(
  layout: Layout,
  blocks: BlockDefinition[],
  measurement: CanvasMeasurement,
  p: Point,
  source: DragSource,
): DropTarget | null {
  throw new Error('not implemented')
}

/** Where a dragged block lands in the outline tree. */
export function outlineDropTarget(
  layout: Layout,
  blocks: BlockDefinition[],
  rows: OutlineRow[],
  p: Point,
  source: DragSource,
  indent: number,
): DropTarget | null {
  throw new Error('not implemented')
}

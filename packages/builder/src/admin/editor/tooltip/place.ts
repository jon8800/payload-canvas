// Where a tooltip goes. Pure, so it is easy to test.

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

type Box = { left: number; top: number; width: number; height: number }
type Size = { width: number; height: number }

/** Space between the element and its tooltip. */
const GAP = 6
/** The tooltip keeps this distance from the viewport edges. */
const MARGIN = 6

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)))

/**
 * The tooltip's top left corner (viewport pixels) next to `anchor` on `side`. A side without room
 * flips to the opposite side; left and right without room fall back to below. The tooltip is
 * shifted along the edge to stay in the viewport.
 */
export function placeTooltip(anchor: Box, tip: Size, viewport: Size, side: TooltipSide = 'bottom'): { left: number; top: number; side: TooltipSide } {
  const below = anchor.top + anchor.height + GAP
  const above = anchor.top - GAP - tip.height
  const right = anchor.left + anchor.width + GAP
  const left = anchor.left - GAP - tip.width
  const fitsBelow = below + tip.height <= viewport.height - MARGIN
  const fitsAbove = above >= MARGIN
  const fitsRight = right + tip.width <= viewport.width - MARGIN
  const fitsLeft = left >= MARGIN

  let final: TooltipSide = side
  if (side === 'bottom' && !fitsBelow && fitsAbove) final = 'top'
  else if (side === 'top' && !fitsAbove) final = fitsBelow ? 'bottom' : 'top'
  else if (side === 'right' && !fitsRight) final = fitsLeft ? 'left' : 'bottom'
  else if (side === 'left' && !fitsLeft) final = fitsRight ? 'right' : 'bottom'
  if (final === 'bottom' && !fitsBelow && fitsAbove) final = 'top'

  if (final === 'left' || final === 'right') {
    const top = clamp(anchor.top + anchor.height / 2 - tip.height / 2, MARGIN, viewport.height - tip.height - MARGIN)
    return { left: final === 'right' ? right : left, top, side: final }
  }
  const x = clamp(anchor.left + anchor.width / 2 - tip.width / 2, MARGIN, viewport.width - tip.width - MARGIN)
  return { left: x, top: final === 'bottom' ? below : Math.max(MARGIN, above), side: final }
}

import type { CSSProperties } from 'react'
import { MARQUEE_CSS, MARQUEE_SECONDS, type MarqueeSpeed } from '../../../blocks/client/marquee'
import type { BlockComponentProps } from '../../render/types'

const speedOf = (value: unknown): MarqueeSpeed => (typeof value === 'string' && value in MARQUEE_SECONDS ? (value as MarqueeSpeed) : 'normal')

/**
 * A row of items that scrolls sideways without end, in CSS only (no JavaScript). The items render
 * twice: the copy is hidden from screen readers and the keyboard (`aria-hidden`, `inert`), and the
 * track moves by half its width, so the loop has no seam. It stands still, with the items wrapped
 * and no copy, when the visitor asks for less motion and in the editor (easier to edit there).
 */
export function Marquee({ props, className, attributes, partAttributes, slots, mode }: BlockComponentProps) {
  const still = mode !== 'site'
  const { className: itemsClass } = partAttributes.children ?? {}
  const style = { '--marquee-duration': `${MARQUEE_SECONDS[speedOf(props.speed)]}s` } as CSSProperties
  return (
    <div
      {...attributes}
      className={className}
      data-marquee={props.direction === 'right' ? 'right' : 'left'}
      data-marquee-pause={!still && props.pauseOnHover !== false ? '' : undefined}
      data-marquee-still={still ? '' : undefined}
      style={style}
    >
      {/* React puts this once in the page's head, however many marquees the page has. */}
      <style href="builder-marquee" precedence="default">
        {MARQUEE_CSS}
      </style>
      <div data-marquee-track="">
        <div {...partAttributes.children}>{slots.children}</div>
        {still ? null : (
          <div className={itemsClass} data-marquee-copy="" aria-hidden="true" inert>
            {slots.children}
          </div>
        )}
      </div>
    </div>
  )
}

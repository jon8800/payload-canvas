import { createElement, type ComponentType, type SVGProps } from 'react'
import type { BlockComponentProps } from '../../render/types'
import { asText, PlaceholderText } from '../placeholder'

/** An icon component of the site's set. It gets `className`, the ARIA attributes and the canvas attributes. */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

/**
 * The site's icons by name: the same names as `builtinBlocks({ icons })`. Check both lists with
 * `satisfies IconMap<(typeof ICON_NAMES)[number]>`.
 */
export type IconMap<Name extends string = string> = Record<Name, IconComponent>

const byMap = new WeakMap<IconMap, ComponentType<BlockComponentProps>>()

/**
 * The `icon` block's component for an icon map. One component per map, so React keeps the
 * component type. Decorative (`aria-hidden`) unless the block has a label.
 */
export function iconComponent(icons: IconMap): ComponentType<BlockComponentProps> {
  const known = byMap.get(icons)
  if (known) return known
  function Icon({ props, className, attributes, mode }: BlockComponentProps) {
    const name = asText(props.name)
    const glyph = name && Object.hasOwn(icons, name) ? icons[name] : undefined
    if (!glyph) {
      if (mode !== 'canvas') return null
      return (
        <span {...attributes} className={className}>
          <PlaceholderText>{name ? `Icon "${name}" is not in the icon set` : 'Icon'}</PlaceholderText>
        </span>
      )
    }
    const label = asText(props.label).trim()
    const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: 'false' as const }
    // A lookup in a fixed map, not a component made during render.
    return createElement(glyph, { ...attributes, ...a11y, className })
  }
  byMap.set(icons, Icon)
  return Icon
}

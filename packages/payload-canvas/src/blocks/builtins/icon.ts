import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'

export const ICON_BLOCK = 'icon'

/** "arrowUpRight" -> "arrow up right". */
const labelOf = (name: string) => name.replace(/([A-Z])/g, ' $1').toLowerCase()

/**
 * One icon from the site's own icon set. `names` are the keys of the site's icon map, as plain
 * strings, so the Payload config never loads the icon components. The components come from
 * `builtinComponents({ icons })` in `payload-canvas/react`.
 */
export function iconBlock(names: readonly string[]): BlockDefinition {
  return defineBlock({
    type: ICON_BLOCK,
    label: 'Icon',
    icon: 'image',
    category: 'Content',
    // An icon may go straight into a link (an arrow at the end of a linked row).
    inline: true,
    fields: [
      {
        name: 'name',
        type: 'select',
        label: 'Icon',
        required: true,
        defaultValue: names[0],
        options: names.map((value) => ({ label: labelOf(value), value })),
      },
      {
        name: 'label',
        type: 'text',
        label: 'Label for screen readers',
        localized: true,
        admin: {
          description:
            'Empty: the icon is decoration and screen readers skip it. Fill it when the icon says something on its own, ' +
            'for example "Yes" for a check mark in a table.',
        },
      },
    ],
    defaultClassName: 'size-6',
    ai: {
      description:
        `One icon from the site's icon set, drawn in the current text colour. Its className sets the size and colour ` +
        `("size-5 text-primary"). Names: ${names.join(', ')}. Leave "label" empty when the icon is decoration; set it ` +
        '("Yes", "No") when the icon is the only thing that says something.',
      example: { type: ICON_BLOCK, props: { name: names[0] }, className: 'size-6' },
    },
  })
}

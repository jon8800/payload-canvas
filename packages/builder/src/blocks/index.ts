import type { CollectionSlug } from 'payload'
import { defineBlock } from '../core/blocks'
import type { BlockDefinition } from '../core/types'

export type DefaultBlocksOptions = {
  /** Upload collection for the image block. Default "media". */
  mediaCollection?: string
}

// Field configs here are plain data (no functions), so they serialize to the admin client as is.

/** The built-in blocks: stack, grid, heading, text, image. */
export function defaultBlocks(options?: DefaultBlocksOptions): BlockDefinition[] {
  const mediaCollection = options?.mediaCollection ?? 'media'

  const stack = defineBlock({
    type: 'stack',
    label: 'Stack',
    fields: [],
    slots: { children: { label: 'Children' } },
    defaultClassName: 'flex flex-col gap-4',
    ai: {
      description:
        'A container that lays out its children in a column (or a row with "flex-row"). ' +
        'Use it to group blocks and build sections.',
      example: {
        type: 'stack',
        className: 'flex flex-col gap-4',
        slots: {
          children: [
            { id: 'b_example_1', type: 'heading', props: { text: 'About us', level: '2' } },
            { id: 'b_example_2', type: 'text', props: { text: 'We build websites.' } },
          ],
        },
      },
    },
  })

  const grid = defineBlock({
    type: 'grid',
    label: 'Grid',
    fields: [],
    slots: { children: { label: 'Items' } },
    defaultClassName: 'grid grid-cols-1 gap-6 md:grid-cols-3',
    ai: {
      description:
        'A CSS grid container. Set the column count with classes such as "md:grid-cols-3". ' +
        'Use it for cards, features and galleries.',
      example: {
        type: 'grid',
        className: 'grid grid-cols-1 gap-6 md:grid-cols-3',
        slots: {
          children: [
            { id: 'b_example_1', type: 'text', props: { text: 'Fast' } },
            { id: 'b_example_2', type: 'text', props: { text: 'Simple' } },
            { id: 'b_example_3', type: 'text', props: { text: 'Secure' } },
          ],
        },
      },
    },
  })

  const heading = defineBlock({
    type: 'heading',
    label: 'Heading',
    fields: [
      { name: 'text', type: 'text', label: 'Text', required: true },
      {
        name: 'level',
        type: 'select',
        label: 'Level',
        options: ['1', '2', '3', '4', '5', '6'],
        defaultValue: '2',
        admin: { description: 'HTML heading level: "1" renders <h1>, "2" renders <h2>, and so on.' },
      },
    ],
    defaultClassName: 'text-3xl font-bold',
    ai: {
      description: 'A page or section heading. Use level "1" once per page, "2" for sections.',
      example: { type: 'heading', props: { text: 'Our services', level: '2' }, className: 'text-3xl font-bold' },
    },
  })

  const text = defineBlock({
    type: 'text',
    label: 'Text',
    fields: [{ name: 'text', type: 'textarea', label: 'Text', required: true }],
    ai: {
      description: 'A paragraph of plain text. Line breaks are kept.',
      example: { type: 'text', props: { text: 'We design and build fast websites.' }, className: 'text-lg' },
    },
  })

  const image = defineBlock({
    type: 'image',
    label: 'Image',
    fields: [
      { name: 'image', type: 'upload', label: 'Image', relationTo: mediaCollection as CollectionSlug, required: true },
      {
        name: 'alt',
        type: 'text',
        label: 'Alt text',
        admin: { description: 'Overrides the image\'s own alt text.' },
      },
    ],
    ai: {
      description: `An image from the "${mediaCollection}" collection, stored by its document ID.`,
      example: { type: 'image', props: { image: 1, alt: 'Team photo' }, className: 'w-full rounded-lg' },
    },
  })

  return [stack, grid, heading, text, image]
}

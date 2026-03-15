import type { SectionPreset } from './index'

function gridCard(title: string): Record<string, unknown> {
  return {
    blockType: 'container',
    htmlTag: 'div',
    borderWidth: { base: '1' },
    borderRadius: { base: 'lg' },
    padding: {
      top: { base: 'custom', custom: 24 },
      right: { base: 'custom', custom: 24 },
      bottom: { base: 'custom', custom: 24 },
      left: { base: 'custom', custom: 24 },
    },
    children: [
      {
        blockType: 'heading',
        text: title,
        tag: 'h3',
      },
      {
        blockType: 'paragraph',
        content: null,
      },
      {
        blockType: 'button',
        label: 'Read More',
        type: 'external',
        url: '#',
        variant: 'link',
        size: 'default',
      },
    ],
  }
}

export const collectionGridPreset: SectionPreset = {
  name: 'Collection Grid',
  description: 'Three-column grid of card-style items with headings and read-more links',
  blocks: [
    {
      blockType: 'container',
      padding: {
        top: { base: 'custom', custom: 64 },
        right: { base: 'none' },
        bottom: { base: 'custom', custom: 64 },
        left: { base: 'none' },
      },
      htmlTag: 'section',
      maxWidth: 'xl',
      children: [
        {
          blockType: 'heading',
          text: 'Latest Updates',
          tag: 'h2',
          customClasses: 'text-center',
        },
        {
          blockType: 'spacer',
          height: 'md',
        },
        {
          blockType: 'grid',
          columns: 3,
          gap: 'lg',
          children: [
            gridCard('Post Title One'),
            gridCard('Post Title Two'),
            gridCard('Post Title Three'),
          ],
        },
      ],
    },
  ],
}

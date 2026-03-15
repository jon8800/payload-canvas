import type { SectionPreset } from './index'

export const contentPreset: SectionPreset = {
  name: 'Content',
  description: 'Simple content section with heading and body text paragraphs',
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
      maxWidth: 'lg',
      display: 'block',
      children: [
        {
          blockType: 'heading',
          text: 'About Us',
          tag: 'h2',
        },
        {
          blockType: 'spacer',
          height: 'sm',
        },
        {
          blockType: 'paragraph',
          content: null,
        },
        {
          blockType: 'paragraph',
          content: null,
        },
      ],
    },
  ],
}

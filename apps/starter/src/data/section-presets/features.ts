import type { SectionPreset } from './index'

function featureItem(title: string): Record<string, unknown> {
  return {
    blockType: 'container',
    htmlTag: 'div',
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
    ],
  }
}

export const featuresPreset: SectionPreset = {
  name: 'Features',
  description: 'Three-column feature highlights with headings and descriptions',
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
          text: 'Features',
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
            featureItem('Fast Performance'),
            featureItem('Easy to Use'),
            featureItem('Fully Customizable'),
          ],
        },
      ],
    },
  ],
}

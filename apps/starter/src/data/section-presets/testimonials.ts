import type { SectionPreset } from './index'

function testimonialItem(attribution: string): Record<string, unknown> {
  return {
    blockType: 'container',
    htmlTag: 'div',
    padding: {
      top: { base: 'custom', custom: 24 },
      right: { base: 'custom', custom: 24 },
      bottom: { base: 'custom', custom: 24 },
      left: { base: 'custom', custom: 24 },
    },
    children: [
      {
        blockType: 'paragraph',
        content: null,
      },
      {
        blockType: 'spacer',
        height: 'xs',
      },
      {
        blockType: 'heading',
        text: attribution,
        tag: 'h4',
      },
    ],
  }
}

export const testimonialsPreset: SectionPreset = {
  name: 'Testimonials',
  description: 'Two-column grid of testimonial quotes with attribution',
  blocks: [
    {
      blockType: 'container',
      padding: {
        top: { base: 'custom', custom: 64 },
        right: { base: 'none' },
        bottom: { base: 'custom', custom: 64 },
        left: { base: 'none' },
      },
      backgroundColor: { preset: 'custom', custom: '#f8fafc' },
      htmlTag: 'section',
      maxWidth: 'lg',
      children: [
        {
          blockType: 'heading',
          text: 'What People Say',
          tag: 'h2',
          customClasses: 'text-center',
        },
        {
          blockType: 'spacer',
          height: 'md',
        },
        {
          blockType: 'grid',
          columns: 2,
          gap: 'lg',
          children: [
            testimonialItem('Jane Doe, CEO'),
            testimonialItem('John Smith, Developer'),
          ],
        },
      ],
    },
  ],
}

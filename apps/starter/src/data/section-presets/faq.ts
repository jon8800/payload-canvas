import type { SectionPreset } from './index'

export const faqPreset: SectionPreset = {
  name: 'FAQ',
  description: 'Frequently asked questions section with question-answer pairs separated by dividers',
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
      children: [
        {
          blockType: 'heading',
          text: 'Frequently Asked Questions',
          tag: 'h2',
          customClasses: 'text-center',
        },
        {
          blockType: 'spacer',
          height: 'md',
        },
        {
          blockType: 'container',
          htmlTag: 'div',
          children: [
            {
              blockType: 'heading',
              text: 'What is this platform?',
              tag: 'h3',
            },
            {
              blockType: 'paragraph',
              content: null,
            },
          ],
        },
        {
          blockType: 'divider',
        },
        {
          blockType: 'container',
          htmlTag: 'div',
          children: [
            {
              blockType: 'heading',
              text: 'How do I get started?',
              tag: 'h3',
            },
            {
              blockType: 'paragraph',
              content: null,
            },
          ],
        },
        {
          blockType: 'divider',
        },
        {
          blockType: 'container',
          htmlTag: 'div',
          children: [
            {
              blockType: 'heading',
              text: 'Can I customize it?',
              tag: 'h3',
            },
            {
              blockType: 'paragraph',
              content: null,
            },
          ],
        },
      ],
    },
  ],
}

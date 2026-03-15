import type { SectionPreset } from './index'

export const footerCtaPreset: SectionPreset = {
  name: 'Footer CTA',
  description: 'Dark background footer call-to-action with heading, text, and action button',
  blocks: [
    {
      blockType: 'container',
      padding: {
        top: { base: 'custom', custom: 48 },
        right: { base: 'none' },
        bottom: { base: 'custom', custom: 48 },
        left: { base: 'none' },
      },
      backgroundColor: { preset: 'custom', custom: '#1e293b' },
      textColor: { preset: 'custom', custom: '#ffffff' },
      htmlTag: 'section',
      display: 'flex',
      flexDirection: 'col',
      alignItems: 'center',
      children: [
        {
          blockType: 'heading',
          text: 'Start Building Today',
          tag: 'h3',
        },
        {
          blockType: 'spacer',
          height: 'xs',
        },
        {
          blockType: 'paragraph',
          content: null,
          customClasses: 'text-center',
        },
        {
          blockType: 'spacer',
          height: 'sm',
        },
        {
          blockType: 'button',
          label: 'Get Started',
          type: 'external',
          url: '#',
          variant: 'default',
          size: 'lg',
        },
      ],
    },
  ],
}

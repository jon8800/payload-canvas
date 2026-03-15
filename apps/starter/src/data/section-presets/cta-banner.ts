import type { SectionPreset } from './index'

export const ctaBannerPreset: SectionPreset = {
  name: 'CTA Banner',
  description: 'Dark background call-to-action banner with heading, text, and two buttons',
  blocks: [
    {
      blockType: 'container',
      padding: {
        top: { base: 'custom', custom: 64 },
        right: { base: 'none' },
        bottom: { base: 'custom', custom: 64 },
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
          text: 'Ready to Get Started?',
          tag: 'h2',
          customClasses: 'text-center',
        },
        {
          blockType: 'paragraph',
          content: null,
          customClasses: 'text-center max-w-xl',
        },
        {
          blockType: 'spacer',
          height: 'sm',
        },
        {
          blockType: 'container',
          htmlTag: 'div',
          display: 'flex',
          justifyContent: 'center',
          customClasses: 'gap-4',
          children: [
            {
              blockType: 'button',
              label: 'Start Now',
              type: 'external',
              url: '#',
              variant: 'default',
              size: 'default',
            },
            {
              blockType: 'button',
              label: 'Learn More',
              type: 'external',
              url: '#',
              variant: 'outline',
              size: 'default',
            },
          ],
        },
      ],
    },
  ],
}

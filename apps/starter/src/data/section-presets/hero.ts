import type { SectionPreset } from './index'

export const heroPreset: SectionPreset = {
  name: 'Hero',
  description: 'Full-width hero section with heading, description text, and CTA button',
  blocks: [
    {
      blockType: 'container',
      padding: {
        top: { base: 'custom', custom: 80 },
        right: { base: 'none' },
        bottom: { base: 'custom', custom: 80 },
        left: { base: 'none' },
      },
      backgroundColor: { preset: 'custom', custom: '#f8fafc' },
      htmlTag: 'section',
      maxWidth: 'xl',
      display: 'flex',
      flexDirection: 'col',
      alignItems: 'center',
      justifyContent: 'center',
      children: [
        {
          blockType: 'heading',
          text: 'Welcome to Your Site',
          tag: 'h1',
          textSize: { base: '4xl' },
          customClasses: 'text-center',
        },
        {
          blockType: 'paragraph',
          content: null,
          textSize: { base: 'lg' },
          customClasses: 'text-center max-w-2xl',
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

import type { GlobalConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { revalidateTheme } from '../hooks/revalidateTheme'

export const ThemeSettings: GlobalConfig = {
  slug: 'theme-settings',
  access: {
    read: anyone,
    update: authenticated,
  },
  admin: {
    group: 'Settings',
  },
  hooks: {
    afterChange: [revalidateTheme],
  },
  fields: [
    // Colors group
    {
      name: 'colors',
      type: 'group',
      label: 'Colors',
      fields: [
        {
          name: 'primary',
          type: 'text',
          admin: {
            description: 'Default: #000000 (oklch(0.205 0 0))',
            components: {
              Field: '@/fields/theme/ColorPicker#ColorPickerField',
            },
          },
        },
        {
          name: 'secondary',
          type: 'text',
          admin: {
            description: 'Default: #f5f5f5 (oklch(0.97 0 0))',
            components: {
              Field: '@/fields/theme/ColorPicker#ColorPickerField',
            },
          },
        },
        {
          name: 'accent',
          type: 'text',
          admin: {
            description: 'Default: #f5f5f5 (oklch(0.97 0 0))',
            components: {
              Field: '@/fields/theme/ColorPicker#ColorPickerField',
            },
          },
        },
        {
          name: 'muted',
          type: 'text',
          admin: {
            description: 'Default: #f5f5f5 (oklch(0.97 0 0))',
            components: {
              Field: '@/fields/theme/ColorPicker#ColorPickerField',
            },
          },
        },
        {
          name: 'destructive',
          type: 'text',
          admin: {
            description: 'Default: #ef4444 (oklch(0.577 0.245 27.325))',
            components: {
              Field: '@/fields/theme/ColorPicker#ColorPickerField',
            },
          },
        },
        {
          name: 'background',
          type: 'text',
          admin: {
            description: 'Default: #ffffff (oklch(1 0 0))',
            components: {
              Field: '@/fields/theme/ColorPicker#ColorPickerField',
            },
          },
        },
        {
          name: 'foreground',
          type: 'text',
          admin: {
            description: 'Default: #171717 (oklch(0.145 0 0))',
            components: {
              Field: '@/fields/theme/ColorPicker#ColorPickerField',
            },
          },
        },
      ],
    },
    // Fonts group
    {
      name: 'fonts',
      type: 'group',
      label: 'Fonts',
      fields: [
        {
          name: 'sans',
          type: 'text',
          admin: {
            description: 'Google Font family name',
            components: {
              Field: '@/fields/theme/FontSelector#FontSelectorField',
            },
          },
        },
        {
          name: 'mono',
          type: 'text',
          admin: {
            description: 'Google Font family name',
            components: {
              Field: '@/fields/theme/FontSelector#FontSelectorField',
            },
          },
        },
      ],
    },
    // Spacing group
    {
      name: 'spacing',
      type: 'group',
      label: 'Spacing & Border Radius',
      fields: [
        {
          name: 'baseMultiplier',
          type: 'number',
          defaultValue: 4,
          admin: {
            description: 'Base spacing unit in px. Scales: xs=1x, sm=2x, md=4x, lg=6x, xl=8x, 2xl=12x',
            components: {
              Field: '@/fields/theme/SliderField#SliderField',
            },
            custom: { min: 1, max: 16, step: 1 },
          },
        },
      ],
    },
    // Border radius (kept at top-level to preserve data path compatibility)
    {
      name: 'borderRadius',
      type: 'text',
      defaultValue: '0.625',
      admin: {
        description: 'Global border radius in rem. shadcn derives sm/md/lg/xl from this.',
        components: {
          Field: '@/fields/theme/SliderField#SliderField',
        },
        custom: { min: 0, max: 2, step: 0.125, unit: 'rem' },
      },
    },
    // Derived tokens (hidden, computed by afterChange hook)
    {
      name: 'derivedTokens',
      type: 'json',
      admin: {
        hidden: true,
      },
    },
  ],
}

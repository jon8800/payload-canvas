import type { Field, Option } from 'payload'

// Tailwind spacing scale presets: none/xs/sm/md/lg/xl/2xl + custom
export const spacingPresets: Option[] = [
  { label: 'None', value: 'none' },
  { label: 'XS', value: 'xs' },
  { label: 'SM', value: 'sm' },
  { label: 'MD', value: 'md' },
  { label: 'LG', value: 'lg' },
  { label: 'XL', value: 'xl' },
  { label: '2XL', value: '2xl' },
  { label: 'Custom', value: 'custom' },
]

const borderRadiusPresets: Option[] = [
  { label: 'None', value: 'none' },
  { label: 'SM', value: 'sm' },
  { label: 'MD', value: 'md' },
  { label: 'LG', value: 'lg' },
  { label: 'XL', value: 'xl' },
  { label: 'Full', value: 'full' },
  { label: 'Custom', value: 'custom' },
]

const borderWidthPresets: Option[] = [
  { label: 'None', value: 'none' },
  { label: '1px', value: '1' },
  { label: '2px', value: '2' },
  { label: '4px', value: '4' },
  { label: '8px', value: '8' },
  { label: 'Custom', value: 'custom' },
]

const textSizePresets: Option[] = [
  { label: 'XS', value: 'xs' },
  { label: 'SM', value: 'sm' },
  { label: 'Base', value: 'base' },
  { label: 'LG', value: 'lg' },
  { label: 'XL', value: 'xl' },
  { label: '2XL', value: '2xl' },
  { label: '3XL', value: '3xl' },
  { label: '4XL', value: '4xl' },
  { label: '5XL', value: '5xl' },
  { label: 'Custom', value: 'custom' },
]

const colorPresets: Option[] = [
  { label: 'None', value: 'none' },
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Muted', value: 'muted' },
  { label: 'Accent', value: 'accent' },
  { label: 'Destructive', value: 'destructive' },
  { label: 'Background', value: 'background' },
  { label: 'Foreground', value: 'foreground' },
  { label: 'Card', value: 'card' },
  { label: 'Popover', value: 'popover' },
  { label: 'Custom', value: 'custom' },
]

const breakpoints = ['sm', 'md', 'lg', 'xl'] as const

// Helper: responsive override selects for a given preset set
function responsiveOverrides(presets: Option[]): Field[] {
  return breakpoints.map((bp) => ({
    name: bp,
    type: 'select' as const,
    label: bp.toUpperCase(),
    options: presets,
    admin: {
      width: '25%' as const,
    },
  }))
}

// Helper: single direction spacing group (base + custom + responsive)
function spacingDirection(name: string, label: string): Field {
  return {
    name,
    type: 'group',
    label,
    admin: { hideGutter: true },
    fields: [
      {
        name: 'base',
        type: 'select',
        label: 'Base',
        options: spacingPresets,
        defaultValue: 'none',
        admin: { width: '50%' },
      },
      {
        name: 'custom',
        type: 'number',
        label: 'Custom Value',
        admin: {
          width: '50%',
          condition: (_, siblingData) => siblingData?.base === 'custom',
          description: 'Tailwind spacing units',
        },
      },
      {
        type: 'collapsible',
        label: 'Responsive Overrides',
        admin: { initCollapsed: true },
        fields: responsiveOverrides(spacingPresets),
      },
    ],
  }
}

// Helper: 4-direction spacing group (padding or margin)
function spacingGroup(name: string, label: string): Field {
  return {
    name,
    type: 'group',
    label,
    admin: { hideGutter: true },
    fields: [
      {
        type: 'collapsible',
        label,
        admin: { initCollapsed: true },
        fields: [
          spacingDirection('top', 'Top'),
          spacingDirection('right', 'Right'),
          spacingDirection('bottom', 'Bottom'),
          spacingDirection('left', 'Left'),
        ],
      },
    ],
  }
}

// Helper: single preset group with responsive (borderRadius, borderWidth, textSize)
function singlePresetGroup(
  name: string,
  label: string,
  presets: Option[],
  customFieldType: 'number' | 'text' = 'number',
  customDescription?: string,
): Field {
  const customField: Field =
    customFieldType === 'text'
      ? {
          name: 'custom',
          type: 'text',
          label: 'Custom Value',
          admin: {
            width: '50%',
            condition: (_, siblingData) => siblingData?.base === 'custom',
            description: customDescription,
          },
        }
      : {
          name: 'custom',
          type: 'number',
          label: 'Custom Value',
          admin: {
            width: '50%',
            condition: (_, siblingData) => siblingData?.base === 'custom',
            description: customDescription,
          },
        }

  return {
    name,
    type: 'group',
    label,
    admin: { hideGutter: true },
    fields: [
      {
        type: 'collapsible',
        label,
        admin: { initCollapsed: true },
        fields: [
          {
            name: 'base',
            type: 'select',
            label: 'Base',
            options: presets,
            admin: { width: '50%' },
          },
          customField,
          {
            type: 'collapsible',
            label: 'Responsive Overrides',
            admin: { initCollapsed: true },
            fields: responsiveOverrides(presets),
          },
        ],
      },
    ],
  }
}

// Helper: color group (preset + custom hex + responsive for preset only)
function colorGroup(name: string, label: string): Field {
  return {
    name,
    type: 'group',
    label,
    admin: { hideGutter: true },
    fields: [
      {
        type: 'collapsible',
        label,
        admin: { initCollapsed: true },
        fields: [
          {
            name: 'preset',
            type: 'select',
            label: 'Color Preset',
            options: colorPresets,
            defaultValue: 'none',
            admin: { width: '50%' },
          },
          {
            name: 'custom',
            type: 'text',
            label: 'Custom Color',
            admin: {
              width: '50%',
              condition: (_, siblingData) => siblingData?.preset === 'custom',
              description: 'Hex or RGB value (e.g. #ff0000, rgb(255,0,0))',
            },
          },
          {
            type: 'collapsible',
            label: 'Responsive Overrides',
            admin: { initCollapsed: true },
            fields: responsiveOverrides(colorPresets),
          },
        ],
      },
    ],
  }
}

// Complete style fields array -- spread into the Styles tab of every block
// Tabs are unnamed so fields store at the block's root level
export const styleFields: Field[] = [
  // 1. Padding (4-direction with responsive)
  spacingGroup('padding', 'Padding'),

  // 2. Margin (4-direction with responsive)
  spacingGroup('margin', 'Margin'),

  // 3. Border Radius (single value with responsive)
  singlePresetGroup('borderRadius', 'Border Radius', borderRadiusPresets),

  // 4. Border Width (single value with responsive)
  singlePresetGroup('borderWidth', 'Border Width', borderWidthPresets),

  // 5. Text Size (single value with responsive)
  singlePresetGroup(
    'textSize',
    'Text Size',
    textSizePresets,
    'text',
    'Arbitrary Tailwind value (e.g. [18px])',
  ),

  // 6. Background Color (preset + custom)
  colorGroup('backgroundColor', 'Background Color'),

  // 7. Text Color (preset + custom)
  colorGroup('textColor', 'Text Color'),

  // 8. Custom CSS (extra classes + inline CSS)
  {
    name: 'customCSS',
    type: 'group',
    label: 'Custom CSS',
    admin: { hideGutter: true },
    fields: [
      {
        type: 'collapsible',
        label: 'Custom CSS',
        admin: { initCollapsed: true },
        fields: [
          {
            name: 'classes',
            type: 'text',
            label: 'Extra Tailwind Classes',
            admin: {
              description: 'Additional Tailwind classes to append',
            },
          },
          {
            name: 'inlineCSS',
            type: 'text',
            label: 'Inline CSS',
            admin: {
              description: 'Raw inline CSS (e.g. max-width: 600px; opacity: 0.5)',
            },
          },
        ],
      },
    ],
  },
]

import type { BlockSlug, Field } from 'payload'
import { atomicBlockSlugs } from '@/blocks/slugs'

// Hidden field — allows blocks to be toggled invisible from the customiser
export const hiddenField: Field = {
  name: '_hidden',
  type: 'checkbox',
  admin: { hidden: true },
}

// Shared children blocks field — present on every atomic block
export const childrenField: Field = {
  name: 'children',
  type: 'blocks',
  blockReferences: [...atomicBlockSlugs] as BlockSlug[],
  blocks: [],
  maxRows: 20,
  admin: { description: 'Nested child blocks' },
  validate: (value, { path }) => {
    const depth = (path || []).filter((segment) => segment === 'children').length
    if (depth > 8) {
      return 'Maximum nesting depth of 8 levels exceeded.'
    }
    return true
  },
}

// Common HTML tag options for the Settings tab
export const htmlTagOptions = [
  'div',
  'section',
  'article',
  'header',
  'footer',
  'aside',
  'main',
  'nav',
  'span',
  'figure',
  'blockquote',
]

// Shared settings fields present on every block (htmlTag + customClasses + inlineCSS)
export function settingsTab(
  defaultTag: string,
  extraFields: Field[] = [],
): { label: string; fields: Field[] } {
  return {
    label: 'Settings',
    fields: [
      {
        name: 'htmlTag',
        type: 'select',
        label: 'HTML Tag',
        defaultValue: defaultTag,
        options: htmlTagOptions,
      },
      {
        name: 'customClasses',
        type: 'text',
        label: 'Custom Classes',
        admin: { description: 'Additional Tailwind classes' },
      },
      {
        name: 'inlineCSS',
        type: 'text',
        label: 'Inline CSS',
        admin: { description: 'Raw inline CSS (e.g. max-width: 600px)' },
      },
      ...extraFields,
    ],
  }
}

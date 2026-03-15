import type { Field } from 'payload'

// Hidden field — allows blocks to be toggled invisible from the customiser
export const hiddenField: Field = {
  name: '_hidden',
  type: 'checkbox',
  admin: { hidden: true },
}

// Note: The `childrenField` is no longer defined here. Children blocks are
// generated per-depth by generateBlocks.ts to avoid infinite recursive schema
// expansion. Each block config receives its children field as a parameter.

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

// Shared settings fields present on every block (htmlTag + extras)
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
      ...extraFields,
    ],
  }
}

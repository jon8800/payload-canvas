// src/blocks/slugs.ts — Single source of truth for block slug arrays.
// Both block configs (for blockReferences) and registry.ts import from here.
// This breaks the circular dependency: configs -> slugs <- registry.
export const atomicBlockSlugs = [
  'heading',
  'paragraph',
  'list',
  'blockquote',
  'image',
  'video',
  'icon',
  'button',
  'link',
  'formEmbed',
  'container',
  'grid',
  'spacer',
  'divider',
] as const

export type AtomicBlockSlug = (typeof atomicBlockSlugs)[number]

import type { Block } from 'payload'
import { hiddenField } from './shared'

// Re-export slugs from the single source of truth
export { atomicBlockSlugs } from './slugs'
export type { AtomicBlockSlug } from './slugs'

// Text blocks
import { HeadingBlock } from './Heading/config'
import { ParagraphBlock } from './Paragraph/config'
import { ListBlock } from './List/config'
import { BlockquoteBlock } from './Blockquote/config'

// Media blocks
import { ImageBlock } from './Image/config'
import { VideoBlock } from './Video/config'
import { IconBlock } from './Icon/config'

// Action blocks
import { ButtonBlock } from './Button/config'
import { LinkBlock } from './Link/config'
import { FormEmbedBlock } from './FormEmbed/config'

// Layout blocks
import { ContainerBlock } from './Container/config'
import { GridBlock } from './Grid/config'
import { SpacerBlock } from './Spacer/config'
import { DividerBlock } from './Divider/config'

function withHiddenField(block: Block): Block {
  return {
    ...block,
    fields: [hiddenField, ...block.fields],
  }
}

// All 14 atomic block configs (each includes _hidden checkbox)
export const allBlocks: Block[] = [
  HeadingBlock,
  ParagraphBlock,
  ListBlock,
  BlockquoteBlock,
  ImageBlock,
  VideoBlock,
  IconBlock,
  ButtonBlock,
  LinkBlock,
  FormEmbedBlock,
  ContainerBlock,
  GridBlock,
  SpacerBlock,
  DividerBlock,
].map(withHiddenField)

// Section blocks (Phase 4)
export const sectionBlockSlugs: string[] = []

// Combined slug array for collection-level blockReferences
export const allBlockSlugs: string[] = [
  ...['heading', 'paragraph', 'list', 'blockquote', 'image', 'video', 'icon', 'button', 'link', 'formEmbed', 'container', 'grid', 'spacer', 'divider'],
  ...sectionBlockSlugs,
]

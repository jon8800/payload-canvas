import type { Block, BlockSlug, Field } from 'payload'
import { hiddenField } from './shared'
import { generateBlocks, type RecursiveBlock } from './generateBlocks'

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

// Layout blocks (these are recursive — they get depth-generated copies with children)
import { ContainerBlock } from './Container/config'
import { GridBlock } from './Grid/config'

// Decorative blocks (always leaf — no children, no depth copies)
import { SpacerBlock } from './Spacer/config'
import { DividerBlock } from './Divider/config'

function withHiddenField(block: Block): Block {
  return {
    ...block,
    fields: [hiddenField, ...block.fields],
  }
}

// --- Leaf blocks: rendered as-is at every nesting level, no children ---
const leafBlockFactories: RecursiveBlock[] = [
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
  SpacerBlock,
  DividerBlock,
]

// Create flat leaf blocks (no children field, called without args)
const leafBlocks: Block[] = leafBlockFactories.map((factory) => factory())

// Leaf block slugs (constant across all depths)
const leafSlugs = leafBlocks.map((b) => b.slug)

// --- Layout blocks: recursive with depth-limited children ---
const layoutBlockFactories: RecursiveBlock[] = [ContainerBlock, GridBlock]

// Generate depth copies of layout blocks only (much smaller: 2 blocks x 4 depths = 8)
// At each depth, children can reference: all leaf slugs + layout slugs at the next depth
const generatedLayoutBlocks = generateLayoutBlocks(layoutBlockFactories, leafSlugs, 1)

// Combine: leaf blocks (12) + layout blocks at all depths (8) = 20 total
export const allBlocks: Block[] = [...leafBlocks, ...generatedLayoutBlocks].map(withHiddenField)

// Section blocks (Phase 4)
export const sectionBlockSlugs: string[] = []

// Top-level slugs (depth 0) for collection-level blockReferences
export const allBlockSlugs: string[] = [
  ...leafSlugs,
  ...layoutBlockFactories.map((f) => f().slug), // container, grid (unsuffixed)
  ...sectionBlockSlugs,
]

/**
 * Generate depth-limited layout blocks where children can reference
 * all leaf blocks (constant) + layout blocks at the next depth level.
 */
function generateLayoutBlocks(
  factories: RecursiveBlock[],
  leafSlugs: string[],
  maxDepth: number,
): Block[] {
  const result: Block[] = []

  // Build from deepest level up
  for (let depth = maxDepth; depth >= 0; depth--) {
    const suffix = depth === 0 ? '' : `_${depth}`

    if (depth === maxDepth) {
      // Deepest level: layout blocks have children referencing leaf blocks only (no more nesting)
      const childrenField: Field = {
        name: 'children',
        type: 'blocks',
        blockReferences: leafSlugs as BlockSlug[],
        blocks: [],
        maxRows: 20,
        admin: { description: 'Nested child blocks' },
      }
      for (const factory of factories) {
        const base = factory(childrenField)
        result.push({
          ...base,
          slug: `${base.slug}${suffix}`,
          interfaceName: `${base.interfaceName}${suffix}`,
        })
      }
    } else {
      // This level: children can reference leaf blocks + layout blocks at the NEXT depth
      const nextSuffix = depth + 1 === 0 ? '' : `_${depth + 1}`
      const nextLayoutSlugs = factories.map((f) => `${f().slug}${nextSuffix}`)
      const childrenSlugs = [...leafSlugs, ...nextLayoutSlugs]

      const childrenField: Field = {
        name: 'children',
        type: 'blocks',
        blockReferences: childrenSlugs as BlockSlug[],
        blocks: [],
        maxRows: 20,
        admin: { description: 'Nested child blocks' },
      }
      for (const factory of factories) {
        const base = factory(childrenField)
        result.push({
          ...base,
          slug: `${base.slug}${suffix}`,
          interfaceName: `${base.interfaceName}${suffix}`,
        })
      }
    }
  }

  return result
}

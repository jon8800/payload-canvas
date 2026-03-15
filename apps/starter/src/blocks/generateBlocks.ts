import type { Block, BlockSlug, Field } from 'payload'

/**
 * Represents a block that supports recursive nesting via a `children` blocks field.
 *
 * Each RecursiveBlock is a factory function: given an optional `children` field,
 * it returns a full Block config. When `children` is omitted, the block renders
 * without nesting (used at max depth).
 */
export type RecursiveBlock = (children?: Field) => Block

const MAX_DEPTH = 3

/**
 * Generates a finite, depth-limited set of blocks from recursive block definitions.
 *
 * Instead of Block A referencing itself via blockReferences (infinite recursion),
 * this produces:
 *   Level 0: heading        (children -> heading_1, container_1, ...)
 *   Level 1: heading_1      (children -> heading_2, container_2, ...)
 *   ...
 *   Level N: heading_N      (no children field)
 *
 * Based on the pattern from:
 * https://gist.github.com/DrMint/f6c9efb13292c56dfce2db545515536f
 */
export function generateBlocks(
  recursiveBlocks: RecursiveBlock[],
  maxDepth: number = MAX_DEPTH,
): Block[] {
  const allGeneratedBlocks: Block[] = []

  // Generate blocks from deepest level up so we can reference the next level's slugs
  // when building the children field for the current level.
  // Store slugs per depth level for building blockReferences.
  const slugsByDepth: string[][] = []

  // First pass: generate max-depth blocks (no children)
  for (let depth = maxDepth; depth >= 0; depth--) {
    const suffix = depth === 0 ? '' : `_${depth}`
    const blocksAtDepth: Block[] = []

    if (depth === maxDepth) {
      // Deepest level: no children field
      for (const factory of recursiveBlocks) {
        const base = factory()
        const block: Block = {
          ...base,
          slug: `${base.slug}${suffix}`,
          interfaceName: `${base.interfaceName}${suffix}`,
        }
        blocksAtDepth.push(block)
      }
    } else {
      // Build children field referencing the next depth level's slugs
      const nextLevelSlugs = slugsByDepth[depth + 1]
      const childrenField: Field = {
        name: 'children',
        type: 'blocks',
        blockReferences: nextLevelSlugs as BlockSlug[],
        blocks: [],
        maxRows: 20,
        admin: { description: 'Nested child blocks' },
      }

      for (const factory of recursiveBlocks) {
        const base = factory(childrenField)
        const block: Block = {
          ...base,
          slug: `${base.slug}${suffix}`,
          interfaceName: `${base.interfaceName}${suffix}`,
        }
        blocksAtDepth.push(block)
      }
    }

    slugsByDepth[depth] = blocksAtDepth.map((b) => b.slug)
    allGeneratedBlocks.push(...blocksAtDepth)
  }

  return allGeneratedBlocks
}

/**
 * Strips depth suffix from a block slug to get the base block type.
 * e.g., "heading_3" -> "heading", "container" -> "container"
 */
export function getBaseBlockSlug(slug: string): string {
  return slug.replace(/_\d+$/, '')
}

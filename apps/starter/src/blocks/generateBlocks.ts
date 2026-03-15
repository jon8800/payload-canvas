import type { Block, Field } from 'payload'

/**
 * Represents a block that supports recursive nesting via a `children` blocks field.
 *
 * Each RecursiveBlock is a factory function: given an optional `children` field,
 * it returns a full Block config. When `children` is omitted, the block renders
 * without nesting (used at max depth).
 */
export type RecursiveBlock = (children?: Field) => Block

/**
 * Strips depth suffix from a block slug to get the base block type.
 * e.g., "heading_3" -> "heading", "container" -> "container"
 */
export function getBaseBlockSlug(slug: string): string {
  return slug.replace(/_\d+$/, '')
}

// `Block.section`: the ready-made section a root block came from (see sections.ts). Its own file,
// so tree.ts, validate.ts and operations.ts can check it without importing the section helpers.

import type { SectionOrigin } from './types'

/**
 * `value` as a canonical `SectionOrigin` (trimmed, no empty `variant`). Undefined when it is left
 * out (undefined or null), an error message when its shape is wrong.
 */
export function checkSectionOrigin(value: unknown): SectionOrigin | undefined | string {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) return 'section must be an object { id, variant? }'
  const { id, variant, ...rest } = value as Record<string, unknown>
  if (Object.keys(rest).length > 0) return `section has unknown keys: ${Object.keys(rest).join(', ')}`
  if (typeof id !== 'string' || !id.trim()) return 'section.id must be a non-empty string'
  if (variant !== undefined && variant !== null && typeof variant !== 'string') return 'section.variant must be a string'
  const name = typeof variant === 'string' ? variant.trim() : ''
  return name ? { id: id.trim(), variant: name } : { id: id.trim() }
}

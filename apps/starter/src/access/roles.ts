import type { Access, FieldAccess } from 'payload'

/** The starter's two roles. Editors get the builder's content mode: text, images and links only. */
export const ROLES = [
  { label: 'Admin', value: 'admin' },
  { label: 'Editor', value: 'editor' },
] as const

/**
 * True when the user may change the design. Users saved before the role field existed have no
 * role and keep full rights.
 */
export function isDesigner(user: unknown): boolean {
  return Boolean(user) && (user as { role?: unknown }).role !== 'editor'
}

/** Only admins may give or change a role. */
export const rolesAccess: FieldAccess = ({ req }) => isDesigner(req.user)

/** Collection access for admins only (users without a role count as admins, see `isDesigner`). */
export const adminOnly: Access = ({ req }) => isDesigner(req.user)

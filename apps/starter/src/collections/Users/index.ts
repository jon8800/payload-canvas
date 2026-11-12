import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { ROLES, rolesAccess } from '../../access/roles'

const isAdmin = ({ req: { user } }: { req: { user: unknown } }) => Boolean(user)

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: isAdmin,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['email', 'name', 'role', 'updatedAt'],
    // Every user has an email; the name is optional. So pickers (a post's Author) never show a bare ID.
    useAsTitle: 'email',
    // The list's search box and the admin search (Ctrl+K) find users by name too.
    listSearchableFields: ['email', 'name'],
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      // Editors use the page builder in content mode (websiteBuilder `editor.canEditDesign`).
      name: 'role',
      type: 'select',
      options: [...ROLES],
      defaultValue: 'admin',
      required: true,
      saveToJWT: true,
      access: { create: rolesAccess, update: rolesAccess },
      admin: { description: 'Editors change text, images and links. Admins also change the design.' },
    },
  ],
  timestamps: true,
}

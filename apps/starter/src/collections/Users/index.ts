import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'

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
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
  timestamps: true,
}

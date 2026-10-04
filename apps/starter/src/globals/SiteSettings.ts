import type { GlobalConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: {
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      label: 'Site name',
      admin: {
        description: 'Shown after each page title in the browser tab and in search results, for example "About | Northwind Studio".',
      },
    },
    {
      name: 'siteDescription',
      type: 'textarea',
      label: 'Site description',
      admin: {
        description: 'Used in search results for pages that have no description of their own.',
      },
    },
    {
      name: 'homePage',
      type: 'relationship',
      relationTo: 'pages',
      label: 'Home Page',
      admin: {
        description: 'Select the page to display at the root URL (/)',
      },
    },
  ],
}

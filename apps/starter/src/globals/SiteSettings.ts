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

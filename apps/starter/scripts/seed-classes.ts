// Adds the demo site's editable classes only (the full demo seed also runs this).
// Run with `pnpm seed:classes`.
import { getPayload } from 'payload'
import config from '@payload-config'

import { seedClasses } from './lib/classes'

try {
  const payload = await getPayload({ config })
  await seedClasses(payload, { disableRevalidate: true })
  process.exit(0)
} catch (error) {
  console.error('Seeding classes failed:', error)
  process.exit(1)
}

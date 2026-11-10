// Writes the reference index from scratch (src/admin/references): which document points at which.
// The site builds it once by itself; run this after a database restore or after writes that
// skipped Payload's hooks. Run with `pnpm references:rebuild`.
import { getPayload } from 'payload'
import config from '@payload-config'

import { rebuildReferenceIndex } from '@/admin/references'

try {
  const payload = await getPayload({ config })
  const { sources, ms } = await rebuildReferenceIndex(payload)
  console.log(`Indexed ${sources} documents in ${Math.round(ms / 1000)} s.`)
  process.exit(0)
} catch (error) {
  console.error('Rebuilding the reference index failed:', error)
  process.exit(1)
}

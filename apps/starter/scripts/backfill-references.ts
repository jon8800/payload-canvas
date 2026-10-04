// Fills the builder's hidden references field (`builderRefs`) of documents saved before it existed.
// Writes only that field: no hooks, no new versions. Safe to run again.
// Run with `pnpm payload run ./scripts/backfill-references.ts`.
import { getPayload } from 'payload'
import config from '@payload-config'
import { backfillReferences } from '@payload-toolkit/builder'

try {
  const payload = await getPayload({ config })
  const results = await backfillReferences(payload)
  for (const r of results) {
    payload.logger.info(
      `${r.collection}: ${r.updated} of ${r.checked} documents updated` +
        (r.draftsChecked > 0 ? `, ${r.draftsUpdated} of ${r.draftsChecked} latest drafts updated` : ''),
    )
  }
  process.exit(0)
} catch (error) {
  console.error('Backfill failed:', error)
  process.exit(1)
}

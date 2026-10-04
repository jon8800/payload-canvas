// Dev fixture: converts the legacy pages' `layout` blocks field into `builderLayout`.
//   pnpm payload run src/legacy-fixture/migrate.ts            # dry run
//   pnpm payload run src/legacy-fixture/migrate.ts write      # write (`payload run` drops --flags, so plain words)
// The same script works for any collection: change `collection`, `from` and `to`.
import config from '@payload-config'
import { formatMigrationReport, migrateBlocksField } from '@payload-toolkit/builder'
import { getPayload } from 'payload'

import { LEGACY_COLLECTION } from './enabled'

const payload = await getPayload({ config })
const report = await migrateBlocksField(payload, {
  collection: LEGACY_COLLECTION,
  from: 'layout',
  to: 'builderLayout',
  dryRun: !process.argv.includes('write'),
  overwrite: process.argv.includes('overwrite'),
  log: (line) => console.log(line),
})
console.log(formatMigrationReport(report))
process.exit(report.errors.length > 0 ? 1 : 0)

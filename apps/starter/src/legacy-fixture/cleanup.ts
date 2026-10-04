// Dev fixture cleanup, in two runs:
// 1. With the fixture on: deletes every legacy page (with its versions) and its document locks.
//      pnpm payload run src/legacy-fixture/cleanup.ts
// 2. With the fixture off (set NEXT_PUBLIC_BUILDER_LEGACY_DEMO=0 in the shell, so the running dev
//    server keeps its .env): Payload's dev schema push drops the fixture tables on start. It asks
//    first, because the shared locks table loses a column; pipe "y" to answer.
//      PowerShell: $env:NEXT_PUBLIC_BUILDER_LEGACY_DEMO='0'; 'y' | pnpm payload run src/legacy-fixture/cleanup.ts
// Then remove the flag from .env. The dev server then finds nothing to change.
import config from '@payload-config'
import { getPayload } from 'payload'

import { LEGACY_COLLECTION, legacyDemo } from './enabled'

const payload = await getPayload({ config })
if (!legacyDemo) {
  console.log('The fixture is off: the schema push above removed its tables.')
  process.exit(0)
}
const collection = LEGACY_COLLECTION as never
const context = { disableRevalidate: true, builderForceDelete: true }
const deleted = await payload.delete({ collection, where: { id: { exists: true } }, context })
const locks = await payload.delete({
  collection: 'payload-locked-documents',
  where: { 'document.relationTo': { equals: LEGACY_COLLECTION } },
})
console.log(`Deleted ${deleted.docs.length} legacy pages and ${locks.docs.length} locks.`)
process.exit(0)

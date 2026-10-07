// Dev fixture for "Using existing Payload blocks" (packages/payload-canvas/README.md): a `legacy-pages`
// collection with a Payload `blocks` field, its block configs used as builder blocks, and
// components written for Payload's data. Off by default. Turn it on with
// NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1 (dev only), then:
//   pnpm payload run src/legacy-fixture/seed.ts         # documents in the old shape, with drafts and versions
//   pnpm payload run src/legacy-fixture/migrate.ts      # dry run; add `write` to convert
//   open /admin/builder/legacy-pages/<id> and /legacy-demo/<slug> (add ?old=1 for the old renderer)
//   pnpm payload run src/legacy-fixture/cleanup.ts      # deletes the fixture documents
// Delete the documents before you turn the flag off: the dev schema push then drops the empty tables.
// Client-safe.
import { fromPayloadBlocks } from 'payload-canvas/blocks'
import { fromPayloadComponents } from 'payload-canvas/react'

import { FieldDemoBlock, legacyClasses, legacyComponentMap, PageFactsLeaf } from './components'
import { legacyBlockConfigs, rootSlugs } from './configs'

export { legacyBlockConfigs } from './configs'
export { LEGACY_COLLECTION, legacyDemo } from './enabled'

/**
 * The fixture's blocks as builder blocks. `prefix` avoids clashes with the default `heading`,
 * `image`, `button` and `richText`: the types become `legacyHeading`, … while the data keeps
 * Payload's `blockType`.
 */
export const legacyBuilderBlocks = fromPayloadBlocks(legacyBlockConfigs, {
  prefix: 'legacy',
  root: rootSlugs,
  overrides: Object.fromEntries(Object.entries(legacyClasses).map(([slug, classes]) => [slug, { classes }])),
})

/**
 * The client-safe components (the site and the canvas). The async server components are in
 * ./server.tsx: the canvas renders those blocks on the server.
 */
export const legacyComponents = {
  ...fromPayloadComponents(legacyComponentMap, legacyBuilderBlocks),
  // `{ block, context }` instead of spread props. `context` is the page data (see ./server.tsx).
  ...fromPayloadComponents({ pageFacts: PageFactsLeaf }, legacyBuilderBlocks, {
    props: (block, context) => ({ block, context }),
  }),
  // The field logic demo (./fieldSemantics.ts), a builder block.
  fieldDemo: FieldDemoBlock,
}

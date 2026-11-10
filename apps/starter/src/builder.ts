// Website builder blocks: one list for payload.config.ts, the site renderer, the canvas iframe and
// the seed. Client-safe: `payload-canvas/blocks` has no server code.
import { builtinBlocks, defaultBlocks } from 'payload-canvas/blocks'
import { formBlocks } from 'payload-canvas/forms'
import { formClasses, formPartClasses } from '@/components/blocks/formClasses'
import { ICON_NAMES } from '@/components/blocks/iconNames'
import { legacyBuilderBlocks, legacyDemo } from '@/legacy-fixture'
import { fieldSemanticsBlocks } from '@/legacy-fixture/fieldSemantics'
import { accessDemo, accessDemoBlock } from '@/legacy-fixture/accessDemo'

export { resolveLink } from '@/lib/links'

export const builderBlocks = [
  ...defaultBlocks({ mediaCollection: 'media', linkCollections: ['pages', 'posts'] }),
  // `embed: {}` turns on the Embed block (custom HTML). Everyone who may edit a page may change its
  // code. To limit that, pass `canEdit`, for example `({ req }) => req.user?.role === 'admin'`.
  ...builtinBlocks({ icons: ICON_NAMES, embed: {} }),
  // Forms on pages: the Form block (build its fields here, or show a saved form) and the Submit
  // button block. The plugin adds the field blocks (`formText`, …) from the forms collection.
  ...formBlocks({ partClassNames: formPartClasses, defaultClassName: formClasses.fields }),
  // Dev fixture: existing Payload blocks used as builder blocks (NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1).
  ...(legacyDemo ? legacyBuilderBlocks : []),
  // Dev fixture: a block with Payload validate, hooks and access on its props.
  ...(legacyDemo ? fieldSemanticsBlocks : []),
  // Dev fixture: a block with field access on its props (NEXT_PUBLIC_BUILDER_ACCESS_DEMO=1).
  ...(accessDemo ? [accessDemoBlock] : []),
]

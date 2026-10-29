// The app's block components, merged over the builder's default components.
// Used by the site renderer and the canvas iframe, so it must stay client-safe.
import { builtinComponents, type BlockComponents } from 'payload-canvas/react'
import { legacyComponents, legacyDemo } from '@/legacy-fixture'
import { accessDemo, AccessDemoBlock } from '@/legacy-fixture/accessDemo'
import { FormBlock } from './FormLoader'
import { icons } from './icons'

export const blockComponents: BlockComponents = {
  // The plugin's opt-in blocks: icon, accordion, carousel, image viewer, table of contents and more.
  ...builtinComponents({ icons }),
  form: FormBlock,
  // Dev fixture: components written for Payload's blocks data (NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1).
  ...(legacyDemo ? legacyComponents : {}),
  // Dev fixture: field access on block props (NEXT_PUBLIC_BUILDER_ACCESS_DEMO=1).
  ...(accessDemo ? { accessDemo: AccessDemoBlock } : {}),
}

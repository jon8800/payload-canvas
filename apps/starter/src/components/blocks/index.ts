// The app's block components, merged over the builder's default components.
// Used by the site renderer and the canvas iframe, so it must stay client-safe.
import { builtinComponents, type BlockComponents } from 'payload-canvas/react'
import { legacyComponents, legacyDemo } from '@/legacy-fixture'
import { accessDemo, AccessDemoBlock } from '@/legacy-fixture/accessDemo'
import { FORM_BLOCK, FORM_SUBMIT_BLOCK } from 'payload-canvas/forms'
import { FORM_FIELD_TYPES } from '@/forms/fields'
import { FormBlock, FormFieldBlock, FormSubmitBlock } from './FormLoader'
import { icons } from './icons'

export const blockComponents: BlockComponents = {
  // The plugin's opt-in blocks: icon, accordion, carousel, table of contents and more.
  ...builtinComponents({ icons }),
  // Forms on pages: the Form block, the Submit button block and one block per field type (`formText`, …).
  [FORM_BLOCK]: FormBlock,
  [FORM_SUBMIT_BLOCK]: FormSubmitBlock,
  ...Object.fromEntries(FORM_FIELD_TYPES.map((type) => [type, FormFieldBlock])),
  // Dev fixture: components written for Payload's blocks data (NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1).
  ...(legacyDemo ? legacyComponents : {}),
  // Dev fixture: field access on block props (NEXT_PUBLIC_BUILDER_ACCESS_DEMO=1).
  ...(accessDemo ? { accessDemo: AccessDemoBlock } : {}),
}

// The app's block components, merged over the builder's default components.
// Used by the site renderer and the canvas iframe, so it must stay client-safe.
import type { BlockComponents } from '@payload-toolkit/builder-react'
import { FormBlock } from './Form'

export const blockComponents: BlockComponents = {
  form: FormBlock,
}

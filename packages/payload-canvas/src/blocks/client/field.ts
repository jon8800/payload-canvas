// Read by the Field block component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/**
 * Classes the field component adds to rich text that has no `prose` class of its own (see `Field.tsx`),
 * so a post body looks right by default. Listed in the field block's `classes`.
 */
export const FIELD_CLASS_MAP = classMap({ richText: 'prose max-w-none' } as const)

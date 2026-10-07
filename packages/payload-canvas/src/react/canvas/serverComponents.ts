import type { BlockDefinition } from '../../core'

import { defaultComponents } from '../components'
import { rendersOnServer } from '../render/marks'
import type { BlockComponents } from '../render/types'
import { ServerBlock } from './ServerBlock'

/**
 * The canvas's components with `ServerBlock` for every block the canvas renders on the server:
 * a block type with a definition but no component in the canvas's map (a server component the
 * canvas cannot import), and components marked with `renderOnServer` or written as async
 * functions. Without a canvas server action the map stays as it is.
 */
export function withServerBlocks(
  components: BlockComponents | undefined,
  definitions: readonly BlockDefinition[] | undefined,
  enabled: boolean,
): BlockComponents | undefined {
  if (!enabled || !definitions) return components
  const out: BlockComponents = { ...components }
  for (const { type } of definitions) {
    const component = components?.[type] ?? (defaultComponents as BlockComponents)[type]
    if (!component || rendersOnServer(component)) out[type] = ServerBlock
  }
  return out
}

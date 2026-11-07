import { ADJACENT_LINKS_LABELS } from '../../../blocks/client/adjacentLinks'
import { labelOf } from '../../../blocks/client/helpers'
import type { Block } from '../../../core/types'
import { listItemsOf } from '../../render/lists'
import type { BlockComponentProps } from '../../render/types'

export type AdjacentLinksLabels = Partial<typeof ADJACENT_LINKS_LABELS>

/** True when a side's collection list found a document (`loadLayoutData` puts it on the list). */
const found = (side: readonly Block[] | undefined) => (side ?? []).some((list) => !list.hidden && listItemsOf(list.props).length > 0)

/**
 * A <nav> with the "previous" and "next" slots, each holding a collection list that finds the
 * document before or after this one. On the site a side without a document renders nothing, and
 * so does the whole block when both are empty. The canvas always shows both sides.
 */
export function AdjacentLinks({ block, props, className, attributes, partAttributes, slots, mode, labels }: BlockComponentProps & { labels?: AdjacentLinksLabels }) {
  const canvas = mode === 'canvas'
  const previous = canvas || found(block.slots?.previous)
  const next = canvas || found(block.slots?.next)
  if (!previous && !next) return null
  const L = labels ? { ...ADJACENT_LINKS_LABELS, ...labels } : ADJACENT_LINKS_LABELS
  return (
    <nav {...attributes} aria-label={labelOf(props, L, 'label')} className={className}>
      {previous ? <div {...partAttributes.previous}>{slots.previous}</div> : null}
      {next ? <div {...partAttributes.next}>{slots.next}</div> : null}
    </nav>
  )
}

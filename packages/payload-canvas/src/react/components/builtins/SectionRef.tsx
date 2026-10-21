import { SECTION_REF_SLOT } from '../../../blocks/builtins/sectionRef'
import type { BlockComponentProps } from '../../render/types'
import { PlaceholderBox } from '../placeholder'

const CONTENTS = { display: 'contents' } as const

/**
 * A live saved section: its blocks, with no element of its own on the site. On the canvas an
 * element with `display: contents` holds the editor attributes, so the editor can select it.
 * The blocks come from `loadLayoutData` (or the canvas); without them the site shows nothing.
 */
export function SectionRef({ block, slots, attributes, mode }: BlockComponentProps) {
  const loaded = (block.slots?.[SECTION_REF_SLOT]?.length ?? 0) > 0
  if (mode !== 'canvas') return loaded ? slots[SECTION_REF_SLOT] : null
  if (!loaded) return <PlaceholderBox attributes={attributes} label="Saved section: pick one in the Content tab" />
  return (
    <div {...attributes} style={CONTENTS}>
      {slots[SECTION_REF_SLOT]}
    </div>
  )
}

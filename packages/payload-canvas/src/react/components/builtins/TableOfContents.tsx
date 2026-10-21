import { lexicalHeadings, type RichTextHeading } from '../../../blocks/builtins/headingId'
import { textOr } from '../../../blocks/builtins/shared'
import type { BlockComponentProps } from '../../render/types'

const SAMPLE: RichTextHeading[] = [
  { id: 'sample-1', text: 'First heading of the text (sample)' },
  { id: 'sample-2', text: 'Second heading (sample)' },
  { id: 'sample-3', text: 'Third heading (sample)' },
]

/**
 * Links to the H2 headings of the bound rich text (`content`). The ids come from `headingId`, the
 * same function that gives the headings on the page their ids. The canvas shows sample links when
 * there are too few headings, so the block can be selected and styled.
 */
export function TableOfContents({ props, className, attributes, mode }: BlockComponentProps) {
  const min = typeof props.minHeadings === 'number' ? props.minHeadings : 3
  const found = lexicalHeadings(props.content)
  const headings = found.length >= min ? found : mode === 'canvas' ? SAMPLE : []
  if (headings.length === 0) return null
  return (
    <nav {...attributes} aria-label={textOr(props.label, 'On this page')} className={className}>
      {headings.map((heading, i) => (
        // Two headings with one text share an id; the key must still be unique.
        <a key={`${heading.id}-${i}`} href={`#${heading.id}`}>
          {heading.text}
        </a>
      ))}
    </nav>
  )
}

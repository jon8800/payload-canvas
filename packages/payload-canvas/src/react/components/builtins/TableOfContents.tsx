import { TABLE_OF_CONTENTS_LABELS } from '../../../blocks/builtins/tableOfContents'
import { labelOf } from '../../../blocks/builtins/shared'
import { headingId, richTextHeadings } from '../../../core/headings'
import type { BlockComponentProps } from '../../render/types'

type Entry = { id: string; text: string }

const SAMPLE: Entry[] = [
  { id: 'sample-1', text: 'First heading of the text (sample)' },
  { id: 'sample-2', text: 'Second heading (sample)' },
  { id: 'sample-3', text: 'Third heading (sample)' },
]

/**
 * The top-level H2 headings of Lexical rich text, with the ids the rendered rich text gives them
 * (`richTextHeadings`: repeated texts get "-2", "-3"). Headings without letters or digits are left out.
 */
export function tableOfContentsEntries(value: unknown): Entry[] {
  const children = (value as { root?: { children?: unknown } } | null)?.root?.children
  if (!Array.isArray(children)) return []
  const topLevel = new Set<unknown>(children)
  return richTextHeadings(value)
    .filter((heading) => heading.level === 2 && topLevel.has(heading.node) && headingId(heading.text))
    .map(({ id, text }) => ({ id, text }))
}

export type TableOfContentsLabels = Partial<typeof TABLE_OF_CONTENTS_LABELS>

/**
 * Links to the H2 headings of the bound rich text (`content`). The richText and field blocks give
 * the headings on the page the same ids (`richTextHeadings`). The canvas shows sample links when
 * there are too few headings, so the block can be selected and styled.
 */
export function TableOfContents({ props, className, attributes, mode, labels }: BlockComponentProps & { labels?: TableOfContentsLabels }) {
  const min = typeof props.minHeadings === 'number' ? props.minHeadings : 3
  const found = tableOfContentsEntries(props.content)
  const headings = found.length >= min ? found : mode === 'canvas' ? SAMPLE : []
  if (headings.length === 0) return null
  const L = labels ? { ...TABLE_OF_CONTENTS_LABELS, ...labels } : TABLE_OF_CONTENTS_LABELS
  return (
    <nav {...attributes} aria-label={labelOf(props, L, 'label')} className={className}>
      {headings.map((heading, i) => (
        // Ids are unique; the index keeps the key unique for the sample links too.
        <a key={`${heading.id}-${i}`} href={`#${heading.id}`}>
          {heading.text}
        </a>
      ))}
    </nav>
  )
}

type LexicalTextNode = {
  type: 'text'
  detail: number
  format: number
  mode: 'normal'
  style: string
  text: string
  version: 1
}

type LexicalParagraphNode = {
  type: 'paragraph'
  children: LexicalTextNode[]
  direction: 'ltr'
  format: ''
  indent: number
  textFormat: number
  textStyle: string
  version: 1
}

type LexicalHeadingNode = {
  type: 'heading'
  children: LexicalTextNode[]
  direction: 'ltr'
  format: ''
  indent: number
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  version: 1
}

type LexicalRootNode = {
  root: {
    type: 'root'
    children: (LexicalParagraphNode | LexicalHeadingNode)[]
    direction: 'ltr'
    format: ''
    indent: number
    version: 1
  }
}

function textNode(text: string): LexicalTextNode {
  return {
    type: 'text',
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text,
    version: 1,
  }
}

function paragraphNode(text: string): LexicalParagraphNode {
  return {
    type: 'paragraph',
    children: [textNode(text)],
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    version: 1,
  }
}

function headingNode(
  text: string,
  tag: LexicalHeadingNode['tag'] = 'h2',
): LexicalHeadingNode {
  return {
    type: 'heading',
    children: [textNode(text)],
    direction: 'ltr',
    format: '',
    indent: 0,
    tag,
    version: 1,
  }
}

/** Create a valid Lexical JSON root with paragraph nodes */
export function richText(...paragraphs: string[]): LexicalRootNode {
  return {
    root: {
      type: 'root',
      children: paragraphs.map((text) => paragraphNode(text)),
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

/** Create a Lexical JSON root with a heading followed by paragraph nodes */
export function richTextWithHeading(
  heading: string,
  ...paragraphs: string[]
): LexicalRootNode {
  return {
    root: {
      type: 'root',
      children: [
        headingNode(heading),
        ...paragraphs.map((text) => paragraphNode(text)),
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

const FALLBACK_LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'

/**
 * Deep-clone blocks and fill paragraph content: null fields with Lexical rich text.
 * Recursively processes children arrays for nested blocks (containers, grids).
 */
export function populatePresetContent(
  blocks: Record<string, unknown>[],
  contentMap: Record<string, string>,
): Record<string, unknown>[] {
  const cloned: Record<string, unknown>[] = JSON.parse(JSON.stringify(blocks))

  return cloned.map((block) => {
    if (block.blockType === 'paragraph' && block.content === null) {
      const key = String(block.blockName || block.blockType)
      block.content = richText(contentMap[key] || FALLBACK_LOREM)
    }

    if (Array.isArray(block.children)) {
      block.children = populatePresetContent(
        block.children as Record<string, unknown>[],
        contentMap,
      )
    }

    return block
  })
}

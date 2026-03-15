import type { ReactNode } from 'react'
import { getBaseBlockSlug } from './generateBlocks'
import { HeadingBlock } from './Heading/component'
import { ParagraphBlock } from './Paragraph/component'
import { ListBlock } from './List/component'
import { BlockquoteBlock } from './Blockquote/component'
import { ImageBlock } from './Image/component'
import { VideoBlock } from './Video/component'
import { IconBlock } from './Icon/component'
import { ButtonBlock } from './Button/component'
import { LinkBlock } from './Link/component'
import { FormEmbedBlock } from './FormEmbed/component'
import { ContainerBlock } from './Container/component'
import { GridBlock } from './Grid/component'
import { SpacerBlock } from './Spacer/component'
import { DividerBlock } from './Divider/component'

const blockComponents: Record<string, React.ComponentType<any>> = {
  heading: HeadingBlock,
  paragraph: ParagraphBlock,
  list: ListBlock,
  blockquote: BlockquoteBlock,
  image: ImageBlock,
  video: VideoBlock,
  icon: IconBlock,
  button: ButtonBlock,
  link: LinkBlock,
  formEmbed: FormEmbedBlock,
  container: ContainerBlock,
  grid: GridBlock,
  spacer: SpacerBlock,
  divider: DividerBlock,
}

type Props = {
  blocks: Array<{ blockType: string; id?: string; _hidden?: boolean; [key: string]: unknown }>
  basePath?: string
}

export function RenderBlocks({ blocks, basePath = 'layout' }: Props): ReactNode {
  if (!blocks?.length) return null

  const visibleBlocks = blocks.filter((block) => !block._hidden)

  return (
    <>
      {visibleBlocks.map((block, i) => {
        const Component = blockComponents[getBaseBlockSlug(block.blockType)]
        if (!Component) return null
        const blockPath = `${basePath}.${i}`
        return (
          <div key={block.id ?? i} data-block-path={blockPath} style={{ display: 'contents' }}>
            <Component {...block} blockPath={blockPath} />
          </div>
        )
      })}
    </>
  )
}

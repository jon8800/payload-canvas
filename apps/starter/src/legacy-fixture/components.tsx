// Dev fixture: block components written for Payload's blocks data (`{ blockType, ...fields }`),
// the way a site that predates the builder renders them. Client-safe (the canvas imports them).
//
// - FullWidth renders its children itself with the site's own RenderLeaves. In the builder it
//   still works, but its children cannot be selected on the canvas (only in the outline).
// - TwoColumn is "upgraded": PayloadSlot renders its columns with the builder, so leaves can be
//   selected and dragged between the columns on the canvas. Outside the builder it falls back to
//   RenderLeaves.
import type { ComponentType, ReactNode } from 'react'
import { PayloadSlot, renderRichText, type PayloadBlockProps } from '@payload-toolkit/builder-react'

type Media = { url?: string | null; alt?: string | null; width?: number | null; height?: number | null }
type LinkData = {
  type?: 'reference' | 'custom' | null
  url?: string | null
  label?: string | null
  newTab?: boolean | null
  reference?: { relationTo: string; value: unknown } | null
}
type LeafData = { blockType: string; id?: string | null } & Record<string, unknown>

const media = (value: unknown): Media | null => (value && typeof value === 'object' ? (value as Media) : null)

function hrefOf(link: LinkData | null | undefined): string | null {
  if (!link) return null
  if (link.type === 'custom') return link.url || null
  const doc = link.reference?.value as { slug?: string } | undefined
  if (!doc || typeof doc !== 'object' || !doc.slug) return null
  return link.reference?.relationTo === 'posts' ? `/blog/${doc.slug}` : `/${doc.slug}`
}

const noLinks = () => null

export function HeadingLeaf({ eyebrow, text, level, align }: PayloadBlockProps<{ eyebrow?: string | null; text?: string; level?: 'h2' | 'h3' | 'h4' | null; align?: string | null }>) {
  const Tag = level ?? 'h2'
  return (
    <div className={align === 'center' ? 'text-center' : undefined}>
      {eyebrow && <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase">{eyebrow}</p>}
      <Tag className="text-3xl font-bold">{text}</Tag>
    </div>
  )
}

export function RichTextLeaf({ content }: PayloadBlockProps<{ content?: unknown }>) {
  if (!content) return null
  return <div className="prose max-w-none">{renderRichText(content, noLinks)}</div>
}

export function ImageLeaf({ image, caption, aspect, overlayButton }: PayloadBlockProps<{ image?: unknown; caption?: string | null; aspect?: string | null; overlayButton?: { label?: string | null; link?: LinkData } | null }>) {
  const file = media(image)
  const href = hrefOf(overlayButton?.link)
  return (
    <figure className="relative">
      {file?.url ? (
        // A legacy component as the site had it: a plain <img>.
        // oxlint-disable-next-line nextjs/no-img-element
        <img alt={file.alt ?? ''} className={aspect === 'square' ? 'aspect-square w-full object-cover' : 'w-full'} src={file.url} />
      ) : (
        <div className="aspect-video w-full bg-gray-200" />
      )}
      {overlayButton?.label && href && (
        <a className="absolute right-0 bottom-0 left-0 bg-black/60 p-3 text-center text-white" href={href}>
          {overlayButton.label}
        </a>
      )}
      {caption && <figcaption className="mt-2 text-sm text-gray-500">{caption}</figcaption>}
    </figure>
  )
}

export function ButtonLeaf({ link, variant }: PayloadBlockProps<{ link?: LinkData; variant?: string | null }>) {
  const href = hrefOf(link)
  const className =
    variant === 'outline' ? 'inline-block rounded border border-gray-900 px-5 py-2' : 'inline-block rounded bg-gray-900 px-5 py-2 text-white'
  return (
    <a className={className} href={href ?? '#'} {...(link?.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {link?.label ?? 'Button'}
    </a>
  )
}

export function FaqAccordionLeaf({ heading, faqs }: PayloadBlockProps<{ heading?: string | null; faqs?: Array<{ id?: string; question?: string; answer?: unknown }> | null }>) {
  return (
    <div className="space-y-3">
      {heading && <h3 className="text-xl font-semibold">{heading}</h3>}
      {(faqs ?? []).map((faq, i) => (
        <details key={faq.id ?? i} className="rounded border border-gray-200 p-3">
          <summary className="font-medium">{faq.question}</summary>
          <div className="mt-2">{faq.answer ? renderRichText(faq.answer, noLinks) : null}</div>
        </details>
      ))}
    </div>
  )
}

/** The site's own leaf renderer (its RenderLeaves). */
const leafComponents: Record<string, ComponentType<never>> = {
  heading: HeadingLeaf,
  richText: RichTextLeaf,
  image: ImageLeaf,
  button: ButtonLeaf,
  faqAccordion: FaqAccordionLeaf,
}

export function RenderLeaves({ blocks }: { blocks?: LeafData[] | null }): ReactNode {
  if (!blocks?.length) return null
  return (
    <div className="space-y-8">
      {blocks.map((block, i) => {
        const Component = leafComponents[block.blockType] as ComponentType<LeafData> | undefined
        return Component ? <Component key={block.id ?? i} {...block} /> : null
      })}
    </div>
  )
}

const paddingTop: Record<string, string> = { none: 'pt-0', small: 'pt-8', default: 'pt-16', large: 'pt-24' }
const paddingBottom: Record<string, string> = { none: 'pb-0', small: 'pb-8', default: 'pb-16', large: 'pb-24' }

type SectionData = { paddingTop?: string | null; paddingBottom?: string | null; bordered?: boolean | null; background?: string | null }

export function FullWidthSection({ content, bordered, background, ...rest }: PayloadBlockProps<SectionData & { content?: LeafData[] | null }>) {
  const classes = [
    'px-6',
    paddingTop[rest.paddingTop ?? 'default'],
    paddingBottom[rest.paddingBottom ?? 'default'],
    bordered ? 'border-y border-gray-200' : '',
    background === 'dark' ? 'bg-gray-900 text-white' : '',
  ]
  return (
    <section className={classes.filter(Boolean).join(' ')}>
      <div className="mx-auto max-w-5xl">
        <RenderLeaves blocks={content} />
      </div>
    </section>
  )
}

export function TwoColumnSection({ leftColumn, rightColumn, columnRatio, reverseOnMobile, builder, ...rest }: PayloadBlockProps<SectionData & { leftColumn?: LeafData[] | null; rightColumn?: LeafData[] | null; columnRatio?: string | null; reverseOnMobile?: boolean | null }>) {
  const grid = columnRatio === '67-33' ? 'md:grid-cols-[2fr_1fr]' : 'md:grid-cols-2'
  return (
    <section className={`px-6 ${paddingTop[rest.paddingTop ?? 'default']} ${paddingBottom[rest.paddingBottom ?? 'default']}`}>
      <div className={`mx-auto flex max-w-5xl gap-10 md:grid ${grid} ${reverseOnMobile ? 'flex-col-reverse' : 'flex-col'}`}>
        <PayloadSlot builder={builder} name="leftColumn" className="space-y-8">
          <RenderLeaves blocks={leftColumn} />
        </PayloadSlot>
        <PayloadSlot builder={builder} name="rightColumn" className="space-y-8">
          <RenderLeaves blocks={rightColumn} />
        </PayloadSlot>
      </div>
    </section>
  )
}

export function SectionIntro({ eyebrow, heading, paragraphs }: PayloadBlockProps<{ eyebrow?: string | null; heading?: string; paragraphs?: Array<{ id?: string; text?: string | null }> | null }>) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      {eyebrow && <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase">{eyebrow}</p>}
      <h2 className="mt-2 text-4xl font-bold">{heading}</h2>
      {(paragraphs ?? []).map((p, i) => (
        <p key={p.id ?? i} className="mt-4 text-lg text-gray-600">
          {p.text}
        </p>
      ))}
    </section>
  )
}

/** The site's own section renderer (its RenderBlocks), keyed by Payload slug. */
export const sectionComponents: Record<string, ComponentType<never>> = {
  fullWidth: FullWidthSection,
  twoColumn: TwoColumnSection,
  sectionIntro: SectionIntro,
}

export function RenderBlocks({ blocks }: { blocks?: LeafData[] | null }): ReactNode {
  return (blocks ?? []).map((block, i) => {
    const Component = sectionComponents[block.blockType] as ComponentType<LeafData> | undefined
    return Component ? <Component key={block.id ?? i} {...block} /> : null
  })
}

/** Every component by Payload slug, for `fromPayloadComponents`. */
export const legacyComponentMap: Record<string, ComponentType<never>> = { ...sectionComponents, ...leafComponents }

/** The Tailwind classes these components use, by slug (the builder's CSS covers only listed classes). */
export const legacyClasses: Record<string, string[]> = {
  heading: ['text-center', 'text-xs', 'font-semibold', 'tracking-widest', 'text-gray-500', 'uppercase', 'text-3xl', 'font-bold'],
  richText: ['prose', 'max-w-none'],
  image: ['relative', 'aspect-square', 'w-full', 'object-cover', 'aspect-video', 'bg-gray-200', 'absolute', 'right-0', 'bottom-0', 'left-0', 'bg-black/60', 'p-3', 'text-white', 'mt-2', 'text-sm'],
  button: ['inline-block', 'rounded', 'border', 'border-gray-900', 'px-5', 'py-2', 'bg-gray-900', 'text-white'],
  faqAccordion: ['space-y-3', 'text-xl', 'font-semibold', 'border', 'border-gray-200', 'p-3', 'font-medium', 'mt-2', 'rounded'],
  fullWidth: ['px-6', 'pt-0', 'pt-8', 'pt-16', 'pt-24', 'pb-0', 'pb-8', 'pb-16', 'pb-24', 'border-y', 'border-gray-200', 'bg-gray-900', 'text-white', 'mx-auto', 'max-w-5xl', 'space-y-8'],
  twoColumn: ['px-6', 'pt-0', 'pt-8', 'pt-16', 'pt-24', 'pb-0', 'pb-8', 'pb-16', 'pb-24', 'mx-auto', 'flex', 'max-w-5xl', 'gap-10', 'md:grid', 'md:grid-cols-[2fr_1fr]', 'md:grid-cols-2', 'flex-col-reverse', 'flex-col', 'space-y-8'],
  sectionIntro: ['mx-auto', 'max-w-3xl', 'px-6', 'py-16', 'text-center', 'text-xs', 'font-semibold', 'tracking-widest', 'text-gray-500', 'uppercase', 'mt-2', 'text-4xl', 'font-bold', 'mt-4', 'text-lg', 'text-gray-600'],
}

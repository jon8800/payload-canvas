import {
  bare,
  bind,
  collectionList,
  defineSection,
  field,
  heading,
  link,
  sectionHeader,
  stack,
  styles,
  text,
  type HeadingLevel,
  type Section,
} from './build'

export type PostListInput = {
  title?: string
  intro?: string
  limit?: number
  /** In the post template: leave out the post being read. */
  excludeCurrent?: boolean
}

/**
 * One post card: image, date, title and excerpt, linked to the post. Every block binds to the
 * listed post. `level` is the title's heading level: "2" when the list has no title of its own.
 */
export function postCard(level: HeadingLevel = '3') {
  // Literal values are design-time placeholders; each post's own values replace them.
  return bind(
    link({ type: 'url', url: '/blog' }, 'group flex flex-col gap-5', [
      bind(bare('image', 'aspect-[16/10] w-full rounded-md object-cover'), { image: 'featuredImage' }),
      stack('div', 'flex flex-col gap-2', [
        field('publishedAt', 'text-sm text-muted-foreground'),
        bind(
          heading(
            'Post title',
            level,
            'font-display text-2xl leading-tight tracking-[-0.01em] decoration-1 underline-offset-4 group-hover:underline',
          ),
          { text: 'title' },
        ),
        bind(text('A short summary of the post.', styles.muted), { text: 'excerpt' }),
      ]),
    ]),
    { link: '$url' },
  )
}

export const postList: Section<PostListInput> = defineSection<PostListInput>({
  name: 'Latest posts',
  description:
    'A title above a grid of the latest blog posts. Each card shows the post image, date, title and excerpt. ' +
    'Without a title, the card titles are second-level headings.',
  create: ({ title, intro, limit = 3, excludeCurrent }) =>
    stack('section', styles.section, [
      stack('div', styles.container, [
        ...(title ? [sectionHeader(title, intro)] : []),
        collectionList(
          'posts',
          { limit, sort: '-publishedAt', ...(excludeCurrent === undefined ? {} : { excludeCurrent }) },
          'grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3',
          [postCard(title ? '3' : '2')],
        ),
      ]),
    ]),
})

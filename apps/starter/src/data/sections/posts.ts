import { bare, bind, collectionList, field, heading, link, stack, styles, text, type Section } from './build'

export type PostListInput = {
  title?: string
  intro?: string
  limit?: number
  /** In the post template: leave out the post being read. */
  excludeCurrent?: boolean
}

/** One post card: image, date, title and excerpt, linked to the post. Every block binds to the listed post. */
export function postCard() {
  // Literal values are design-time placeholders; each post's own values replace them.
  return bind(
    link({ type: 'url', url: '/blog' }, 'group flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-background transition-shadow hover:shadow-md', [
      bind(bare('image', 'aspect-[16/10] w-full object-cover'), { image: 'featuredImage' }),
      stack('div', 'flex flex-col gap-2 px-5 pb-6', [
        field('publishedAt', 'text-sm text-muted-foreground'),
        bind(heading('Post title', '3', 'text-xl font-semibold tracking-tight group-hover:underline'), { text: 'title' }),
        bind(text('A short summary of the post.', 'text-muted-foreground'), { text: 'excerpt' }),
      ]),
    ]),
    { link: '$url' },
  )
}

export const postList: Section<PostListInput> = {
  name: 'Latest posts',
  description: 'A title above a grid of the latest blog posts. Each card shows the post image, date, title and excerpt.',
  create: ({ title, intro, limit = 3, excludeCurrent }) =>
    stack('section', styles.section, [
      stack('div', styles.container, [
        ...(title || intro
          ? [
              stack('div', 'flex flex-col gap-4', [
                ...(title ? [heading(title, '2', styles.sectionTitle)] : []),
                ...(intro ? [text(intro, styles.lead)] : []),
              ]),
            ]
          : []),
        collectionList(
          'posts',
          { limit, sort: '-publishedAt', ...(excludeCurrent === undefined ? {} : { excludeCurrent }) },
          'grid grid-cols-1 gap-8 md:grid-cols-3',
          [postCard()],
        ),
      ]),
    ]),
}

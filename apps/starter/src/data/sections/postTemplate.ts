// The default layout of a blog post: a template whose blocks bind to the post's fields.
import type { Block } from '@payload-toolkit/builder/core'
import { bare, bind, collectionList, field, heading, stack, styles } from './build'
import { postCard } from './posts'

export function postTemplate(): Block[] {
  return [
    {
      ...stack('article', 'flex flex-col', [
        stack('header', 'px-5 pt-14 pb-10 md:px-8 md:pt-24 md:pb-14', [
          stack('div', 'mx-auto flex w-full max-w-3xl flex-col gap-5', [
            field('publishedAt', 'text-sm text-muted-foreground'),
            bind(heading('Post title', '1', 'font-display text-4xl leading-[1.06] tracking-[-0.02em] md:text-6xl'), { text: 'title' }),
            bind(bare('text', styles.lead), { text: 'excerpt' }),
          ]),
        ]),
        stack('div', 'mx-auto w-full max-w-5xl px-5 md:px-8', [
          bind(bare('image', 'aspect-[16/9] w-full rounded-md object-cover'), { image: 'featuredImage' }),
        ]),
        stack('div', 'mx-auto w-full max-w-3xl px-5 py-14 md:px-8 md:py-20', [field('content', 'prose prose-lg max-w-none')]),
        // Centered like the article above it, not the left-aligned header of the "Latest posts" section.
        stack('section', `border-t border-border ${styles.section}`, [
          stack('div', styles.container, [
            heading('More posts', '2', `text-center ${styles.sectionTitle}`),
            collectionList('posts', { limit: 3, sort: '-publishedAt', excludeCurrent: true }, 'grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3', [
              postCard('3'),
            ]),
          ]),
        ]),
      ]),
      label: 'Post',
    },
  ]
}

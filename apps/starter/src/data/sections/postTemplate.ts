// The default layout of a blog post: a template whose blocks bind to the post's fields.
import type { Block } from '@payload-toolkit/builder/core'
import { bare, bind, field, heading, stack, styles } from './build'
import { postGrid } from './posts'

export function postTemplate(): Block[] {
  return [
    {
      ...stack('article', 'flex flex-col', [
        // One text column (max-w-3xl) for the header, the body and "More posts". The padding sits
        // outside each column, so all three share one left edge. The image is wider, centered.
        stack('header', 'px-5 pt-14 pb-10 md:px-8 md:pt-24 md:pb-14', [
          stack('div', 'mx-auto flex w-full max-w-3xl flex-col gap-5', [
            field('publishedAt', 'text-sm text-muted-foreground'),
            bind(heading('Post title', '1', 'font-display text-4xl leading-[1.06] tracking-[-0.02em] md:text-6xl'), { text: 'title' }),
            bind(bare('text', styles.lead), { text: 'excerpt' }),
          ]),
        ]),
        stack('div', 'px-5 md:px-8', [
          stack('div', 'mx-auto w-full max-w-5xl', [bind(bare('image', styles.cardImage), { image: 'featuredImage' })]),
        ]),
        stack('div', 'px-5 py-14 md:px-8 md:py-20', [
          stack('div', 'mx-auto w-full max-w-3xl', [field('content', 'prose prose-lg max-w-none')]),
        ]),
        stack('section', `border-t border-border ${styles.section}`, [
          stack('div', 'mx-auto flex w-full max-w-3xl flex-col gap-10', [
            heading('More posts', '2', 'font-display text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl'),
            postGrid({ limit: 2, excludeCurrent: true, animate: false, columns: 2 }, '3'),
          ]),
        ]),
      ]),
      label: 'Post',
    },
  ]
}

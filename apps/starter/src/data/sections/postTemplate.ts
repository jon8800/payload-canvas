// The default layout of a blog post: a template whose blocks bind to the post's fields.
import type { Block } from 'payload-canvas/core'
import { bare, bind, collectionList, field, heading, link, slotted, stack, styles, text } from './build'
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
        stack('nav', 'px-5 pb-14 md:px-8', [stack('div', 'mx-auto w-full max-w-3xl', [adjacentPosts()])]),
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

/** One side of the previous/next links: the nearest older or newer post. */
const adjacentSide = (label: string, older: boolean, align: string) =>
  collectionList(
    'posts',
    { limit: 1, sort: older ? '-publishedAt' : 'publishedAt', where: { publishedAt: { [older ? 'less_than' : 'greater_than']: '$page.publishedAt' } } },
    'flex flex-col',
    [
      bind(
        link({ type: 'url', url: '#' }, `flex flex-col gap-1 ${align} hover:underline`, [
          text(label, 'text-sm text-muted-foreground'),
          bind(heading('Post title', '3', 'text-lg font-semibold'), { text: 'title' }),
        ]),
        { link: '$url' },
      ),
    ],
  )

/** "Previous post" and "Next post" links by publish date. A side without a post renders nothing. */
function adjacentPosts(): Block {
  return slotted('adjacentLinks', undefined, 'grid grid-cols-2 gap-6 border-t border-border pt-8', {
    previous: [adjacentSide('Previous post', true, 'items-start')],
    next: [adjacentSide('Next post', false, 'items-end text-right')],
  })
}

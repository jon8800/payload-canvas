// The default layout of a blog post: a template whose blocks bind to the post's fields.
import type { Block } from '@payload-toolkit/builder/core'
import { bare, bind, field, heading, stack } from './build'
import { postList } from './posts'

export function postTemplate(): Block[] {
  return [
    stack('article', 'flex flex-col', [
      stack('header', 'bg-muted px-6 pt-20 pb-32 md:pt-28', [
        stack('div', 'mx-auto flex max-w-3xl flex-col items-center gap-5 text-center', [
          field('publishedAt', 'text-sm font-medium text-muted-foreground'),
          bind(heading('Post title', '1', 'text-4xl font-bold tracking-tight md:text-5xl'), { text: 'title' }),
          bind(bare('text', 'text-lg text-muted-foreground md:text-xl'), { text: 'excerpt' }),
        ]),
      ]),
      stack('div', 'mx-auto -mt-20 w-full max-w-4xl px-6', [
        bind(bare('image', 'aspect-[16/9] w-full rounded-2xl object-cover shadow-lg'), { image: 'featuredImage' }),
      ]),
      stack('div', 'mx-auto w-full max-w-3xl px-6 py-16', [field('content', 'prose prose-lg max-w-none')]),
      stack('div', 'border-t border-border', [postList.create({ title: 'More posts', limit: 3, excludeCurrent: true })]),
    ]),
  ]
}

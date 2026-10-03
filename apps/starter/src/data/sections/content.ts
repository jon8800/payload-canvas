import { heading, richText, stack, styles, type Section } from './build'
import { lexical, type RichTextInput } from './lexical'

export type ContentInput = {
  title: string
  body: RichTextInput[]
}

export const content: Section<ContentInput> = {
  name: 'Content',
  description: 'A narrow column of long-form text: a title and a rich text body styled with the typography plugin.',
  create: ({ title, body }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto flex w-full max-w-3xl flex-col gap-6', [
        heading(title, '2', styles.sectionTitle),
        richText(lexical(body), 'prose max-w-none'),
      ]),
    ]),
}

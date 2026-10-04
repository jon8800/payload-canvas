import { heading, richText, stack, styles, defineSection } from './build'
import { lexical, type RichTextInput } from './lexical'

export type ContentInput = {
  title: string
  body: RichTextInput[]
}

export const content = defineSection<ContentInput>({
  name: 'Content',
  description: 'Long-form text: a title on the left and a rich text body (about 65 characters per line) on the right.',
  create: ({ title, body }) =>
    stack('section', styles.section, [
      stack('div', 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 md:grid-cols-12 md:gap-12', [
        heading(title, '2', `md:col-span-4 ${styles.sectionTitle}`),
        richText(lexical(body), 'prose prose-lg max-w-[65ch] md:col-span-8'),
      ]),
    ]),
})

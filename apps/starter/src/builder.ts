// Website builder blocks: one list for payload.config.ts, the site renderer, the canvas iframe and
// the seed. Client-safe: `@payload-toolkit/builder/blocks` has no server code.
import { defaultBlocks, defineBlock } from '@payload-toolkit/builder/blocks'
import { formClassList } from '@/components/blocks/formClasses'

export { resolveLink } from '@/lib/links'

/** Custom block: embeds a form from the form-builder plugin's "forms" collection. */
export const formBlock = defineBlock({
  type: 'form',
  label: 'Form',
  icon: 'form',
  category: 'Interactive',
  fields: [{ name: 'form', type: 'relationship', relationTo: 'forms', required: true }],
  // The component's own Tailwind classes. The plugin adds them to the generated CSS.
  classes: formClassList,
  ai: {
    description:
      'Embeds a form from the Forms collection (form-builder plugin). Visitors fill it in and ' +
      'submit it. Use it for contact and sign-up sections. `form` is the ID of a form document.',
    example: { type: 'form', props: { form: 1 }, className: 'w-full max-w-xl' },
  },
})

export const builderBlocks = [
  ...defaultBlocks({ mediaCollection: 'media', linkCollections: ['pages', 'posts'] }),
  formBlock,
]

// Website builder blocks, shared by payload.config.ts, the frontend renderer and the seed.
// Server only: `@payload-toolkit/builder` includes the Payload plugin. Client code (the canvas)
// imports `resolveLink` from `@/lib/links` and the components from `@/components/blocks`.
import { defaultBlocks, defineBlock } from '@payload-toolkit/builder'

export { resolveLink } from '@/lib/links'

/** Custom block: embeds a form from the form-builder plugin's "forms" collection. */
export const formBlock = defineBlock({
  type: 'form',
  label: 'Form',
  fields: [{ name: 'form', type: 'relationship', relationTo: 'forms', required: true }],
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

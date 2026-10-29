import type { CollectionSlug } from 'payload'
import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { classesOf, classMap } from './shared'

export const MEDIA_BACKDROP_BLOCK = 'mediaBackdrop'

/**
 * Classes the backdrop component adds to the media and the overlay: they fill the block behind
 * its content. The block itself needs `relative isolate` (in its default className).
 */
export const MEDIA_BACKDROP_CLASS_MAP = classMap({
  media: 'pointer-events-none absolute inset-0 -z-10 size-full object-cover',
  overlay: 'pointer-events-none absolute inset-0 -z-10',
})

const BACKDROP_CLASS = 'relative isolate flex min-h-96 flex-col justify-end gap-4 overflow-hidden p-8 [&>[data-backdrop-overlay]]:bg-black/40'

export function mediaBackdropBlock(mediaCollection = 'media'): BlockDefinition {
  const relationTo = mediaCollection as CollectionSlug
  return defineBlock({
    type: MEDIA_BACKDROP_BLOCK,
    label: 'Media backdrop',
    icon: 'mediaBackdrop',
    category: 'Media',
    fields: [
      { name: 'image', type: 'upload', relationTo, label: 'Photo' },
      {
        name: 'alt',
        type: 'text',
        label: 'Alt text',
        localized: true,
        admin: { description: 'Empty: the photo is decoration, as most backgrounds are.' },
      },
      {
        name: 'video',
        type: 'upload',
        relationTo,
        label: 'Video',
        admin: { description: 'A muted, looping video. It does not play when the visitor asks for less motion: the poster shows instead.' },
      },
      {
        name: 'videoUrl',
        type: 'text',
        label: 'Video URL',
        admin: { description: 'Instead of an upload: a link to a video file, for example /video/hero.mp4.' },
      },
      { name: 'poster', type: 'upload', relationTo, label: 'Video poster', admin: { description: 'Empty: the photo above.' } },
      {
        name: 'priority',
        type: 'checkbox',
        label: 'Load first',
        admin: { description: 'For the backdrop at the top of the page (the hero): the photo or poster loads at once, with high priority.' },
      },
      { name: 'sizes', type: 'text', label: 'Sizes', admin: { description: 'The HTML sizes attribute of the photo. Empty: 100vw.' } },
      {
        name: 'overlay',
        type: 'checkbox',
        label: 'Overlay',
        admin: { description: 'A layer between the media and the content, to keep text readable. Its colour comes from [&>[data-backdrop-overlay]]: classes.' },
      },
    ],
    slots: { children: { label: 'Content' } },
    defaultClassName: BACKDROP_CLASS,
    classes: classesOf(MEDIA_BACKDROP_CLASS_MAP),
    ai: {
      description:
        `A section with a photo or a muted looping video behind its "children" slot content (a hero, a banner). Media from the ` +
        `"${mediaCollection}" collection: "image" (a photo), or "video" (an upload) or "videoUrl" with an optional "poster" ` +
        '(empty: the photo). The video does not play under reduced motion. The media focal point sets object-position. Set ' +
        '"priority" on the hero only. "overlay" adds a layer for readable text, coloured with [&>[data-backdrop-overlay]]: ' +
        'classes ("[&>[data-backdrop-overlay]]:bg-black/40"). Style the media with [&>[data-backdrop-media]]: classes (blur, ' +
        'object-position). Keep "relative isolate" in its className: the media sits behind the content.',
      example: {
        type: MEDIA_BACKDROP_BLOCK,
        props: { image: 1, priority: true, overlay: true },
        className: BACKDROP_CLASS,
        slots: {
          children: [
            { id: 'b_example_1', type: 'heading', props: { text: 'Welcome', level: '1' }, className: 'text-5xl font-bold text-white' },
          ],
        },
      },
    },
  })
}

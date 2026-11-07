import type { FieldAccess } from 'payload'
import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { EMBED_BLOCK, EMBED_CLASS_MAP, EMBED_LABELS, EMBED_MAX_LENGTH, EMBED_MODES, EMBED_SANDBOX, embedMode } from '../client/embed'
import { classesOf, labelField } from './shared'

export { EMBED_BLOCK, EMBED_CLASS_MAP, EMBED_LABELS, EMBED_MAX_LENGTH, EMBED_MODES, EMBED_SANDBOX, embedMode }

export type EmbedOptions = {
  /**
   * Who may change the code and the mode: a Payload field access function, for example
   * `({ req }) => req.user?.role === 'admin'`. Default: everyone who may edit the document.
   * Inline code runs on the site as the site's own code, so give it only to people you trust.
   */
  canEdit?: FieldAccess
  /** The longest code, in characters. Default: `EMBED_MAX_LENGTH` (50,000). Longer code blocks Publish. */
  maxLength?: number
}

export function embedBlock(options: EmbedOptions = {}): BlockDefinition {
  const { canEdit } = options
  const access = canEdit ? { access: { create: canEdit, update: canEdit } } : {}
  const maxLength = options.maxLength ?? EMBED_MAX_LENGTH
  return defineBlock({
    type: EMBED_BLOCK,
    label: 'Embed',
    description: 'Your own HTML code, such as a widget, a map or a form from another service.',
    icon: 'embed',
    category: 'Media',
    fields: [
      { name: 'code', type: 'code', label: 'Code', maxLength, admin: { language: 'html' }, ...access },
      {
        name: 'mode',
        type: 'select',
        label: 'Runs',
        defaultValue: 'inline',
        options: [
          { label: 'In the page', value: 'inline' },
          { label: 'In its own frame', value: 'isolated' },
        ],
        ...access,
      },
      labelField('title', EMBED_LABELS.title, 'Frame name for screen readers'),
    ],
    defaultClassName: 'w-full',
    classes: classesOf(EMBED_CLASS_MAP),
    ai: {
      description:
        'Custom HTML code from another service: a booking widget, a map, a newsletter form, a social post. "code" is ' +
        `the HTML, at most ${maxLength} characters. "mode": "inline" (default) puts the HTML in the page and runs its ` +
        '<script> tags once the page loads; "isolated" runs it in a sandboxed frame (scripts and forms work, but it ' +
        'cannot reach the page). An isolated frame does not grow with its content: give the block a height with ' +
        'className ("h-96", "aspect-video"). "title": the frame\'s name for screen readers. The editor never runs the ' +
        'code: the canvas shows it without scripts. Use it only for code the site owner gave you; never invent ' +
        'third-party scripts. Prefer the built-in blocks (video, image, form) when one fits.',
      example: {
        type: EMBED_BLOCK,
        props: { mode: 'isolated', title: 'Opening hours', code: '<p style="font: 16px system-ui">Open Monday to Friday, 9 to 5.</p>' },
        className: 'w-full h-24',
      },
    },
  })
}

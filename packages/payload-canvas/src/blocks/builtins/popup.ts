import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { POPUP_CLASS_MAP, POPUP_LABELS } from '../client/popup'
import { classesOf, INTERACTIVE, labelsField, labelsHelp } from './shared'

export { POPUP_CLASS_MAP, POPUP_LABELS }

export const POPUP_BLOCK = 'popup'

/** The popup's inner elements that take classes, with the classes a new popup starts with. */
const POPUP_PARTS = {
  panel: { label: 'Panel', defaultClassName: 'w-[calc(100%-2rem)] max-w-lg rounded-xl p-8 shadow-xl backdrop:bg-black/60' },
  close: { label: 'Close button', defaultClassName: 'absolute top-3 right-3 size-9 rounded-full' },
}

const SLOTS = {
  // The trigger renders inside a <button>: links and controls inside it are invalid HTML.
  trigger: { label: 'Button', disallow: [...INTERACTIVE, POPUP_BLOCK, 'tabs'], styles: true, defaultClassName: 'inline-flex items-center gap-2' },
  content: { label: 'Content', styles: true, defaultClassName: 'flex flex-col gap-4' },
}

export function popupBlock(): BlockDefinition {
  return defineBlock({
    type: POPUP_BLOCK,
    label: 'Popup',
    description: 'A button that opens a box over the page, for example a video, a large photo or a form.',
    icon: 'popup',
    category: 'Interactive',
    fields: [
      {
        name: 'label',
        type: 'text',
        label: 'Name for screen readers',
        localized: true,
        admin: { placeholder: 'Empty: the first heading inside' },
      },
      {
        name: 'anchor',
        type: 'text',
        label: 'Open from links to #',
        admin: { placeholder: 'newsletter' },
        custom: {
          ai: {
            description: 'Links to "#" plus this name open the popup too.',
          },
        },
      },
      labelsField(POPUP_LABELS, { closeLabel: 'Close button' }),
    ],
    slots: SLOTS,
    parts: POPUP_PARTS,
    classes: classesOf(POPUP_CLASS_MAP),
    ai: {
      description:
        'A button that opens a popup (a native modal <dialog>). The "trigger" slot is what the visitor clicks: a text, an ' +
        'icon or a small image (no links or buttons: it renders inside a <button>). The "content" slot is the popup. The ' +
        'dialog keeps the focus inside, Escape, the close button and a click outside close it, and the page does not ' +
        'scroll while it is open. The content stays in the HTML. "anchor": links to "#<anchor>" on the page also open it ' +
        '(the trigger may then be empty). "label": the name for screen readers; empty, the first heading in the content ' +
        'names it. Style with "partClassName": "trigger" (the button), "panel" (the dialog box; "backdrop:" classes colour ' +
        'the backdrop, e.g. "backdrop:bg-black/60"), "close" (the close button, placed absolutely in the panel) and ' +
        '"content". For a photo that opens large: a small image in "trigger" and the large image in "content" ' +
        '(panel "max-w-5xl p-0", content "gap-0"). On the canvas a click on the trigger, or selecting a block inside, ' +
        'shows the content in place.' +
        labelsHelp(POPUP_LABELS),
      example: {
        type: POPUP_BLOCK,
        props: { anchor: 'newsletter' },
        partClassName: {
          trigger: 'inline-flex items-center gap-2 rounded-md border px-4 py-2',
          content: SLOTS.content.defaultClassName,
          panel: POPUP_PARTS.panel.defaultClassName,
          close: POPUP_PARTS.close.defaultClassName,
        },
        slots: {
          trigger: [{ id: 'b_example_1', type: 'text', props: { text: 'Get the newsletter' } }],
          content: [
            { id: 'b_example_2', type: 'heading', props: { text: 'Stay in touch', level: '2' }, className: 'text-2xl font-semibold' },
            { id: 'b_example_3', type: 'text', props: { text: 'One email a month. No spam.' } },
          ],
        },
      },
    },
  })
}

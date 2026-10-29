import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { TAB_BLOCK, TABS_CLASS_MAP, TABS_LABELS } from '../client/tabs'
import { classesOf, labelsField, labelsHelp } from './shared'

export { TAB_BLOCK, TABS_CLASS_MAP, TABS_LABELS }

export const TABS_BLOCK = 'tabs'

/** The tabs' inner elements that take classes, with the classes new tabs start with. */
const TABS_PARTS = {
  list: { label: 'Tab row', defaultClassName: 'flex gap-1 border-b' },
  tab: { label: 'Each tab', defaultClassName: '-mb-px border-b-2 border-transparent px-4 py-2 opacity-70 aria-selected:border-current aria-selected:opacity-100' },
  panel: { label: 'Each panel', defaultClassName: 'pt-6' },
}

const TABS_CLASS = 'flex flex-col'

export function tabsBlock(): BlockDefinition {
  return defineBlock({
    type: TABS_BLOCK,
    label: 'Tabs',
    description: 'Content in tabs: one row of tab names, one panel shows at a time.',
    icon: 'tabs',
    category: 'Interactive',
    fields: [
      { name: 'label', type: 'text', label: 'Name for screen readers', localized: true },
      { name: 'vertical', type: 'checkbox', label: 'Tabs in a column', defaultValue: false },
      labelsField(TABS_LABELS, { tabLabel: 'Tab without a name' }),
    ],
    // `min: 2`: tabs need at least two tabs, and a new tabs block starts with two (`starterSlots`).
    slots: { tabs: { label: 'Tabs', allow: [TAB_BLOCK], min: 2 } },
    parts: TABS_PARTS,
    defaultClassName: TABS_CLASS,
    classes: classesOf(TABS_CLASS_MAP),
    ai: {
      description:
        'Tabs: a row of tab buttons, and one panel visible at a time. Its "tabs" slot holds only "tab" blocks (at least ' +
        'two); each tab has a "label" prop (the button text) and a "content" slot (its panel). The first tab is open at ' +
        'first. It follows the WAI-ARIA tabs pattern: arrow keys move between tabs, Home and End jump to the first and ' +
        'last. Hidden panels stay in the HTML. "vertical": the tabs stand in a column (arrow up and down); lay the block ' +
        'out with its className ("flex flex-row gap-8") and the "list" part ("flex flex-col"). Style with ' +
        '"partClassName": "list" (the row of tabs), "tab" (each tab button; the open one has aria-selected="true", so ' +
        '"aria-selected:" classes style it) and "panel" (each panel). On the canvas a click on a tab opens it, and ' +
        'selecting a block opens its tab.' +
        labelsHelp(TABS_LABELS) +
        ' {n} is the tab number.',
      example: {
        type: TABS_BLOCK,
        className: TABS_CLASS,
        partClassName: { list: TABS_PARTS.list.defaultClassName, tab: TABS_PARTS.tab.defaultClassName, panel: TABS_PARTS.panel.defaultClassName },
        slots: {
          tabs: [
            {
              id: 'b_example_1',
              type: TAB_BLOCK,
              props: { label: 'Features' },
              slots: { content: [{ id: 'b_example_2', type: 'text', props: { text: 'Everything you need to start.' } }] },
            },
            {
              id: 'b_example_3',
              type: TAB_BLOCK,
              props: { label: 'Pricing' },
              slots: { content: [{ id: 'b_example_4', type: 'text', props: { text: 'Free for small teams.' } }] },
            },
          ],
        },
      },
    },
  })
}

export function tabBlock(): BlockDefinition {
  return defineBlock({
    type: TAB_BLOCK,
    label: 'Tab',
    description: 'One tab of a tabs block: its name and its content.',
    icon: 'tab',
    category: 'Interactive',
    parents: [TABS_BLOCK],
    fields: [{ name: 'label', type: 'text', label: 'Tab name', localized: true }],
    slots: { content: { label: 'Content' } },
    ai: {
      description:
        'One tab of a "tabs" block (only there). "label" is the text of its tab button; the "content" slot is its panel. ' +
        'Its className styles its own panel; the tabs block\'s "panel" part styles every panel.',
      example: {
        type: TAB_BLOCK,
        props: { label: 'Details' },
        slots: { content: [{ id: 'b_example_1', type: 'text', props: { text: 'Made of recycled steel.' } }] },
      },
    },
  })
}

// Read by the tabs component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/** The child block type of the tabs block: one tab with its label and content. */
export const TAB_BLOCK = 'tab'

/** Classes the tabs component adds itself. Sizes and colours come from the parts' classes. */
export const TABS_CLASS_MAP = classMap({
  tab: 'cursor-pointer',
})

/** The tabs' labels and their English defaults. `{n}`: the tab number, for a tab without a label. */
export const TABS_LABELS = { tabLabel: 'Tab {n}' }

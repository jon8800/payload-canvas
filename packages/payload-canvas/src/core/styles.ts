// Tailwind class model for the Styles panel. Pure: no React, no DOM, no Tailwind runtime.
// It reads and writes ONE block's className, per style property and per variant
// (breakpoint + state), so visual controls and raw classes edit the same data.
// Owner: styles-model agent. The exported names and shapes below are the contract.
//
// Value formats (what getStyleValue returns and setStyleValue accepts):
// - enum: an option value from STYLE_PROPERTIES ("flex", "center", "to-r"). Some enums also take
//   extra values: flex "2", aspect-ratio "3/4", cursor "zoom-in", gradient-direction "45".
// - spacing / number / token: the part after the prefix ("4", "1/2", "full", "lg", "7xl").
// - color: the color name with an optional opacity ("primary", "red-500/50", "white/[0.3]").
// - Arbitrary: "[37px]", "[#fff]", "(--my-var)". Spaces in "[…]" become "_" on write.
// - Bare utilities: border / border-t → "1", grow / shrink → "1", rounded / shadow → "DEFAULT".
// - Negative values: `negative: true` in the result; write with "-4" or `{ negative: true }`.
// - font-size may carry a line height: "lg/7".

export {
  BASE_VARIANT,
  BREAKPOINTS,
  STATES,
  type Breakpoint,
  type ParsedClass,
  type StyleGroup,
  type StylePropertyDef,
  type StyleState,
  type StyleTokenHints,
  type StyleValue,
  type StyleValueKind,
  type Variant,
} from './styles/types'
export { STYLE_PROPERTIES, HIDDEN_STYLE_PROPERTIES, getStyleProperty } from './styles/properties'
export { parseClassName, parseVariant, variantPrefix } from './styles/parse'
export { getStyleValue, setStyleValue, styleClass, unmanagedClasses, variantsInUse } from './styles/edit'

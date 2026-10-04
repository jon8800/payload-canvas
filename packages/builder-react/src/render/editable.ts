import type { RenderMode } from './types'

/** The canvas attribute that marks the element holding a text prop. */
export const EDITABLE_TEXT_ATTRIBUTE = 'data-builder-text'

const NONE: Record<string, string> = {}

/**
 * Marks the element that shows a text prop, so the canvas can edit it in place (double-click).
 * `path` is the prop path: "text", or "items.2.text" for a field inside an array row.
 * Spread it on the element whose only content is that text. On the site it returns no attributes.
 *
 * The element must render the text and nothing else (line breaks as `<br>` are fine). Text,
 * textarea and richText fields can be edited this way.
 */
export function editableText(mode: RenderMode, path: string): Record<string, string> {
  return mode === 'canvas' ? { [EDITABLE_TEXT_ATTRIBUTE]: path } : NONE
}

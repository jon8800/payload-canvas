import type { RenderMode } from './types'

/** The canvas attribute that marks the element holding a text prop. */
export const EDITABLE_TEXT_ATTRIBUTE = 'data-builder-text'

/** The canvas attribute that marks the element showing an upload prop (an image, a video, a background). */
export const EDITABLE_IMAGE_ATTRIBUTE = 'data-builder-image'

const NONE: Record<string, string> = {}

/**
 * Marks the element that shows a text prop, so the canvas can edit it in place (double-click).
 * `path` is the prop path: "text", or "items.2.text" for a field inside an array row.
 * Spread it on the element whose only content is that text. On the site it returns no attributes.
 *
 * The element must render the text and nothing else (line breaks as `<br>` are fine). Text,
 * textarea and richText fields can be edited this way.
 *
 * Optional: without marks, the canvas finds elements whose text equals a prop by itself. Marks
 * win, and they also work when the text alone does not say which prop it is.
 */
export function editableText(mode: RenderMode, path: string): Record<string, string> {
  return mode === 'canvas' ? { [EDITABLE_TEXT_ATTRIBUTE]: path } : NONE
}

/**
 * Marks the element that shows an upload prop, so the canvas can replace it in place (hover shows
 * "Replace", double-click opens the media popover, a dropped file replaces it). `path` is the prop
 * path of the upload field: "image", or "photos.3.image" inside an array row. Spread it on the
 * `<img>`, the `<video>`, the element with the background image, or the placeholder shown while
 * the field is empty. On the site it returns no attributes.
 *
 * Optional: without marks, the canvas matches image URLs to the block's uploads by itself. A mark
 * is needed for an empty field (no URL to match) and wins over the automatic match.
 */
export function editableImage(mode: RenderMode, path: string): Record<string, string> {
  return mode === 'canvas' ? { [EDITABLE_IMAGE_ATTRIBUTE]: path } : NONE
}

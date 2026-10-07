// The aspect ratios the plugin offers. Client-safe: the editor's Generate action uses them too.

import type { AiImageAspectRatio } from '../types'

/** Every ratio the plugin offers: square, then landscape and portrait pairs. */
export const IMAGE_ASPECT_RATIOS: readonly AiImageAspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']

export function isAspectRatio(value: unknown): value is AiImageAspectRatio {
  return typeof value === 'string' && (IMAGE_ASPECT_RATIOS as readonly string[]).includes(value)
}

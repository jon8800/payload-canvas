// The names of the site's icons for the `icon` block. Plain strings, so `builder.ts` (and with it
// the Payload config) loads no React. The components are in `icons.ts`.
export const ICON_NAMES = ['arrow-right', 'check', 'mail', 'phone', 'map-pin', 'star', 'sparkles', 'quote'] as const

export type IconName = (typeof ICON_NAMES)[number]

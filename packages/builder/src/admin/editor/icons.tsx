'use client'

// The editor's icon set: 16 px grid, 1.5 px stroke, `currentColor`. No icon dependency.
// Block icons are looked up by name (`BlockDefinition.icon`); unknown names get the generic icon.

import type { ReactNode } from 'react'

const dot = (cx: number, cy: number, r = 0.9) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />

const PATHS = {
  // Blocks
  stack: (
    <>
      <rect x="2" y="2" width="12" height="3.5" rx="1" />
      <rect x="2" y="6.25" width="12" height="3.5" rx="1" />
      <rect x="2" y="10.5" width="12" height="3.5" rx="1" />
    </>
  ),
  grid: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  heading: <path d="M4 3v10M12 3v10M4 8h8" />,
  text: <path d="M3.5 3.5h9M8 3.5V13M6.25 13h3.5" />,
  richText: <path d="M10 3v10M12.5 3v10M13.5 3H7.25a2.75 2.75 0 0 0 0 5.5H10" />,
  image: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <circle cx="5.75" cy="6" r="1.25" />
      <path d="m14 10.5-3.25-3.25L4 13.5" />
    </>
  ),
  button: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="3.5" />
      <path d="M5.5 8h5" />
    </>
  ),
  link: <path d="m6.25 9.75 3.5-3.5M7.25 4.25l1-1a2.83 2.83 0 0 1 4 4l-1 1M8.75 11.75l-1 1a2.83 2.83 0 0 1-4-4l1-1" />,
  list: (
    <>
      {dot(3, 4)}
      {dot(3, 8)}
      {dot(3, 12)}
      <path d="M6 4h8M6 8h8M6 12h8" />
    </>
  ),
  quote: (
    <path d="M2.5 7.5h3.5V12H2.5V7.5Zm0 0c0-2 .9-3.4 2.75-4M9.5 7.5H13V12H9.5V7.5Zm0 0c0-2 .9-3.4 2.75-4" />
  ),
  divider: (
    <>
      <path d="M1.5 8h13" />
      <path d="M4 4.5h8M4 11.5h8" opacity={0.4} />
    </>
  ),
  spacer: <path d="M2.5 2.5h11M2.5 13.5h11M8 5.25v5.5M6.25 7 8 5.25 9.75 7M6.25 9 8 10.75 9.75 9" />,
  video: (
    <>
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
      <path d="M6.75 5.75v4.5L10.5 8 6.75 5.75Z" />
    </>
  ),
  form: (
    <>
      <rect x="2" y="2" width="12" height="3.5" rx="1" />
      <rect x="2" y="7" width="12" height="3.5" rx="1" />
      <path d="M2.5 13.5h4" />
    </>
  ),
  block: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M2.5 6.5h11" />
    </>
  ),
  section: (
    <>
      <rect x="2" y="2" width="12" height="4.5" rx="1" />
      <rect x="2" y="8.5" width="5" height="5.5" rx="1" />
      <rect x="9" y="8.5" width="5" height="5.5" rx="1" />
    </>
  ),
  layers: <path d="m8 2 6 3-6 3-6-3 6-3ZM2 8l6 3 6-3M2 11l6 3 6-3" />,
  // Dynamic blocks (templates and binding)
  field: (
    <>
      <path d="M5.5 2.5H5A1.5 1.5 0 0 0 3.5 4v2.25L2.25 8 3.5 9.75V12A1.5 1.5 0 0 0 5 13.5h.5" />
      <path d="M10.5 2.5h.5A1.5 1.5 0 0 1 12.5 4v2.25L13.75 8 12.5 9.75V12a1.5 1.5 0 0 1-1.5 1.5h-.5" />
      <path d="M6.5 8h3" />
    </>
  ),
  collectionList: (
    <>
      <rect x="2" y="2" width="12" height="5" rx="1" />
      <rect x="2" y="9" width="12" height="5" rx="1" opacity={0.45} />
      <path d="M4.5 4.5h4" />
      <path d="M4.5 11.5h4" opacity={0.45} />
    </>
  ),
  bind: (
    <>
      <ellipse cx="8" cy="3.75" rx="5" ry="1.75" />
      <path d="M3 3.75v8.5c0 .97 2.24 1.75 5 1.75s5-.78 5-1.75v-8.5M3 8c0 .97 2.24 1.75 5 1.75S13 8.97 13 8" />
    </>
  ),
  template: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2 1.6" />
      <path d="M5 5.5h6M5 8h3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.25 1.75v2.5M10.75 1.75v2.5" />
    </>
  ),
  mail: (
    <>
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
      <path d="m2 4 6 4.75L14 4" />
    </>
  ),
  relation: (
    <>
      <rect x="2" y="5.5" width="8.5" height="8.5" rx="1.5" />
      <path d="M8 2h6v6M14 2 8.5 7.5" />
    </>
  ),
  folder: <path d="M1.75 4.25A1.25 1.25 0 0 1 3 3h3l1.5 1.75H13a1.25 1.25 0 0 1 1.25 1.25v6A1.25 1.25 0 0 1 13 13.25H3A1.25 1.25 0 0 1 1.75 12V4.25Z" />,
  select: (
    <>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="m9.5 7 1.5 1.5L12.5 7" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2 14.5 13.5h-13L8 2Z" />
      <path d="M8 6.5v3" />
      {dot(8, 11.5, 0.8)}
    </>
  ),
  unlink: <path d="m5.5 2.5.5 1.5M2.5 5.5l1.5.5M7.25 4.25l1-1a2.83 2.83 0 0 1 4 4l-1 1M8.75 11.75l-1 1a2.83 2.83 0 0 1-4-4l1-1M10.5 13.5 10 12M13.5 10.5 12 10" />,

  // Actions
  drag: (
    <>
      {dot(6, 3.5)}
      {dot(10, 3.5)}
      {dot(6, 8)}
      {dot(10, 8)}
      {dot(6, 12.5)}
      {dot(10, 12.5)}
    </>
  ),
  duplicate: (
    <>
      <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" />
      <path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2M9.75 8v4M7.75 10h4" />
    </>
  ),
  delete: (
    <path d="M2.5 4.5h11M6.25 4.5V3a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v1.5M4 4.5l.6 8.1A1.5 1.5 0 0 0 6.1 14h3.8a1.5 1.5 0 0 0 1.5-1.4l.6-8.1M6.75 7.5v3.5M9.25 7.5v3.5" />
  ),
  up: <path d="M8 13.5v-11M4 6.5l4-4 4 4" />,
  down: <path d="M8 2.5v11M4 9.5l4 4 4-4" />,
  parent: <path d="M3 9.5v3.5h10V9.5M8 10.5V2.5M5 5.5l3-3 3 3" />,
  eye: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  eyeOff: (
    <path d="M4.25 4.85C2.5 6 1.5 8 1.5 8S4 12.5 8 12.5c1.3 0 2.45-.45 3.4-1.1M6.6 3.65c.45-.1.9-.15 1.4-.15 4 0 6.5 4.5 6.5 4.5s-.5.95-1.4 1.95M2 2l12 12M6.6 6.6a2 2 0 0 0 2.8 2.8" />
  ),
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  undo: <path d="M3.5 6.5H10a3.5 3.5 0 0 1 0 7H7.5M6 3.5l-3 3 3 3" />,
  redo: <path d="M12.5 6.5H6a3.5 3.5 0 0 0 0 7h2.5M10 3.5l3 3-3 3" />,
  desktop: (
    <>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5.5 14h5M8 11.5V14" />
    </>
  ),
  tablet: (
    <>
      <rect x="3" y="1.5" width="10" height="13" rx="1.5" />
      <path d="M7 12h2" />
    </>
  ),
  mobile: (
    <>
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
      <path d="M7.25 12h1.5" />
    </>
  ),
  width: <path d="M1.5 3v10M14.5 3v10M4 8h8M6 6 4 8l2 2M10 6l2 2-2 2" />,
  chevronRight: <path d="m6 4 4 4-4 4" />,
  chevronDown: <path d="m4 6 4 4 4-4" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" />
      <path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2" />
    </>
  ),
  paste: (
    <>
      <path d="M10.5 3h1A1.5 1.5 0 0 1 13 4.5v8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-8A1.5 1.5 0 0 1 4.5 3h1" />
      <rect x="5.5" y="1.5" width="5" height="3" rx="0.75" />
    </>
  ),
  more: (
    <>
      {dot(3.5, 8, 1.1)}
      {dot(8, 8, 1.1)}
      {dot(12.5, 8, 1.1)}
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.25 6.25a1.75 1.75 0 1 1 2.5 1.6c-.5.25-.75.6-.75 1.15v.5" />
      {dot(8, 11.5, 0.8)}
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  menu: <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />,
  left: <path d="M13.5 8h-11M6.5 4l-4 4 4 4" />,
  right: <path d="M2.5 8h11M9.5 4l4 4-4 4" />,
  rename: <path d="M2.5 12.5h11M3.5 10.5 10 4l2 2-6.5 6.5h-2v-2Z" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  check: <path d="m3 8.5 3 3 7-7" />,
  hash: <path d="M3 6h10.5M2.5 10H13M6.75 2.5l-1 11M10.25 2.5l-1 11" />,
  keyboard: (
    <>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M4.5 6.5h.01M7 6.5h.01M9.5 6.5h.01M12 6.5h.01M5 9.5h6" />
    </>
  ),
  cursor: <path d="m3 2.5 9.5 4-4 1.5-1.5 4-4-9.5Z" />,
  sparkle: <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8l5.1-1.4L8 1.5Z" />,
  // Assistant
  arrowUp: <path d="M8 13V3.5M4 7.5l4-4 4 4" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />,
  compose: <path d="M13.5 9v3.5a1.5 1.5 0 0 1-1.5 1.5H3.5A1.5 1.5 0 0 1 2 12.5V4a1.5 1.5 0 0 1 1.5-1.5H7M11.25 2.25a1.4 1.4 0 0 1 2 2L8 9.5 5.5 10.5l1-2.5 4.75-5.75Z" />,
  key: (
    <>
      <circle cx="5.5" cy="10.5" r="3" />
      <path d="m7.6 8.4 5.9-5.9M11.5 4.5l1.5 1.5M10 6l1.25 1.25" />
    </>
  ),
  external: <path d="M9.5 2.5h4v4M13.5 2.5 8 8M12 9.5V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V5.5A1.5 1.5 0 0 1 4 4h2.5" />,
  retry: <path d="M13 3.5v3h-3M12.6 6.5A5 5 0 1 0 13 9.5" />,
  back: <path d="M13 8H3.5M7.5 4 3.5 8l4 4" />,
  settings: (
    <>
      <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
      <circle cx="10" cy="4.5" r="1.5" />
      <circle cx="6" cy="11.5" r="1.5" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 14c.6-2.6 2.75-4.25 5.25-4.25S12.65 11.4 13.25 14" />
    </>
  ),
  // Animations: a ball with speed lines (blocks with motion, "Play animations"), and play (Preview).
  motion: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M1.5 8h3M2.5 5h2.5M2.5 11h2.5" />
    </>
  ),
  play: <path d="M5 3.25v9.5L12.75 8 5 3.25Z" />,
  // Languages (the locale switcher).
  globe: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.75 1.7 2.6 3.7 2.6 6S9.75 12.3 8 14c-1.75-1.7-2.6-3.7-2.6-6S6.25 3.7 8 2Z" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 16 16"
      width={size}
    >
      {PATHS[name]}
    </svg>
  )
}

/** Icon for a block definition's `icon` name. Unknown names get the generic block icon. */
export function BlockIcon({ name, size }: { name: string | undefined; size?: number }) {
  const known = name && Object.hasOwn(PATHS, name) ? (name as IconName) : 'block'
  return <Icon name={known} size={size} />
}

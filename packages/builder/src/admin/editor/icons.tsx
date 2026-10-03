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
  parent: <path d="M13 13.5V9a3 3 0 0 0-3-3H3M6 3 3 6l3 3" />,
  eye: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  eyeOff: (
    <path d="M4.25 4.85C2.5 6 1.5 8 1.5 8S4 12.5 8 12.5c1.3 0 2.45-.45 3.4-1.1M6.6 3.65c.45-.1.9-.15 1.4-.15 4 0 6.5 4.5 6.5 4.5s-.5.95-1.4 1.95M2 2l12 12M6.6 6.6a2 2 0 0 0 2.8 2.8" />
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
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 14c.6-2.6 2.75-4.25 5.25-4.25S12.65 11.4 13.25 14" />
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

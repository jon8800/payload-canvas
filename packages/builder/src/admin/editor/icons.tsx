'use client'

// Small stroke icons (Lucide shapes) inlined, so the admin needs no icon dependency.

import type { ReactNode } from 'react'

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  )
}

type P = { size?: number }

export const UndoIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
)
export const RedoIcon = (p: P) => (
  <Icon {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
)
export const DesktopIcon = (p: P) => (
  <Icon {...p}>
    <rect height="14" rx="2" width="20" x="2" y="3" />
    <path d="M8 21h8M12 17v4" />
  </Icon>
)
export const TabletIcon = (p: P) => (
  <Icon {...p}>
    <rect height="20" rx="2" width="16" x="4" y="2" />
    <path d="M12 18h.01" />
  </Icon>
)
export const MobileIcon = (p: P) => (
  <Icon {...p}>
    <rect height="20" rx="2" width="14" x="5" y="2" />
    <path d="M12 18h.01" />
  </Icon>
)
export const GripIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="5" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="9" cy="19" r="1" />
    <circle cx="15" cy="5" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="15" cy="19" r="1" />
  </Icon>
)
export const ArrowUpIcon = (p: P) => (
  <Icon {...p}>
    <path d="m5 12 7-7 7 7M12 19V5" />
  </Icon>
)
export const ArrowDownIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Icon>
)
export const CopyIcon = (p: P) => (
  <Icon {...p}>
    <rect height="14" rx="2" width="14" x="8" y="8" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Icon>
)
export const TrashIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </Icon>
)
export const ParentIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
  </Icon>
)
